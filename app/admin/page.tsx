'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Utensils, QrCode, CheckCircle, XCircle, Clock, MapPin, Plus, Printer, RefreshCw, AlertCircle, ShoppingBag, Edit3, Trash2, Sparkles, Check, Camera, Image as ImageIcon, LogOut } from 'lucide-react';
import { Branch, Order, RestaurantTable, MenuItem, BuffetRegistration, BuffetBooking, MenuCategory, OrderStatus } from '@/lib/types';
import { BranchService } from '@/lib/services/branch-service';
import { OrderService } from '@/lib/services/order-service';
import { QRService } from '@/lib/services/qr-service';
import { MenuService } from '@/lib/services/menu-service';
import { BuffetService } from '@/lib/services/buffet-service';
import { AuthService, AuthenticatedUser } from '@/lib/services/auth-service';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';

export default function BranchAdminPortal() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('b1000000-0000-0000-0000-000000000001');
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [buffets, setBuffets] = useState<BuffetRegistration[]>([]);
  const [buffetBookings, setBuffetBookings] = useState<BuffetBooking[]>([]);
  const [adminUser, setAdminUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'orders' | 'tables' | 'menu' | 'buffet'>('orders');
  
  // New Table modal state
  const [newTableNumber, setNewTableNumber] = useState('');
  const [qrModalData, setQrModalData] = useState<{ tableNumber: string; qrUrl: string; tokenUrl: string } | null>(null);

  // Menu Product Editor State
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState(0);
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80');

  // File input ref for camera & gallery photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Buffet Creator State
  const [buffetTitle, setBuffetTitle] = useState('');
  const [buffetPrice, setBuffetPrice] = useState(1850);
  const [buffetDate, setBuffetDate] = useState('Every Saturday & Sunday');
  const [buffetDishes, setBuffetDishes] = useState('Chicken Karahi, White Handi, Malai Boti, Seekh Kabab, Biryani, Chowmain, Ice Cream');
  
  // QR Scan Check-in State
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    async function initAdmin() {
      const user = await AuthService.fetchCurrentUser();
      if (!user || (user.role !== 'BRANCH_ADMIN' && user.role !== 'OWNER')) {
        router.push('/admin/login');
        return;
      }

      setAdminUser(user);

      const b = await BranchService.getBranches();
      setBranches(b);

      if (user.role === 'BRANCH_ADMIN' && user.branch_id) {
        setSelectedBranchId(user.branch_id);
      } else if (b.length > 0) {
        setSelectedBranchId(b[0].id);
      }

      setLoading(false);
    }

    initAdmin();
  }, [router]);

  useEffect(() => {
    if (!adminUser) return;

    loadBranchData(selectedBranchId);

    const unsubscribe = OrderService.subscribe((updatedOrder) => {
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === updatedOrder.id);
        if (exists) {
          return prev.map((o) =>
            o.id === updatedOrder.id
              ? {
                  ...o,
                  ...updatedOrder,
                  items: updatedOrder.items && updatedOrder.items.length > 0 ? updatedOrder.items : o.items,
                  history: updatedOrder.history && updatedOrder.history.length > 0 ? updatedOrder.history : o.history,
                }
              : o
          );
        } else {
          if (selectedBranchId === 'all' || updatedOrder.branch_id === selectedBranchId) {
            return [updatedOrder, ...prev];
          }
          return prev;
        }
      });
    });

    return () => unsubscribe();
  }, [selectedBranchId, adminUser]);

  async function loadBranchData(branchId: string) {
    const oList = await OrderService.getOrders(branchId === 'all' ? undefined : { branchId });
    const targetBranch = branchId === 'all' ? 'b1000000-0000-0000-0000-000000000001' : branchId;
    const tList = await QRService.getTablesByBranch(targetBranch);
    const mList = await MenuService.getMenuItems();
    const cList = await MenuService.getCategories();
    const bList = await BuffetService.getActiveBuffets(targetBranch);
    if (bList.length > 0) {
      const bkList = await BuffetService.getBookingsForBuffet(bList[0].id);
      setBuffetBookings(bkList);
    }
    setOrders([...oList]);
    setTables([...tList]);
    setMenuItems([...mList]);
    setCategories([...cList]);
    setBuffets([...bList]);
  }

  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    // Optimistic UI update: immediately reflect change on screen
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );

    try {
      const userId = adminUser?.id || '20000000-0000-0000-0000-000000000002';
      await OrderService.updateOrderStatus(orderId, nextStatus, userId, `Branch admin marked ${nextStatus}`);
      await loadBranchData(selectedBranchId);
    } catch (err: any) {
      console.error('Admin status update error:', err);
      await loadBranchData(selectedBranchId);
    }
  };

  const handleLogout = async () => {
    await AuthService.logout();
    router.push('/admin/login');
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber) return;
    await QRService.createTable(selectedBranchId, newTableNumber);
    setNewTableNumber('');
    loadBranchData(selectedBranchId);
  };

  const handleGenerateQRModal = async (t: RestaurantTable) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const fullUrl = `${appUrl}/table/${t.qr_code_token}`;
    const qrDataUrl = await QRCode.toDataURL(fullUrl, { width: 300, margin: 2 });
    setQrModalData({ tableNumber: t.table_number, qrUrl: qrDataUrl, tokenUrl: fullUrl });
  };

  // Handle Photo Upload from Gallery or Camera
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setItemImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName || !itemPrice || !itemCategoryId) return;

    if (editingItem) {
      await MenuService.updateMenuItem(editingItem.id, {
        name: itemName,
        description: itemDesc,
        base_price: itemPrice,
        category_id: itemCategoryId,
        image_url: itemImageUrl,
      });
    } else {
      await MenuService.addMenuItem({
        category_id: itemCategoryId,
        name: itemName,
        description: itemDesc,
        base_price: itemPrice,
        has_variants: false,
        image_url: itemImageUrl,
        is_available: true,
        sort_order: menuItems.length + 1,
      });
    }

    setEditingItem(null);
    setItemName('');
    setItemDesc('');
    setItemPrice(0);
    loadBranchData(selectedBranchId);
  };

  const handleCreateBuffet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buffetTitle || !buffetPrice) return;

    await BuffetService.createBuffet({
      branch_id: selectedBranchId,
      title: buffetTitle,
      description: 'Unlimited dishes open buffet event',
      dishes_list: buffetDishes.split(',').map((d) => d.trim()),
      price_per_head: buffetPrice,
      event_date: buffetDate,
      start_time: '07:00 PM',
      end_time: '11:00 PM',
      banner_image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&auto=format&fit=crop&q=80',
      is_active: true,
    });

    setBuffetTitle('');
    loadBranchData(selectedBranchId);
  };

  const handleCheckInBuffetToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTokenInput) return;

    const ok = await BuffetService.checkInBooking(verifyTokenInput);
    if (ok) {
      setScanMessage(`Ticket Verified! Customer Checked In.`);
      loadBranchData(selectedBranchId);
    } else {
      setScanMessage(`Invalid or non-existent ticket token.`);
    }
  };

  const activeBranch = branches.find((b) => b.id === selectedBranchId);

  // Statistics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'PENDING').length;
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING').length;
  const totalSales = orders.reduce((sum, o) => sum + o.total_amount, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-4 sm:px-8 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white flex items-center gap-2">
                BRANCH ADMIN PORTAL
              </h1>
              <p className="text-xs text-slate-400">Managing Orders, Tables, Menu & Open Buffet</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {adminUser?.role === 'OWNER' ? (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400 hidden sm:block" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs font-bold text-amber-400 px-3 py-2 rounded-xl focus:outline-none"
                >
                  <option value="all">🌐 All Branches (All Orders)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">
                  {branches.find((b) => b.id === selectedBranchId)?.name || 'Assigned Branch'}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">
        
        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase font-semibold text-slate-500">Total Orders</span>
            <p className="text-2xl font-black text-white mt-1">{totalOrders}</p>
          </div>
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <span className="text-[10px] uppercase font-semibold text-amber-400">Pending Approval</span>
            <p className="text-2xl font-black text-amber-400 mt-1">{pendingOrders}</p>
          </div>
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30">
            <span className="text-[10px] uppercase font-semibold text-blue-400">Kitchen Preparing</span>
            <p className="text-2xl font-black text-blue-400 mt-1">{preparingOrders}</p>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
            <span className="text-[10px] uppercase font-semibold text-emerald-400">Total Sales</span>
            <p className="text-2xl font-black text-emerald-400 mt-1">Rs. {totalSales}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'orders'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Live Orders ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'tables'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Tables & QR Codes ({tables.length})
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'menu'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Menu Product Manager ({menuItems.length})
          </button>
          <button
            onClick={() => setActiveTab('buffet')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'buffet'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Open Buffet Manager ({buffets.length})
          </button>
        </div>

        {/* TAB 1: Live Orders */}
        {activeTab === 'orders' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Branch Incoming Orders</h3>
              <button
                onClick={() => loadBranchData(selectedBranchId)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-4">Order #</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Items</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/40">
                      <td className="p-4 font-black text-amber-400">{o.order_number}</td>
                      <td className="p-4 font-bold text-white">
                        {o.order_type} {o.table_id ? `(${o.table_id})` : ''}
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-white block">{o.customer_name}</span>
                        <span className="text-[10px] text-slate-400">{o.customer_phone}</span>
                      </td>
                      <td className="p-4">
                        {o.items?.map((item, i) => (
                          <span key={i} className="block text-slate-300">
                            {item.quantity}x {item.item_name}
                          </span>
                        ))}
                      </td>
                      <td className="p-4 font-black text-white">Rs. {o.total_amount}</td>
                      <td className="p-4">
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {o.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(o.id, 'CONFIRMED')}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                              >
                                Approve & Send to Kitchen
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(o.id, 'REJECTED')}
                                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 font-bold rounded-lg text-xs transition-all active:scale-95 cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {o.status === 'CONFIRMED' && (
                            <>
                              <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                In Kitchen Queue
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(o.id, 'PREPARING')}
                                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                              >
                                Start Cooking 🍳
                              </button>
                            </>
                          )}
                          {o.status === 'PREPARING' && (
                            <>
                              <span className="text-[11px] font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
                                Cooking 🍳
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(o.id, 'READY')}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                              >
                                Mark Ready 🍲
                              </button>
                            </>
                          )}
                          {o.status === 'READY' && (
                            <>
                              {o.order_type === 'DELIVERY' ? (
                                <>
                                  <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                                    Ready for Delivery 🛵
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(o.id, 'OUT_FOR_DELIVERY')}
                                    className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                                  >
                                    Dispatch 🛵
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(o.id, 'COMPLETED')}
                                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                                >
                                  Complete & Served ✅
                                </button>
                              )}
                            </>
                          )}
                          {(o.status === 'ASSIGNED' || o.status === 'PICKED_UP') && (
                            <>
                              <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                Rider Assigned 🛵
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(o.id, 'OUT_FOR_DELIVERY')}
                                className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                              >
                                Out for Delivery 🛵
                              </button>
                            </>
                          )}
                          {o.status === 'OUT_FOR_DELIVERY' && (
                            <>
                              <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                                On The Way 🛵
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(o.id, 'DELIVERED')}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                              >
                                Mark Delivered ✅
                              </button>
                            </>
                          )}
                          {o.status === 'DELIVERED' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(o.id, 'COMPLETED')}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-lg text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              Mark Completed ✅
                            </button>
                          )}
                          {o.status === 'COMPLETED' && (
                            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                              Completed ✅
                            </span>
                          )}
                          {o.status === 'REJECTED' && (
                            <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                              Rejected ❌
                            </span>
                          )}
                          {o.status === 'CANCELLED' && (
                            <span className="text-[11px] font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                              Cancelled 🚫
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Tables & QR Codes */}
        {activeTab === 'tables' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h3 className="text-sm font-bold text-white mb-3">Register New Dining Table</h3>
              <form onSubmit={handleCreateTable} className="flex gap-4 max-w-md">
                <input
                  type="text"
                  placeholder="e.g. T-14"
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Create Table
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tables.map((t) => (
                <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Table</span>
                      <h4 className="text-xl font-black text-white">{t.table_number}</h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                      Active
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 truncate font-mono">Token: {t.qr_code_token}</p>

                  <button
                    onClick={() => handleGenerateQRModal(t)}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <QrCode className="w-4 h-4" /> View & Print QR Code
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: Menu Product Manager (With Gallery & Camera Photo Upload) */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Editor Form */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-black text-white border-b border-slate-800 pb-3">
                {editingItem ? `Edit Product: ${editingItem.name}` : 'Add New Menu Item'}
              </h3>

              <form onSubmit={handleSaveMenuItem} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Product Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Special Zinger Burger"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Category</label>
                  <select
                    value={itemCategoryId}
                    onChange={(e) => setItemCategoryId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Price (Rs.)</label>
                  <input
                    type="number"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Description</label>
                  <textarea
                    placeholder="Product ingredients & details..."
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Picture Upload from Gallery or Camera */}
                <div className="space-y-2">
                  <label className="font-semibold text-slate-400 block">Product Picture</label>
                  
                  {/* File Upload Input (Hidden, triggered by buttons) */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <ImageIcon className="w-4 h-4" /> Device Gallery
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.setAttribute('capture', 'environment');
                          fileInputRef.current.click();
                        }
                      }}
                      className="flex-1 py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Camera className="w-4 h-4" /> Camera
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Or enter Image URL (e.g. https://...)"
                    value={itemImageUrl}
                    onChange={(e) => setItemImageUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  {editingItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setItemName('');
                        setItemDesc('');
                        setItemPrice(0);
                      }}
                      className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl uppercase tracking-wider"
                  >
                    {editingItem ? 'Save Updates' : 'Add Item'}
                  </button>
                </div>
              </form>
            </div>

            {/* Menu List */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-black text-white border-b border-slate-800 pb-3">Menu Product Catalog</h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {menuItems.map((item) => (
                  <div key={item.id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-white">{item.name}</h4>
                      <span className="text-xs font-black text-amber-400">Rs. {item.base_price}</span>
                      {item.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setItemName(item.name);
                          setItemDesc(item.description || '');
                          setItemPrice(item.base_price);
                          setItemCategoryId(item.category_id);
                          setItemImageUrl(item.image_url || '');
                        }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-amber-500 text-amber-400 hover:text-slate-950 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          await MenuService.deleteMenuItem(item.id);
                          loadBranchData(selectedBranchId);
                        }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500 text-rose-400 hover:text-white transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: Open Buffet Manager & Ticket QR Verifier */}
        {activeTab === 'buffet' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Create Buffet */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-black text-white border-b border-slate-800 pb-3">Open Buffet Event Registration</h3>
              
              <form onSubmit={handleCreateBuffet} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Event Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Royal Weekend Open Buffet"
                    value={buffetTitle}
                    onChange={(e) => setBuffetTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Price Per Head (Rs.)</label>
                  <input
                    type="number"
                    value={buffetPrice}
                    onChange={(e) => setBuffetPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Dishes List (comma separated)</label>
                  <textarea
                    value={buffetDishes}
                    onChange={(e) => setBuffetDishes(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl uppercase tracking-wider"
                >
                  Publish Open Buffet Event
                </button>
              </form>
            </div>

            {/* Customer QR Ticket Scanner / Verifier */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h3 className="text-base font-black text-white border-b border-slate-800 pb-3">Scan / Verify Customer Buffet Ticket</h3>
                
                {scanMessage && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                    {scanMessage}
                  </div>
                )}

                <form onSubmit={handleCheckInBuffetToken} className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Enter Customer Ticket QR Token (e.g. buffet_qr_...)"
                    value={verifyTokenInput}
                    onChange={(e) => setVerifyTokenInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Verify Ticket
                  </button>
                </form>
              </div>

              {/* Registrations List */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h3 className="text-base font-black text-white border-b border-slate-800 pb-3">Registered Customer Ticket Bookings</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1 text-xs">
                  {buffetBookings.length === 0 ? (
                    <div className="p-4 text-center text-slate-500">No buffet bookings registered yet.</div>
                  ) : (
                    buffetBookings.map((b) => (
                      <div key={b.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white block">{b.customer_name} ({b.guests_count} Guests)</span>
                          <span className="text-[10px] text-slate-500 font-mono">Token: {b.qr_ticket_token}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                          b.status === 'CHECKED_IN'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {b.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* QR Code Printable Modal */}
      {qrModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-white">Table {qrModalData.tableNumber} QR Code</h3>
            <p className="text-xs text-slate-400">{activeBranch?.name}</p>

            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrModalData.qrUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
            </div>

            <p className="text-[10px] text-slate-500 font-mono break-all bg-slate-950 p-2 rounded-xl border border-slate-800">
              {qrModalData.tokenUrl}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setQrModalData(null)}
                className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Print QR
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, TrendingUp, DollarSign, ShoppingBag, MapPin, Users, ToggleLeft, ToggleRight, PieChart, BarChart3, CreditCard, Landmark, Smartphone, Check, Save, LogOut, Utensils, Edit3, Trash2, Bike } from 'lucide-react';
import { Branch, Order, Profile, MenuItem, DeliveryZone } from '@/lib/types';
import { BranchService } from '@/lib/services/branch-service';
import { OrderService } from '@/lib/services/order-service';
import { MenuService } from '@/lib/services/menu-service';
import { DeliveryZoneService } from '@/lib/services/delivery-zone-service';
import { MerchantConfigService, MerchantBankConfig } from '@/lib/services/merchant-config-service';
import { AuthService, AuthenticatedUser } from '@/lib/services/auth-service';
import { supabase } from '@/lib/supabase/client';

export default function OwnerExecutivePortal() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [ownerInfo, setOwnerInfo] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'analytics' | 'menu' | 'delivery' | 'capabilities' | 'payments' | 'staff'>('analytics');
  
  // Menu Editing for Owner
  const [editingMenuBranchId, setEditingMenuBranchId] = useState<string>('b1000000-0000-0000-0000-000000000001');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [overridePrice, setOverridePrice] = useState<number>(0);
  const [overridePrepTime, setOverridePrepTime] = useState<number>(15);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);

  // Delivery Zone Editing for Owner
  const [editingZoneBranchId, setEditingZoneBranchId] = useState<string>('b1000000-0000-0000-0000-000000000001');
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneFee, setZoneFee] = useState(100);
  const [zoneMinOrder, setZoneMinOrder] = useState(400);
  const [zoneETA, setZoneETA] = useState(35);
  const [zoneActive, setZoneActive] = useState(true);
  const [zoneMessage, setZoneMessage] = useState<string | null>(null);

  // Bank & Merchant Configuration State
  const [bankConfig, setBankConfig] = useState<MerchantBankConfig>({
    bankName: '',
    accountTitle: '',
    accountNumber: '',
    iban: '',
    jazzcashTillNumber: '',
    jazzcashAccountName: '',
    easypaisaTillNumber: '',
    easypaisaAccountName: '',
    isOnlinePaymentActive: true,
  });
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function initOwner() {
      const user = await AuthService.fetchCurrentUser();
      if (!user || user.role !== 'OWNER') {
        router.push('/owner/login');
        return;
      }
      setOwnerInfo(user);
      setLoading(false);
    }
    initOwner();
  }, [router]);

  useEffect(() => {
    if (!ownerInfo) return;
    loadOwnerData();
    MerchantConfigService.getConfig().then(setBankConfig);

    const unsubscribe = OrderService.subscribe(() => {
      loadOwnerData();
    });

    const interval = setInterval(() => {
      loadOwnerData();
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [selectedBranchId, editingMenuBranchId, editingZoneBranchId, ownerInfo]);

  async function loadOwnerData() {
    try {
      const bList = await BranchService.getBranches();
      setBranches(bList);

      const filter = selectedBranchId !== 'ALL' ? { branchId: selectedBranchId } : undefined;
      const oList = await OrderService.getOrders(filter);
      setOrders(oList || []);

      const targetMenuBranch = editingMenuBranchId || (bList.length > 0 ? bList[0].id : 'b1000000-0000-0000-0000-000000000001');
      const mList = await MenuService.getMenuItems({ branchId: targetMenuBranch });
      setMenuItems(mList || []);

      const targetZoneBranch = editingZoneBranchId || (bList.length > 0 ? bList[0].id : 'b1000000-0000-0000-0000-000000000001');
      const zList = await DeliveryZoneService.getDeliveryZones(targetZoneBranch, false);
      setDeliveryZones(zList || []);

      if (supabase) {
        const { data: dbProfiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (dbProfiles) {
          setUsers(dbProfiles);
        }
      }
    } catch (e) {
      console.warn('Owner load error:', e);
    }
  }

  const handleLogout = async () => {
    await AuthService.logout();
    router.push('/owner/login');
  };

  const handleToggleCapability = async (branchId: string, capKey: 'dine_in_enabled' | 'takeaway_enabled' | 'delivery_enabled', currentValue: boolean) => {
    await BranchService.updateBranchCapabilities(branchId, { [capKey]: !currentValue });
    loadOwnerData();
  };

  const handleSaveBankConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await MerchantConfigService.updateConfig(bankConfig);
    setSaveSuccessMessage('Bank & Merchant account details saved successfully!');
    setTimeout(() => setSaveSuccessMessage(null), 4000);
  };

  const handleSaveMenuOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      await MenuService.updateBranchMenuItem(editingMenuBranchId, editingItem.id, {
        price: overridePrice,
        preparation_time: overridePrepTime,
      });
      setMenuMessage(`Branch price for "${editingItem.name}" updated!`);
      setTimeout(() => setMenuMessage(null), 3000);
      setEditingItem(null);
      await loadOwnerData();
    } catch (err: any) {
      setMenuMessage(`Failed to update: ${err.message}`);
    }
  };

  const handleToggleMenuAvailability = async (menuItemId: string) => {
    try {
      await MenuService.toggleBranchItemAvailability(editingMenuBranchId, menuItemId);
      await loadOwnerData();
    } catch (err: any) {
      setMenuMessage(`Failed to toggle: ${err.message}`);
    }
  };

  const handleSaveDeliveryZoneOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName) return;

    try {
      await DeliveryZoneService.saveDeliveryZone({
        id: editingZone?.id,
        branch_id: editingZoneBranchId,
        name: zoneName,
        delivery_fee: zoneFee,
        minimum_order_amount: zoneMinOrder,
        estimated_delivery_minutes: zoneETA,
        is_active: zoneActive,
      });

      setZoneMessage(`Delivery zone "${zoneName}" saved successfully!`);
      setTimeout(() => setZoneMessage(null), 3000);
      setEditingZone(null);
      setZoneName('');
      setZoneFee(100);
      setZoneMinOrder(400);
      setZoneETA(35);
      setZoneActive(true);
      await loadOwnerData();
    } catch (err: any) {
      setZoneMessage(`Failed to save: ${err.message}`);
    }
  };

  const handleDeleteDeliveryZoneOwner = async (zoneId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete delivery zone "${name}"?`)) return;
    try {
      await DeliveryZoneService.deleteDeliveryZone(zoneId);
      setZoneMessage(`Delivery zone "${name}" deleted.`);
      setTimeout(() => setZoneMessage(null), 3000);
      await loadOwnerData();
    } catch (err: any) {
      setZoneMessage(`Failed to delete: ${err.message}`);
    }
  };

  // Financial Metrics
  const totalSales = orders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalOrdersCount = orders.length;
  const averageOrderValue = totalOrdersCount > 0 ? Math.round(totalSales / totalOrdersCount) : 0;

  // Revenue by branch calculation
  const branchSales: Record<string, number> = {};
  branches.forEach((b) => {
    branchSales[b.name] = orders
      .filter((o) => o.branch_id === b.id)
      .reduce((sum, o) => sum + o.total_amount, 0);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                EXECUTIVE OWNER CONTROL
              </h1>
              <p className="text-xs text-slate-400">Owner Portal • Realtime Restaurant Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <MapPin className="w-4 h-4 text-amber-400" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none"
              >
                <option value="ALL" className="bg-slate-900">🌐 All Branches Overview</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900">
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

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

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Total Sales</p>
                <h3 className="text-3xl font-black text-white mt-1">Rs. {totalSales.toLocaleString()}</h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Orders Placed</p>
                <h3 className="text-3xl font-black text-white mt-1">{totalOrdersCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Average Ticket Size</p>
                <h3 className="text-3xl font-black text-white mt-1">Rs. {averageOrderValue}</h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'analytics'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Branch Revenue Comparison
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'menu'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Multi-Branch Menu & Pricing
          </button>
          <button
            onClick={() => setActiveTab('delivery')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'delivery'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Branch Delivery Zones & Fees
          </button>
          <button
            onClick={() => setActiveTab('capabilities')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'capabilities'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Branch Capability Controls
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'payments'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Bank & Merchant Accounts Setup
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'staff'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            System User Roles ({users.length})
          </button>
        </div>

        {/* TAB 1: Branch Analytics */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" /> Revenue Breakdown by Physical Branch
              </h3>

              <div className="space-y-4 pt-2">
                {branches.map((b) => {
                  const rev = branchSales[b.name] || 0;
                  const pct = totalSales > 0 ? Math.round((rev / totalSales) * 100) : 0;

                  return (
                    <div key={b.id} className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-white">{b.name}</span>
                        <span className="text-amber-400">Rs. {rev} ({pct}%)</span>
                      </div>
                      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${pct || 10}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-400" /> Best-Selling Menu Items
              </h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 flex items-center justify-between">
                  <span className="font-bold text-white">June Deal! (Rs. 1495)</span>
                  <span className="text-amber-400 font-black">Top Deal</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 flex items-center justify-between">
                  <span className="font-bold text-white">Royal Platter (Rs. 2495)</span>
                  <span className="text-amber-400 font-black">Top Platter</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 flex items-center justify-between">
                  <span className="font-bold text-white">Zinger Burger (Rs. 350)</span>
                  <span className="text-amber-400 font-black">Top Fast Food</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Multi-Branch Menu & Pricing Control */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-amber-400" />
                  Multi-Branch Menu & Pricing Manager
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Configure independent branch pricing, kitchen preparation times, and stock availability.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 font-semibold">Select Branch:</span>
                <select
                  value={editingMenuBranchId}
                  onChange={(e) => setEditingMenuBranchId(e.target.value)}
                  className="bg-transparent text-xs font-black text-amber-400 focus:outline-none cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {menuMessage && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{menuMessage}</span>
              </div>
            )}

            {/* Quick Edit Drawer if an item is being edited */}
            {editingItem && (
              <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 space-y-4 shadow-xl animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="font-black text-sm text-white flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-amber-400" />
                    Edit Branch Settings for: <span className="text-amber-400">{editingItem.name}</span>
                  </h4>
                  <button
                    onClick={() => setEditingItem(null)}
                    className="text-xs text-slate-400 hover:text-white font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleSaveMenuOverride} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Branch Price (Rs.)</label>
                    <input
                      type="number"
                      value={overridePrice}
                      onChange={(e) => setOverridePrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Prep Time (Minutes)</label>
                    <input
                      type="number"
                      value={overridePrepTime}
                      onChange={(e) => setOverridePrepTime(parseInt(e.target.value) || 15)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl uppercase tracking-wider transition-all"
                    >
                      Save Branch Override
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Menu Items Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-4">Menu Item</th>
                      <th className="p-4">Global Catalog Price</th>
                      <th className="p-4">Selected Branch Price</th>
                      <th className="p-4">Prep Time</th>
                      <th className="p-4">Branch Stock Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {menuItems.map((item) => {
                      const hasPriceOverride = item.price !== undefined && item.price !== item.base_price;
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 font-bold text-white">
                            <div className="flex items-center gap-2">
                              <span>{item.name}</span>
                              {item.item_code && (
                                <span className="text-[10px] text-amber-400 font-mono">#{item.item_code}</span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{item.description}</p>
                            )}
                          </td>
                          <td className="p-4 font-semibold text-slate-400">Rs. {item.base_price}</td>
                          <td className="p-4 font-black">
                            <span className={hasPriceOverride ? 'text-amber-400' : 'text-slate-200'}>
                              Rs. {item.price ?? item.base_price}
                            </span>
                            {hasPriceOverride && (
                              <span className="ml-2 text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-black uppercase">
                                Overridden
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-slate-400">~{item.preparation_time || 15} mins</td>
                          <td className="p-4">
                            <button
                              onClick={() => handleToggleMenuAvailability(item.id)}
                              className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${
                                item.is_available
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                              }`}
                            >
                              {item.is_available ? 'In Stock' : '86 / Sold Out'}
                            </button>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setOverridePrice(item.price ?? item.base_price);
                                setOverridePrepTime(item.preparation_time || 15);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 text-amber-400 hover:text-slate-950 font-bold text-xs transition-colors inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit Settings
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Branch Delivery Zones & Fees Management */}
        {activeTab === 'delivery' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Bike className="w-5 h-5 text-amber-400" />
                  Multi-Branch Delivery Zone & Fee Controls
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Configure delivery pricing, minimum order requirements, and delivery timeframes per branch.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 font-semibold">Branch:</span>
                <select
                  value={editingZoneBranchId}
                  onChange={(e) => setEditingZoneBranchId(e.target.value)}
                  className="bg-transparent text-xs font-black text-amber-400 focus:outline-none cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {zoneMessage && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{zoneMessage}</span>
              </div>
            )}

            {/* Quick Zone Editor Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="font-black text-sm text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  {editingZone ? `Edit Delivery Zone: ${editingZone.name}` : 'Add New Delivery Zone for Selected Branch'}
                </h4>
                {editingZone && (
                  <button
                    onClick={() => {
                      setEditingZone(null);
                      setZoneName('');
                      setZoneFee(100);
                      setZoneMinOrder(400);
                      setZoneETA(35);
                      setZoneActive(true);
                    }}
                    className="text-xs text-slate-400 hover:text-white font-bold"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveDeliveryZoneOwner} className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-xs">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-semibold text-slate-400">Zone Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Model Town / Sector 5"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Delivery Fee (Rs.)</label>
                  <input
                    type="number"
                    min={0}
                    value={zoneFee}
                    onChange={(e) => setZoneFee(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-400">Min. Order (Rs.)</label>
                  <input
                    type="number"
                    min={0}
                    value={zoneMinOrder}
                    onChange={(e) => setZoneMinOrder(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl uppercase tracking-wider transition-all"
                  >
                    {editingZone ? 'Update Zone' : 'Save Zone'}
                  </button>
                </div>
              </form>
            </div>

            {/* Delivery Zones Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-4">Delivery Zone Name</th>
                      <th className="p-4">Delivery Fee</th>
                      <th className="p-4">Minimum Order</th>
                      <th className="p-4">Estimated ETA</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {deliveryZones.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          No delivery zones configured for this branch yet.
                        </td>
                      </tr>
                    ) : (
                      deliveryZones.map((z) => (
                        <tr key={z.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 font-bold text-white">{z.name}</td>
                          <td className="p-4 font-black text-amber-400">Rs. {z.delivery_fee}</td>
                          <td className="p-4 font-semibold text-slate-300">Rs. {z.minimum_order_amount}</td>
                          <td className="p-4 text-slate-400">~{z.estimated_delivery_minutes} mins</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              z.is_active
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                              {z.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setEditingZone(z);
                                setZoneName(z.name);
                                setZoneFee(z.delivery_fee);
                                setZoneMinOrder(z.minimum_order_amount);
                                setZoneETA(z.estimated_delivery_minutes);
                                setZoneActive(z.is_active);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400"
                              title="Edit Zone"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDeliveryZoneOwner(z.id, z.name)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400"
                              title="Delete Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: Branch Capabilities Config */}
        {activeTab === 'capabilities' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white">Database-Driven Branch Capability Toggles</h3>
              <p className="text-xs text-slate-400 mt-1">Enable or disable service offerings dynamically per branch without altering code.</p>
            </div>

            <div className="space-y-4">
              {branches.map((b) => (
                <div key={b.id} className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-lg text-white">{b.name}</h4>
                    <span className="text-xs text-slate-400">{b.address}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
                    
                    {/* Dine-In */}
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                      <span className="font-bold text-slate-300">Dine-In Service</span>
                      <button
                        onClick={() => handleToggleCapability(b.id, 'dine_in_enabled', Boolean(b.capabilities?.dine_in_enabled))}
                        className="text-amber-400"
                      >
                        {b.capabilities?.dine_in_enabled ? <ToggleRight className="w-8 h-8 text-amber-400" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                      </button>
                    </div>

                    {/* Takeaway */}
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                      <span className="font-bold text-slate-300">Takeaway Service</span>
                      <button
                        onClick={() => handleToggleCapability(b.id, 'takeaway_enabled', Boolean(b.capabilities?.takeaway_enabled))}
                        className="text-amber-400"
                      >
                        {b.capabilities?.takeaway_enabled ? <ToggleRight className="w-8 h-8 text-amber-400" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                      </button>
                    </div>

                    {/* Delivery */}
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                      <span className="font-bold text-slate-300">Home Delivery</span>
                      <button
                        onClick={() => handleToggleCapability(b.id, 'delivery_enabled', Boolean(b.capabilities?.delivery_enabled))}
                        className="text-amber-400"
                      >
                        {b.capabilities?.delivery_enabled ? <ToggleRight className="w-8 h-8 text-amber-400" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                      </button>
                    </div>

                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: Bank & Merchant Accounts Configuration Manager */}
        {activeTab === 'payments' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-amber-400" /> Bank Accounts & Merchant Mobile Wallets Setup
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Enter your official Bank Account, IBAN, JazzCash Till Number, and EasyPaisa Merchant details. Customers will see these details on checkout when paying online.
              </p>
            </div>

            {saveSuccessMessage && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4" /> {saveSuccessMessage}
              </div>
            )}

            <form onSubmit={handleSaveBankConfig} className="space-y-6 text-xs">
              
              {/* Bank Account Section */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="font-extrabold text-sm text-amber-400 flex items-center gap-2">
                  <Landmark className="w-4 h-4" /> Bank Account Credentials (HBL / Meezan / MCB / Allied / UBL)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Meezan Bank Limited"
                      value={bankConfig.bankName}
                      onChange={(e) => setBankConfig({ ...bankConfig, bankName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Account Title</label>
                    <input
                      type="text"
                      placeholder="e.g. OK RESTAURANT JAMPUR"
                      value={bankConfig.accountTitle}
                      onChange={(e) => setBankConfig({ ...bankConfig, accountTitle: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Account Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 01020304050607"
                      value={bankConfig.accountNumber}
                      onChange={(e) => setBankConfig({ ...bankConfig, accountNumber: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">IBAN Number</label>
                    <input
                      type="text"
                      placeholder="e.g. PK42 MEZN 0001 0203 0405 0607"
                      value={bankConfig.iban}
                      onChange={(e) => setBankConfig({ ...bankConfig, iban: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* JazzCash Merchant Section */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="font-extrabold text-sm text-rose-400 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> JazzCash Mobile Wallet Credentials
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">JazzCash Till / Mobile Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 0334-4683344"
                      value={bankConfig.jazzcashTillNumber}
                      onChange={(e) => setBankConfig({ ...bankConfig, jazzcashTillNumber: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">JazzCash Account Name</label>
                    <input
                      type="text"
                      placeholder="e.g. OK Restaurant Jampur"
                      value={bankConfig.jazzcashAccountName}
                      onChange={(e) => setBankConfig({ ...bankConfig, jazzcashAccountName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* EasyPaisa Merchant Section */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="font-extrabold text-sm text-emerald-400 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> EasyPaisa Mobile Wallet Credentials
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">EasyPaisa Store / Mobile Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 0336-4683344"
                      value={bankConfig.easypaisaTillNumber}
                      onChange={(e) => setBankConfig({ ...bankConfig, easypaisaTillNumber: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">EasyPaisa Account Name</label>
                    <input
                      type="text"
                      placeholder="e.g. OK Restaurant Jampur"
                      value={bankConfig.easypaisaAccountName}
                      onChange={(e) => setBankConfig({ ...bankConfig, easypaisaAccountName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="py-3.5 px-6 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <Save className="w-4 h-4" /> Save & Update Bank Credentials Across System
              </button>

            </form>
          </div>
        )}

        {/* TAB 4: Staff & User Roles */}
        {activeTab === 'staff' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white">Registered System Users & Role-Based Access</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40">
                      <td className="p-4 font-bold text-white">{u.full_name}</td>
                      <td className="p-4 text-slate-400">{u.email}</td>
                      <td className="p-4 text-slate-400">{u.phone}</td>
                      <td className="p-4 font-black text-amber-400">{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

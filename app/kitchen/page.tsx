'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, Clock, CheckCircle, Utensils, MapPin, RefreshCw, Flame, Sparkles, LogOut, AlertCircle } from 'lucide-react';
import { Branch, Order, OrderStatus } from '@/lib/types';
import { BranchService } from '@/lib/services/branch-service';
import { OrderService } from '@/lib/services/order-service';
import { AuthService, AuthenticatedUser } from '@/lib/services/auth-service';

export default function KitchenDisplaySystem() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('b1000000-0000-0000-0000-000000000001');
  const [orders, setOrders] = useState<Order[]>([]);
  const [chefInfo, setChefInfo] = useState<AuthenticatedUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initChef() {
      const user = await AuthService.fetchCurrentUser();
      if (!user || (user.role !== 'KITCHEN' && user.role !== 'OWNER')) {
        router.push('/kitchen/login');
        return;
      }

      setChefInfo(user);

      const b = await BranchService.getBranches();
      setBranches(b);

      if (user.role === 'KITCHEN' && user.branch_id) {
        setSelectedBranchId(user.branch_id);
      } else if (b.length > 0) {
        setSelectedBranchId(b[0].id);
      }

      setLoading(false);
    }

    initChef();
  }, [router]);

  useEffect(() => {
    if (!chefInfo) return;

    loadKitchenOrders(selectedBranchId);

    const unsubscribe = OrderService.subscribe((updatedOrder) => {
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === updatedOrder.id);
        const isKitchenStatus = ['CONFIRMED', 'PREPARING', 'READY'].includes(updatedOrder.status);

        if (isKitchenStatus) {
          if (exists) {
            return prev.map((o) => (o.id === updatedOrder.id ? { ...o, status: updatedOrder.status } : o));
          } else {
            return [updatedOrder, ...prev];
          }
        } else {
          return prev.filter((o) => o.id !== updatedOrder.id);
        }
      });
    });

    return () => unsubscribe();
  }, [selectedBranchId, chefInfo]);

  async function loadKitchenOrders(branchId: string) {
    const list = await OrderService.getOrders(branchId === 'all' ? undefined : { branchId });
    setOrders(list.filter((o) => ['CONFIRMED', 'PREPARING', 'READY'].includes(o.status)));
  }

  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setErrorMessage(null);

    // Optimistic UI update: instantly update KDS lanes
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );

    try {
      const userId = chefInfo?.id || '30000000-0000-0000-0000-000000000001';
      await OrderService.updateOrderStatus(orderId, nextStatus, userId, `Kitchen marked ${nextStatus}`);
      await loadKitchenOrders(selectedBranchId);
    } catch (err: any) {
      console.error('Kitchen status update error:', err);
      setErrorMessage(`Status update failed: ${err.message}`);
      await loadKitchenOrders(selectedBranchId);
    }
  };

  const handleLogout = async () => {
    await AuthService.logout();
    router.push('/kitchen/login');
  };

  const confirmedOrders = orders.filter((o) => o.status === 'CONFIRMED');
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING');
  const readyOrders = orders.filter((o) => o.status === 'READY');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-amber-400 font-bold text-sm">Loading Kitchen Display...</div>
      </div>
    );
  }

  if (!chefInfo) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* KDS Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                KITCHEN DISPLAY SYSTEM (KDS)
              </h1>
              <p className="text-xs text-slate-400">{chefInfo.full_name} • Realtime Orders</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {chefInfo.role === 'OWNER' && (
              <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <MapPin className="w-4 h-4 text-amber-400" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none"
                >
                  <option value="all" className="bg-slate-900">🌐 All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => loadKitchenOrders(selectedBranchId)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors"
              title="Refresh Orders"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
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

      {errorMessage && (
        <div className="m-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Kanban Board Grid */}
      <main className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Column 1: NEW / CONFIRMED */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-black text-sm text-amber-400 flex items-center gap-2">
              <Flame className="w-4 h-4" /> NEW / CONFIRMED ({confirmedOrders.length})
            </h3>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            {confirmedOrders.map((o) => (
              <div key={o.id} className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 space-y-4 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xl font-black text-white">{o.order_number}</span>
                    <span className="block text-xs font-bold text-amber-400 mt-0.5">
                      {o.order_type} {o.table_id ? `• Table ${o.table_id}` : ''}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg">
                    <Clock className="w-3 h-3 text-amber-400" /> {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="space-y-2 border-t border-b border-slate-800/80 py-3 text-xs">
                  {o.items?.map((item, i) => (
                    <div key={i} className="flex justify-between font-bold text-slate-200">
                      <span>{item.quantity}x {item.item_name} {item.variant_name ? `(${item.variant_name})` : ''}</span>
                      {item.special_instructions && (
                        <span className="text-[10px] text-amber-400 italic block">Note: {item.special_instructions}</span>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleUpdateStatus(o.id, 'PREPARING')}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Start Preparing
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: IN PREPARATION */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-black text-sm text-blue-400 flex items-center gap-2">
              <ChefHat className="w-4 h-4" /> PREPARING ({preparingOrders.length})
            </h3>
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            {preparingOrders.map((o) => (
              <div key={o.id} className="p-5 rounded-2xl bg-slate-900 border border-blue-500/40 space-y-4 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xl font-black text-white">{o.order_number}</span>
                    <span className="block text-xs font-bold text-blue-400 mt-0.5">
                      {o.order_type} {o.table_id ? `• Table ${o.table_id}` : ''}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg">
                    <Clock className="w-3 h-3 text-blue-400" /> Cooking...
                  </span>
                </div>

                <div className="space-y-2 border-t border-b border-slate-800/80 py-3 text-xs">
                  {o.items?.map((item, i) => (
                    <div key={i} className="flex justify-between font-bold text-slate-200">
                      <span>{item.quantity}x {item.item_name} {item.variant_name ? `(${item.variant_name})` : ''}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleUpdateStatus(o.id, 'READY')}
                  className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Mark Ready
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: READY FOR PICKUP / RIDER */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-black text-sm text-emerald-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> READY ({readyOrders.length})
            </h3>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            {readyOrders.map((o) => (
              <div key={o.id} className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 space-y-4 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xl font-black text-white">{o.order_number}</span>
                    <span className="block text-xs font-bold text-emerald-400 mt-0.5">
                      {o.order_type} {o.table_id ? `• Table ${o.table_id}` : ''}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg">
                    Ready
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-300">
                  {o.items?.map((item, i) => (
                    <div key={i} className="flex justify-between font-semibold">
                      <span>{item.quantity}x {item.item_name}</span>
                    </div>
                  ))}
                </div>

                {o.order_type === 'DELIVERY' ? (
                  <div className="w-full py-2.5 px-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold rounded-xl text-xs text-center flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Awaiting Rider Claim & Pickup
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpdateStatus(o.id, 'COMPLETED')}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all"
                  >
                    Complete & Served
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

      </main>

    </div>
  );
}

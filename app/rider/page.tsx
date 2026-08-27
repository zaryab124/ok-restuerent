'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, MapPin, Phone, CheckCircle, Navigation, Clock, AlertCircle, LogOut, Receipt, ExternalLink, MessageSquare, PackageCheck } from 'lucide-react';
import { Order, OrderStatus } from '@/lib/types';
import { OrderService } from '@/lib/services/order-service';
import { AuthService, AuthenticatedUser } from '@/lib/services/auth-service';
import { BranchService } from '@/lib/services/branch-service';
import { OrderReceiptModal } from '@/components/OrderReceiptModal';

export default function RiderPortal() {
  const router = useRouter();
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [myAssignedOrders, setMyAssignedOrders] = useState<Order[]>([]);
  const [riderInfo, setRiderInfo] = useState<AuthenticatedUser | null>(null);
  const [branchName, setBranchName] = useState<string>('Assigned Branch');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  useEffect(() => {
    async function initRider() {
      const user = await AuthService.fetchCurrentUser();
      if (!user || (user.role !== 'RIDER' && user.role !== 'OWNER')) {
        router.push('/rider/login');
        return;
      }

      setRiderInfo(user);

      if (user.branch_id) {
        const branch = await BranchService.getBranchById(user.branch_id);
        if (branch) {
          setBranchName(branch.name);
        }
      }

      setLoading(false);
    }

    initRider();
  }, [router]);

  useEffect(() => {
    if (!riderInfo) return;

    loadRiderData(riderInfo);

    const unsubscribe = OrderService.subscribe(() => {
      loadRiderData(riderInfo);
    });

    const interval = setInterval(() => {
      loadRiderData(riderInfo);
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [riderInfo]);

  async function loadRiderData(currentRider: AuthenticatedUser) {
    try {
      const filter = currentRider.role === 'OWNER' ? undefined : (currentRider.branch_id ? { branchId: currentRider.branch_id } : undefined);
      const allBranchOrders = await OrderService.getOrders(filter);
      
      // Available ready delivery orders not claimed yet
      const readyForClaiming = allBranchOrders.filter(
        (o) => o.status === 'READY' && o.order_type === 'DELIVERY' && !o.rider_assignment
      );
      
      // My claimed/assigned active orders
      const myOrders = allBranchOrders.filter(
        (o) => o.rider_assignment?.rider_id === currentRider.id && ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.status)
      );

      setAvailableOrders(readyForClaiming);
      setMyAssignedOrders(myOrders);
    } catch (e) {
      console.warn('Rider load error:', e);
    }
  }

  const handleClaimOrder = async (orderId: string) => {
    setMessage(null);
    const riderId = riderInfo?.id || '40000000-0000-0000-0000-000000000001';
    const riderName = riderInfo?.full_name || 'Delivery Rider';

    // Optimistic UI update
    setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));

    try {
      const success = await OrderService.claimOrderForRider(orderId, riderId, riderName);
      if (success) {
        setMessage(`Delivery order claimed! Status transitioned to ASSIGNED.`);
      }
      setTimeout(() => {
        if (riderInfo) loadRiderData(riderInfo);
      }, 500);
    } catch (err: any) {
      setMessage(`Claim failed: ${err.message}`);
      if (riderInfo) await loadRiderData(riderInfo);
    }
  };

  const handleUpdateDeliveryStatus = async (orderId: string, nextStatus: OrderStatus) => {
    const riderId = riderInfo?.id || '40000000-0000-0000-0000-000000000001';

    // Optimistic UI update
    setMyAssignedOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );

    try {
      await OrderService.updateOrderStatus(orderId, nextStatus, riderId, `Rider updated status to ${nextStatus}`);
      setMessage(`Delivery status updated to ${nextStatus.replace(/_/g, ' ')}!`);
      setTimeout(() => {
        if (riderInfo) loadRiderData(riderInfo);
      }, 500);
    } catch (err: any) {
      setMessage(`Status update failed: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    await AuthService.logout();
    router.push('/rider/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-amber-400 font-bold text-sm">Loading Rider Portal...</div>
      </div>
    );
  }

  if (!riderInfo) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-extrabold shadow-md shadow-amber-500/20">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">RIDER DELIVERY PORTAL</h1>
              <p className="text-xs text-slate-400 font-semibold">{branchName} Fleet Operations</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xs font-bold text-white block">{riderInfo.full_name}</span>
              <span className="text-[10px] text-emerald-400 font-semibold uppercase flex items-center gap-1 justify-end">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Active • On Duty
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        
        {message && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-2 animate-fadeIn shadow-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Active Delivery Assignments */}
        {myAssignedOrders.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Navigation className="w-5 h-5 text-amber-400 animate-bounce" /> Your Active Deliveries ({myAssignedOrders.length})
            </h2>

            <div className="space-y-6">
              {myAssignedOrders.map((o) => (
                <div key={o.id} className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 space-y-5 shadow-2xl">
                  
                  {/* Order Top Header */}
                  <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                    <div>
                      <span className="text-2xl font-black text-amber-400 block">{o.order_number}</span>
                      <span className="text-xs text-slate-400">Placed: {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedReceiptOrder(o)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5 text-amber-400" /> View Receipt
                      </button>
                      <span className="px-3.5 py-1.5 bg-amber-500/20 text-amber-400 font-extrabold text-xs rounded-xl border border-amber-500/30 uppercase tracking-wide">
                        {o.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* PROMINENT DELIVERY ADDRESS BLOCK */}
                  <div className="bg-slate-950 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-amber-400 flex items-center gap-1.5 tracking-wider">
                        <MapPin className="w-4 h-4 text-amber-400" /> Customer Delivery Destination
                      </span>
                      {o.delivery_address && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <Navigation className="w-3 h-3" /> Open in Google Maps <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    <p className="text-base font-extrabold text-white leading-snug">
                      {o.delivery_address || 'No street address provided (Contact customer directly)'}
                    </p>

                    {o.delivery_notes && (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-amber-300 italic">
                        <strong>Delivery Instruction:</strong> {o.delivery_notes}
                      </div>
                    )}
                  </div>

                  {/* Customer Contact & Quick Actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 border border-slate-800 rounded-2xl p-4 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Customer Name</span>
                      <strong className="text-white text-sm">{o.customer_name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Phone & Direct Actions</span>
                      <div className="flex items-center gap-2 mt-1">
                        <strong className="text-amber-400 font-mono text-sm">{o.customer_phone}</strong>
                        <a
                          href={`tel:${o.customer_phone}`}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1 text-[11px] transition-all"
                        >
                          <Phone className="w-3 h-3" /> Call
                        </a>
                        <a
                          href={`https://wa.me/${o.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${o.customer_name}, your OK Restaurant order #${o.order_number} is on the way!`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1 text-[11px] transition-all"
                        >
                          <MessageSquare className="w-3 h-3" /> WhatsApp
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Package Item Checklist */}
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <span className="text-[11px] font-bold uppercase text-slate-400 flex items-center gap-1.5">
                      <PackageCheck className="w-3.5 h-3.5 text-amber-400" /> Food Items in Package ({o.items?.length || 0})
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {o.items?.map((item, idx) => (
                        <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex justify-between items-center text-xs">
                          <span className="font-bold text-white">
                            <span className="text-amber-400 font-black mr-1.5">{item.quantity}x</span>
                            {item.item_name} {item.variant_name ? `(${item.variant_name})` : ''}
                          </span>
                          <span className="text-slate-400 font-mono">Rs. {item.subtotal_price}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cash Collection Notice */}
                  {o.payment_method === 'CASH' ? (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                      <div>
                        <span className="text-xs uppercase font-bold text-amber-400 block">💵 Cash on Delivery</span>
                        <span className="text-[11px] text-slate-300">Collect full amount in cash from customer</span>
                      </div>
                      <span className="text-2xl font-black text-amber-400">Rs. {o.total_amount}</span>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                      <div>
                        <span className="text-xs uppercase font-bold text-emerald-400 block">💳 Paid Online ({o.payment_method})</span>
                        <span className="text-[11px] text-slate-300">Payment already settled • DO NOT collect cash</span>
                      </div>
                      <span className="text-base font-black text-emerald-400">Rs. 0 (PAID)</span>
                    </div>
                  )}

                  {/* Rider State Machine Actions */}
                  <div className="pt-2">
                    {o.status === 'ASSIGNED' && (
                      <button
                        onClick={() => handleUpdateDeliveryStatus(o.id, 'PICKED_UP')}
                        className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <PackageCheck className="w-4 h-4" /> Confirm Picked Up from Kitchen 📦
                      </button>
                    )}
                    {o.status === 'PICKED_UP' && (
                      <button
                        onClick={() => handleUpdateDeliveryStatus(o.id, 'OUT_FOR_DELIVERY')}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Bike className="w-4 h-4" /> Start Delivery (Out for Delivery) 🛵
                      </button>
                    )}
                    {o.status === 'OUT_FOR_DELIVERY' && (
                      <button
                        onClick={() => handleUpdateDeliveryStatus(o.id, 'DELIVERED')}
                        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" /> Mark Successfully Delivered to Customer ✅
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Delivery Orders Pool */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" /> Available Delivery Pool ({availableOrders.length})
            </h2>
            <span className="text-xs text-slate-400">Ready Orders Awaiting Rider</span>
          </div>

          {availableOrders.length === 0 ? (
            <div className="p-10 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-2">
              <p className="text-amber-400 font-bold text-sm">No Unclaimed Delivery Orders</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                When the Kitchen marks a delivery order as READY, it will appear here instantly for you to claim!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableOrders.map((o) => (
                <div key={o.id} className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-3xl p-5 space-y-4 shadow-xl transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-black text-lg text-white block">{o.order_number}</span>
                      <span className="text-xs text-slate-400">{o.customer_name} • {o.items?.length || 0} items</span>
                    </div>
                    <span className="font-black text-amber-400 text-base bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">
                      Rs. {o.total_amount}
                    </span>
                  </div>

                  {/* Address preview */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Delivery Destination
                    </span>
                    <p className="text-xs font-bold text-slate-200 line-clamp-2">
                      {o.delivery_address || 'Address provided at checkout'}
                    </p>
                  </div>

                  <button
                    onClick={() => handleClaimOrder(o.id)}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    Accept & Claim Delivery 🛵
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* Printable Receipt Modal */}
      <OrderReceiptModal
        order={selectedReceiptOrder}
        branchName={branchName}
        onClose={() => setSelectedReceiptOrder(null)}
      />

    </div>
  );
}

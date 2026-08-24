'use client';

import React, { useEffect, useState } from 'react';
import { Bike, MapPin, Phone, CheckCircle, Navigation, Clock, AlertCircle } from 'lucide-react';
import { Order, OrderStatus } from '@/lib/types';
import { OrderService } from '@/lib/services/order-service';

export default function RiderPortal() {
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [myAssignedOrders, setMyAssignedOrders] = useState<Order[]>([]);
  const [riderInfo] = useState({ id: '40000000-0000-0000-0000-000000000001', name: 'Ali Rider (Dera Delivery)', branchId: 'b1000000-0000-0000-0000-000000000001' });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadRiderData();
    const unsubscribe = OrderService.subscribe(() => {
      loadRiderData();
    });
    return () => unsubscribe();
  }, []);

  async function loadRiderData() {
    const allBranchOrders = await OrderService.getOrders({ branchId: riderInfo.branchId });
    
    // Available ready delivery orders not claimed yet
    const readyForClaiming = allBranchOrders.filter(
      (o) => o.status === 'READY' && o.order_type === 'DELIVERY' && !o.rider_assignment
    );
    
    // My claimed/assigned active orders
    const myOrders = allBranchOrders.filter(
      (o) => o.rider_assignment?.rider_id === riderInfo.id && ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.status)
    );

    setAvailableOrders(readyForClaiming);
    setMyAssignedOrders(myOrders);
  }

  const handleClaimOrder = async (orderId: string) => {
    setMessage(null);
    const success = await OrderService.claimOrderForRider(orderId, riderInfo.id, riderInfo.name);
    if (success) {
      setMessage(`Delivery Order Claimed! Status transitioned to ASSIGNED.`);
      loadRiderData();
    } else {
      setMessage(`Order was already claimed by another rider.`);
      loadRiderData();
    }
  };

  const handleUpdateDeliveryStatus = async (orderId: string, nextStatus: OrderStatus) => {
    // Optimistic UI update for instant response
    setMyAssignedOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );

    try {
      await OrderService.updateOrderStatus(orderId, nextStatus, riderInfo.id, `Rider updated status to ${nextStatus}`);
      setMessage(`Delivery status updated to ${nextStatus.replace(/_/g, ' ')}!`);
    } catch (err) {
      console.error('Rider status update error:', err);
    } finally {
      loadRiderData();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-extrabold">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">RIDER DELIVERY PORTAL</h1>
              <p className="text-xs text-slate-400">Dera Chungi Delivery Operations</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-white block">{riderInfo.name}</span>
            <span className="text-[10px] text-emerald-400 font-semibold uppercase">Active • Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        
        {message && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Active Delivery Assignments */}
        {myAssignedOrders.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Navigation className="w-5 h-5 text-amber-400 animate-bounce" /> Your Active Deliveries ({myAssignedOrders.length})
            </h2>

            <div className="space-y-4">
              {myAssignedOrders.map((o) => (
                <div key={o.id} className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-2xl font-black text-amber-400">Order #{o.order_number}</span>
                      <span className="block text-xs font-bold text-slate-400 mt-0.5">Collect Cash: Rs. {o.total_amount}</span>
                    </div>
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-400 font-bold text-xs rounded-full border border-amber-500/30">
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300">
                    <p><strong className="text-white">Customer Name:</strong> {o.customer_name}</p>
                    <p className="flex items-center gap-2">
                      <strong className="text-white">Customer Phone:</strong> {o.customer_phone}
                      <a
                        href={`tel:${o.customer_phone}`}
                        className="px-2.5 py-1 rounded bg-slate-800 text-amber-400 font-bold hover:bg-slate-700 flex items-center gap-1 text-[11px]"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call Customer
                      </a>
                    </p>
                    <p><strong className="text-white">Delivery Address:</strong> {o.delivery_address}</p>
                    {o.delivery_notes && <p className="italic text-amber-400">Notes: {o.delivery_notes}</p>}
                  </div>

                  {/* Rider State Machine Actions */}
                  <div className="pt-2">
                    {o.status === 'ASSIGNED' && (
                      <button
                        onClick={() => handleUpdateDeliveryStatus(o.id, 'PICKED_UP')}
                        className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all"
                      >
                        Confirm Picked Up from Kitchen
                      </button>
                    )}
                    {o.status === 'PICKED_UP' && (
                      <button
                        onClick={() => handleUpdateDeliveryStatus(o.id, 'OUT_FOR_DELIVERY')}
                        className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all"
                      >
                        Start Out for Delivery
                      </button>
                    )}
                    {o.status === 'OUT_FOR_DELIVERY' && (
                      <button
                        onClick={() => handleUpdateDeliveryStatus(o.id, 'DELIVERED')}
                        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" /> Mark Successfully Delivered & Complete Order
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
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" /> Available Delivery Pool ({availableOrders.length})
          </h2>

          {availableOrders.length === 0 ? (
            <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center text-slate-500 text-xs">
              No unclaimed ready delivery orders at Dera Chungi right now. When Kitchen marks an order as READY, it appears here instantly!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableOrders.map((o) => (
                <div key={o.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="font-black text-lg text-white">{o.order_number}</span>
                    <span className="font-extrabold text-amber-400 text-sm">Rs. {o.total_amount}</span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">{o.delivery_address}</p>

                  <button
                    onClick={() => handleClaimOrder(o.id)}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase transition-all"
                  >
                    Accept & Claim Delivery
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, CheckCircle2, MapPin, Bike, Phone, RefreshCw, Sparkles, ChefHat } from 'lucide-react';
import { Order, OrderStatus } from '@/lib/types';
import { OrderService } from '@/lib/services/order-service';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';

export default function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadOrder() {
      let res = await OrderService.getOrderByTrackingToken(params.orderId).catch(() => null);
      if (!res) {
        res = await OrderService.getOrderById(params.orderId).catch(() => null);
      }
      setOrder(res);
      setLoading(false);
    }
    loadOrder();

    // Subscribe to realtime updates
    const unsubscribe = OrderService.subscribe((updatedOrder) => {
      if (
        updatedOrder.id === params.orderId ||
        updatedOrder.order_number === params.orderId ||
        updatedOrder.tracking_token === params.orderId
      ) {
        setOrder((prev) => {
          if (!prev) return updatedOrder;
          return {
            ...prev,
            ...updatedOrder,
            items: updatedOrder.items && updatedOrder.items.length > 0 ? updatedOrder.items : prev.items,
            history: updatedOrder.history && updatedOrder.history.length > 0 ? updatedOrder.history : prev.history,
          };
        });
      }
    });

    const interval = setInterval(async () => {
      let res = await OrderService.getOrderByTrackingToken(params.orderId).catch(() => null);
      if (!res) {
        res = await OrderService.getOrderById(params.orderId).catch(() => null);
      }
      if (res) setOrder({ ...res });
    }, 4000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [params.orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-amber-400 font-bold text-sm">
          <RefreshCw className="w-5 h-5 animate-spin" /> Loading Order Details...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center max-w-md space-y-4">
          <h2 className="text-xl font-bold text-white">Order Not Found</h2>
          <p className="text-xs text-slate-400">Order #{params.orderId} could not be located in our system.</p>
          <Link href="/" className="inline-block px-6 py-2.5 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold">
            Return to Menu
          </Link>
        </div>
      </div>
    );
  }

  const steps: { status: OrderStatus; label: string; icon: any }[] = [
    { status: 'PENDING', label: 'Order Placed', icon: Clock },
    { status: 'CONFIRMED', label: 'Admin Approved', icon: CheckCircle2 },
    { status: 'PREPARING', label: 'Kitchen Preparing', icon: ChefHat },
    { status: 'READY', label: 'Food Ready', icon: Sparkles },
    order.order_type === 'DELIVERY'
      ? { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: Bike }
      : { status: 'COMPLETED', label: 'Completed / Served', icon: CheckCircle2 },
  ];

  const getStepIndex = (s: OrderStatus) => {
    switch (s) {
      case 'PENDING': return 0;
      case 'CONFIRMED': return 1;
      case 'PREPARING': return 2;
      case 'READY': return 3;
      case 'ASSIGNED':
      case 'PICKED_UP':
      case 'OUT_FOR_DELIVERY': return 4;
      case 'DELIVERED':
      case 'COMPLETED': return 4;
      default: return 0;
    }
  };

  const currentStepIdx = getStepIndex(order.status);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-4 sm:px-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-bold transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Menu
          </Link>
          <span className="font-extrabold text-sm text-amber-400">Order #{order.order_number}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        
        {/* Main Status Header Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 block">Live Status Tracker</span>
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                Order #{order.order_number}
                <OrderStatusBadge status={order.status} />
              </h2>
            </div>
            <div className="text-right sm:text-right">
              <span className="text-xs text-slate-400 block">Total Paid</span>
              <span className="text-xl font-black text-amber-400">Rs. {order.total_amount}</span>
            </div>
          </div>

          {/* Step Progress Visualizer */}
          <div className="py-4">
            <div className="grid grid-cols-5 gap-2 relative">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isPassed = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;

                return (
                  <div key={idx} className="flex flex-col items-center text-center space-y-2 relative z-10">
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30 scale-110'
                          : isPassed
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-slate-950 text-slate-600 border-slate-800'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-[10px] sm:text-xs font-bold leading-tight ${
                        isCurrent
                          ? 'text-amber-400 font-black'
                          : isPassed
                          ? 'text-slate-200 font-semibold'
                          : 'text-slate-600'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rider information if delivery */}
          {order.rider_assignment && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase text-amber-400 font-extrabold block">Assigned Rider</span>
                  <span className="font-bold text-white text-sm">{order.rider_assignment.rider_name || 'Ali Rider (Dera)'}</span>
                </div>
              </div>
              <a
                href="tel:03019998877"
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-400 font-bold flex items-center gap-1 hover:bg-slate-800 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" /> Call Rider
              </a>
            </div>
          )}

        </div>

        {/* Order Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          
          {/* Items */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Items Ordered</h3>
            <div className="space-y-3 text-xs">
              {order.items?.map((item, i) => (
                <div key={i} className="flex justify-between items-start text-slate-300">
                  <div>
                    <span className="font-bold text-white">{item.quantity}x {item.item_name}</span>
                    {item.variant_name && <span className="block text-[10px] text-slate-500">({item.variant_name})</span>}
                  </div>
                  <span className="font-extrabold text-amber-400">Rs. {item.subtotal_price}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery / Table Info */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">Delivery & Contact</h3>
            <div className="space-y-2 text-slate-300">
              <p><strong className="text-white">Customer:</strong> {order.customer_name} ({order.customer_phone})</p>
              <p><strong className="text-white">Order Type:</strong> {order.order_type}</p>
              {order.table_id && <p><strong className="text-white">Table:</strong> {order.table_id}</p>}
              {order.delivery_address && <p><strong className="text-white">Address:</strong> {order.delivery_address}</p>}
              <p><strong className="text-white">Payment Method:</strong> {order.payment_method} ({order.payment_status})</p>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}

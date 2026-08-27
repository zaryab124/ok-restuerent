'use client';

import React from 'react';
import { Printer, X, MapPin, Phone, User, Clock, CheckCircle2, ShieldCheck, Download, Share2 } from 'lucide-react';
import { Order } from '@/lib/types';
import { Logo } from './Logo';

interface OrderReceiptModalProps {
  order: Order | null;
  branchName?: string;
  onClose: () => void;
}

export function OrderReceiptModal({ order, branchName = 'OK Restaurant & Fast Food', onClose }: OrderReceiptModalProps) {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const lines = [
      `*OK RESTAURANT - DELIVERY DISPATCH SLIP*`,
      `*Order #:* ${order.order_number}`,
      `*Branch:* ${branchName}`,
      `*Type:* ${order.order_type}`,
      `---------------------------------`,
      `*Customer:* ${order.customer_name}`,
      `*Phone:* ${order.customer_phone}`,
      order.delivery_address ? `*📍 Address:* ${order.delivery_address}` : '',
      order.delivery_notes ? `*Note:* ${order.delivery_notes}` : '',
      `---------------------------------`,
      `*ITEMS:*`,
      ...order.items.map((i) => `• ${i.quantity}x ${i.item_name} ${i.variant_name ? `(${i.variant_name})` : ''} - Rs. ${i.subtotal_price}`),
      `---------------------------------`,
      `*Subtotal:* Rs. ${order.subtotal}`,
      order.delivery_fee > 0 ? `*Delivery Fee:* Rs. ${order.delivery_fee}` : '',
      `*TOTAL AMOUNT:* Rs. ${order.total_amount}`,
      `*Payment Method:* ${order.payment_method} (${order.payment_status})`,
      `---------------------------------`,
      `Thank you for ordering with OK Restaurant!`
    ].filter(Boolean).join('\n');

    const cleanPhone = order.customer_phone.replace(/[^0-9]/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(lines)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      {/* Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <span className="font-black text-sm text-white">Order Receipt & Dispatch Slip</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Content */}
        <div id="printable-receipt" className="flex-1 overflow-y-auto p-6 space-y-5 bg-white text-slate-950 font-sans text-xs print:p-0 print:m-0">
          
          {/* Header */}
          <div className="text-center space-y-1 border-b border-slate-300 pb-4">
            <h2 className="text-xl font-black tracking-tight text-slate-950">OK RESTAURANT</h2>
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">{branchName}</p>
            <p className="text-[10px] text-slate-500">Premium Dine-In • Takeaway • Fast Delivery</p>
            <div className="pt-2">
              <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded-full font-black text-xs text-slate-900">
                {order.order_type} ORDER
              </span>
            </div>
          </div>

          {/* Order Details & Meta */}
          <div className="grid grid-cols-2 gap-2 text-[11px] border-b border-slate-300 pb-3">
            <div>
              <span className="text-slate-500 block">Order Number:</span>
              <strong className="text-sm font-black text-slate-950">{order.order_number}</strong>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Date & Time:</span>
              <strong className="font-bold text-slate-900">
                {new Date(order.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </strong>
            </div>
          </div>

          {/* Customer & Delivery Address Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-500" /> Customer:
              </span>
              <strong className="text-slate-950">{order.customer_name}</strong>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-500" /> Phone:
              </span>
              <strong className="text-slate-950 font-mono">{order.customer_phone}</strong>
            </div>

            {order.order_type === 'DELIVERY' && order.delivery_address && (
              <div className="pt-2 border-t border-slate-200">
                <span className="font-bold text-amber-800 flex items-center gap-1 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-600" /> Delivery Destination:
                </span>
                <p className="font-extrabold text-slate-950 bg-amber-50/80 border border-amber-200 p-2 rounded-lg text-xs leading-relaxed">
                  {order.delivery_address}
                </p>
                {order.delivery_notes && (
                  <p className="text-[10px] italic text-slate-600 mt-1">
                    <strong>Special Delivery Note:</strong> {order.delivery_notes}
                  </p>
                )}
              </div>
            )}

            {order.order_type === 'DINE_IN' && order.table_id && (
              <div className="pt-1 flex justify-between border-t border-slate-200">
                <span className="font-bold text-slate-700">Table Number:</span>
                <strong className="text-slate-950 font-black">Table #{order.table_id}</strong>
              </div>
            )}
          </div>

          {/* Itemized Table */}
          <div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-950 text-[10px] font-black uppercase text-slate-600">
                  <th className="py-1.5">Item</th>
                  <th className="py-1.5 text-center">Qty</th>
                  <th className="py-1.5 text-right">Price</th>
                  <th className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {order.items.map((item, idx) => (
                  <tr key={idx} className="text-[11px]">
                    <td className="py-2 pr-2">
                      <strong className="text-slate-950 block">{item.item_name}</strong>
                      {item.variant_name && (
                        <span className="text-[10px] text-slate-500 block">Size: {item.variant_name}</span>
                      )}
                      {item.special_instructions && (
                        <span className="text-[10px] text-amber-700 italic block">
                          Note: {item.special_instructions}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-center font-bold text-slate-900">{item.quantity}</td>
                    <td className="py-2 text-right text-slate-600">Rs. {item.unit_price}</td>
                    <td className="py-2 text-right font-bold text-slate-950">Rs. {item.subtotal_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calculations & Totals */}
          <div className="border-t-2 border-slate-950 pt-3 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span>Rs. {order.subtotal}</span>
            </div>
            
            {order.delivery_fee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee:</span>
                <span>Rs. {order.delivery_fee}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-base font-black text-slate-950 pt-2 border-t border-slate-300">
              <span>GRAND TOTAL:</span>
              <span className="text-lg font-black text-slate-950">Rs. {order.total_amount}</span>
            </div>

            <div className="flex justify-between items-center pt-2 text-[10px] font-bold">
              <span className="text-slate-500 uppercase">Payment Method:</span>
              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-900 border border-slate-300">
                {order.payment_method} • {order.payment_status}
              </span>
            </div>
          </div>

          {/* Footer Receipt Note */}
          <div className="text-center pt-4 border-t border-dashed border-slate-300 text-[10px] text-slate-500 space-y-1">
            <p className="font-bold text-slate-700">Thank you for dining with OK Restaurant!</p>
            <p>For inquiries or home delivery: Dera Chungi / Main Bypass Jampur</p>
            <p className="font-mono text-[9px] text-slate-400">System Reference ID: {order.id}</p>
          </div>

        </div>

        {/* Modal Bottom Actions (Hidden in Print) */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between print:hidden">
          <span className="text-xs text-slate-400">Ready for Thermal Printer / PDF</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

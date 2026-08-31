'use client';

import React from 'react';
import { Printer, X, DollarSign, ShoppingBag, TrendingUp, Calendar, MapPin, Bike, Utensils, Package } from 'lucide-react';
import { Order, Branch } from '@/lib/types';

export interface DaySalesSummary {
  dayName: string;
  dateStr: string;
  dateKey: string;
  orderCount: number;
  revenue: number;
  dineInCount: number;
  takeawayCount: number;
  deliveryCount: number;
  cashRevenue: number;
  onlineRevenue: number;
}

export interface PeriodReportData {
  reportTitle: string;
  periodLabel: string;
  branchName: string;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  dineInRevenue: number;
  takeawayRevenue: number;
  deliveryRevenue: number;
  cashRevenue: number;
  onlineRevenue: number;
  dailyBreakdown: DaySalesSummary[];
  topItems: { name: string; quantity: number; revenue: number }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  reportData: PeriodReportData | null;
}

export function SalesAnalyticsReportModal({ isOpen, onClose, reportData }: Props) {
  if (!isOpen || !reportData) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn print:p-0 print:bg-white print:static">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl print:max-w-none print:w-full print:max-h-none print:border-none print:shadow-none print:bg-white print:p-0 print:overflow-visible">
        
        {/* Modal Top Bar (Hidden on print) */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 print:hidden sticky top-0 bg-slate-900 z-10">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">EXECUTIVE AUDIT</span>
            <h2 className="text-lg font-black text-white">{reportData.reportTitle}</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black flex items-center gap-2 transition-colors shadow-lg shadow-amber-500/20"
            >
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Content */}
        <div className="p-8 space-y-8 text-slate-100 print:text-black print:p-4 print:space-y-6">
          
          {/* Header */}
          <div className="border-b border-slate-800 pb-6 print:border-black flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-widest uppercase text-amber-500 print:text-black">
                  OK RESTAURANT & FAST FOOD
                </span>
              </div>
              <h1 className="text-2xl font-black text-white print:text-black mt-1">
                {reportData.reportTitle}
              </h1>
              <p className="text-xs text-slate-400 print:text-gray-600 flex items-center gap-2 mt-1">
                <MapPin className="w-3.5 h-3.5 text-amber-400 print:text-black" />
                <span className="font-bold">{reportData.branchName}</span>
                <span>•</span>
                <Calendar className="w-3.5 h-3.5 text-amber-400 print:text-black" />
                <span>Period: {reportData.periodLabel}</span>
              </p>
            </div>

            <div className="text-right sm:text-right w-full sm:w-auto bg-slate-950 print:bg-gray-100 p-3 rounded-xl border border-slate-800 print:border-gray-300">
              <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600 block">Generated On</span>
              <span className="text-xs font-mono font-bold text-white print:text-black">
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Key Metric Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 print:border-gray-300 print:bg-gray-50">
              <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600 block">Gross Revenue</span>
              <span className="text-xl font-black text-amber-400 print:text-black mt-1 block">
                Rs. {reportData.totalRevenue.toLocaleString()}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 print:border-gray-300 print:bg-gray-50">
              <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600 block">Total Orders</span>
              <span className="text-xl font-black text-white print:text-black mt-1 block">
                {reportData.totalOrders}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 print:border-gray-300 print:bg-gray-50">
              <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600 block">Average Ticket</span>
              <span className="text-xl font-black text-emerald-400 print:text-black mt-1 block">
                Rs. {reportData.avgOrderValue}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 print:border-gray-300 print:bg-gray-50">
              <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600 block">Payment Split</span>
              <span className="text-xs font-bold text-slate-300 print:text-black mt-1 block">
                Cash: Rs. {reportData.cashRevenue.toLocaleString()}<br />
                Online: Rs. {reportData.onlineRevenue.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Service Channel Split */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 print:border-gray-300 print:bg-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 print:text-black flex items-center justify-center">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-600 block">Dine-In Sales</span>
                  <span className="text-sm font-black text-white print:text-black">Rs. {reportData.dineInRevenue.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 print:border-gray-300 print:bg-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 print:text-black flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-600 block">Takeaway Sales</span>
                  <span className="text-sm font-black text-white print:text-black">Rs. {reportData.takeawayRevenue.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 print:border-gray-300 print:bg-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 print:text-black flex items-center justify-center">
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-600 block">Home Delivery Sales</span>
                  <span className="text-sm font-black text-white print:text-black">Rs. {reportData.deliveryRevenue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Sales Ledger Breakdown Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-white print:text-black uppercase tracking-wider">
              Day-by-Day Sales Ledger
            </h3>
            <div className="border border-slate-800 print:border-gray-300 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 print:bg-gray-100 print:border-gray-300 text-slate-400 print:text-black font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Day & Date</th>
                    <th className="py-3 px-3 text-center">Orders</th>
                    <th className="py-3 px-3 text-center">Dine-In</th>
                    <th className="py-3 px-3 text-center">Takeaway</th>
                    <th className="py-3 px-3 text-center">Delivery</th>
                    <th className="py-3 px-4 text-right">Daily Revenue (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-gray-200">
                  {reportData.dailyBreakdown.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-800/20 print:hover:bg-transparent">
                      <td className="py-2.5 px-4 font-bold text-white print:text-black">
                        <span className="text-amber-400 print:text-black mr-2 font-black">{d.dayName}</span>
                        <span className="text-slate-400 print:text-gray-600 font-normal text-[11px]">{d.dateStr}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-white print:text-black">{d.orderCount}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400 print:text-black">{d.dineInCount}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400 print:text-black">{d.takeawayCount}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400 print:text-black">{d.deliveryCount}</td>
                      <td className="py-2.5 px-4 text-right font-black text-amber-400 print:text-black">
                        Rs. {d.revenue.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-950 font-black border-t-2 border-slate-700 print:border-black print:bg-gray-100">
                    <td className="py-3 px-4 text-white print:text-black uppercase">Total / Period Summary</td>
                    <td className="py-3 px-3 text-center text-white print:text-black">{reportData.totalOrders}</td>
                    <td className="py-3 px-3 text-center text-white print:text-black">
                      {reportData.dailyBreakdown.reduce((sum, d) => sum + d.dineInCount, 0)}
                    </td>
                    <td className="py-3 px-3 text-center text-white print:text-black">
                      {reportData.dailyBreakdown.reduce((sum, d) => sum + d.takeawayCount, 0)}
                    </td>
                    <td className="py-3 px-3 text-center text-white print:text-black">
                      {reportData.dailyBreakdown.reduce((sum, d) => sum + d.deliveryCount, 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-base text-amber-400 print:text-black">
                      Rs. {reportData.totalRevenue.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Selling Items (if available) */}
          {reportData.topItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-white print:text-black uppercase tracking-wider">
                Top Performing Menu Items
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {reportData.topItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-950 border border-slate-800 print:border-gray-300 print:bg-gray-50 rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-white print:text-black block">{item.name}</span>
                      <span className="text-[10px] text-slate-400 print:text-gray-600">{item.quantity} sold</span>
                    </div>
                    <span className="font-black text-amber-400 print:text-black">Rs. {item.revenue.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signoff / Audit Verification */}
          <div className="border-t border-slate-800 print:border-black pt-6 flex justify-between items-end text-[10px] text-slate-500 print:text-gray-600 font-mono">
            <div>
              <p>OK Restaurant Multi-Branch Management Platform</p>
              <p>Certified Automated Sales Ledger & Executive Report</p>
            </div>
            <div className="text-right">
              <p>Authorized Executive Signature: _______________________</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

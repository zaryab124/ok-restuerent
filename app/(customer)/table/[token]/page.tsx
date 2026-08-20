'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Utensils, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { QRService } from '@/lib/services/qr-service';

export default function QRTableLandingPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableData, setTableData] = useState<{ tableNumber: string; branchName: string } | null>(null);

  useEffect(() => {
    async function initQR() {
      try {
        const result = await QRService.getTableByToken(params.token);
        if (!result) {
          setError('Invalid or expired QR code token.');
          setLoading(false);
          return;
        }

        const session = {
          tableId: result.table.id,
          tableNumber: result.table.table_number,
          branchId: result.table.branch_id,
          branchName: result.branchName,
        };

        // Save session
        localStorage.setItem('ok_qr_session', JSON.stringify(session));
        setTableData({ tableNumber: result.table.table_number, branchName: result.branchName });
        setLoading(false);

        // Redirect after brief greeting
        setTimeout(() => {
          router.push('/');
        }, 1800);
      } catch (err) {
        setError('Error processing table QR code.');
        setLoading(false);
      }
    }
    initQR();
  }, [params.token, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 text-center shadow-2xl space-y-6">
        
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 mx-auto shadow-lg shadow-amber-500/20">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <Utensils className="w-8 h-8 text-amber-400" />
          </div>
        </div>

        {loading && (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-white">Scanning Table QR Code...</h2>
            <p className="text-xs text-slate-400">Verifying branch table token securely</p>
          </div>
        )}

        {!loading && error && (
          <div className="space-y-4">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h2 className="text-xl font-bold text-white">QR Scanning Error</h2>
            <p className="text-xs text-slate-400">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Go to Menu
            </button>
          </div>
        )}

        {!loading && tableData && (
          <div className="space-y-4 animate-fadeIn">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <div className="space-y-1">
              <span className="text-xs font-extrabold uppercase text-amber-400 tracking-wider">QR Code Verified</span>
              <h2 className="text-2xl font-black text-white">
                Ordering for {tableData.branchName}
              </h2>
              <p className="text-lg font-bold text-amber-400">Table {tableData.tableNumber}</p>
            </div>
            <p className="text-xs text-slate-400">Redirecting to restaurant menu...</p>
          </div>
        )}

      </div>
    </div>
  );
}

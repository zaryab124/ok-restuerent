'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat, ArrowLeft, AlertCircle } from 'lucide-react';
import { AuthService } from '@/lib/services/auth-service';
import { Logo } from '@/components/Logo';

export default function KitchenLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await AuthService.login(email, password, 'KITCHEN');
      router.push('/kitchen');
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message ? String(err.message) : 'Invalid login credentials';
      setError(msg === '{}' ? 'Invalid login credentials' : msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-xs font-bold">
          <ArrowLeft className="w-4 h-4" /> Back to Customer Portal
        </Link>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-3">
            <Logo size="lg" variant="badge" className="mx-auto" />
            <h1 className="text-lg font-black text-white pt-2 border-t border-slate-800/80 flex items-center justify-center gap-2">
              <ChefHat className="w-5 h-5 text-amber-400" /> KITCHEN DISPLAY (KDS)
            </h1>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Kitchen Email</label>
              <input
                type="email"
                placeholder="kitchen@okrestaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-amber-500/20"
            >
              {loading ? 'Authenticating...' : 'Sign In to Kitchen KDS'}
            </button>
          </form>

          {/* Quick Demo 1-Click Sign-in */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <p className="text-[11px] font-bold text-slate-400 text-center uppercase tracking-wider">
              ⚡ Quick Demo 1-Click Sign-in
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={async () => {
                  setEmail('kitchen.dera@okrestaurant.com');
                  setPassword('okaykarubas12390');
                  setLoading(true);
                  try {
                    await AuthService.login('kitchen.dera@okrestaurant.com', 'okaykarubas12390', 'KITCHEN');
                    router.push('/kitchen');
                  } catch (e: any) {
                    setError(e.message || 'Login failed');
                    setLoading(false);
                  }
                }}
                className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-700/60 rounded-xl text-xs font-bold text-amber-400 text-left flex items-center justify-between transition-all cursor-pointer"
              >
                <span>👨‍🍳 Dera Chungi Kitchen</span>
                <span className="text-[10px] text-slate-400 font-mono">kitchen.dera@...</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setEmail('kitchen.sherifalon@okrestaurant.com');
                  setPassword('okaykarubas12390');
                  setLoading(true);
                  try {
                    await AuthService.login('kitchen.sherifalon@okrestaurant.com', 'okaykarubas12390', 'KITCHEN');
                    router.push('/kitchen');
                  } catch (e: any) {
                    setError(e.message || 'Login failed');
                    setLoading(false);
                  }
                }}
                className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-700/60 rounded-xl text-xs font-bold text-amber-400 text-left flex items-center justify-between transition-all cursor-pointer"
              >
                <span>👨‍🍳 Main Bypass Kitchen</span>
                <span className="text-[10px] text-slate-400 font-mono">kitchen.sherifalon@...</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

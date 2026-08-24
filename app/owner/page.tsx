'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, TrendingUp, DollarSign, ShoppingBag, MapPin, Users, ToggleLeft, ToggleRight, PieChart, BarChart3, CreditCard, Landmark, Smartphone, Check, Save, LogOut } from 'lucide-react';
import { Branch, Order, Profile } from '@/lib/types';
import { BranchService } from '@/lib/services/branch-service';
import { OrderService } from '@/lib/services/order-service';
import { MerchantConfigService, MerchantBankConfig } from '@/lib/services/merchant-config-service';
import { AuthService, AuthenticatedUser } from '@/lib/services/auth-service';
import { supabase } from '@/lib/supabase/client';

export default function OwnerExecutivePortal() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [ownerInfo, setOwnerInfo] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'analytics' | 'capabilities' | 'payments' | 'staff'>('analytics');

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
    return () => unsubscribe();
  }, [selectedBranchId, ownerInfo]);

  async function loadOwnerData() {
    const bList = await BranchService.getBranches();
    setBranches(bList);

    const filter = selectedBranchId !== 'ALL' ? { branchId: selectedBranchId } : undefined;
    const oList = await OrderService.getOrders(filter);
    setOrders(oList);

    if (supabase) {
      const { data: dbProfiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (dbProfiles) {
        setUsers(dbProfiles);
      }
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 p-0.5 shadow-lg shadow-amber-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-amber-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                OWNER EXECUTIVE PORTAL
              </h1>
              <p className="text-xs text-slate-400">Complete 3-Branch Business & Financial Overview</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-amber-400" />
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs font-bold text-amber-400 px-4 py-2 rounded-xl focus:outline-none"
            >
              <option value="ALL">ALL BRANCHES (Global)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
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

      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        
        {/* KPI Dashboard Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-6 shadow-xl">
            <span className="text-xs uppercase font-extrabold text-amber-400 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Total Gross Revenue
            </span>
            <p className="text-3xl font-black text-white mt-2">Rs. {totalSales}</p>
            <span className="text-[10px] text-slate-500 mt-1 block">Accumulated across selected view</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <span className="text-xs uppercase font-extrabold text-slate-400 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-blue-400" /> Total Orders Placed
            </span>
            <p className="text-3xl font-black text-white mt-2">{totalOrdersCount}</p>
            <span className="text-[10px] text-slate-500 mt-1 block">Live & historic order count</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <span className="text-xs uppercase font-extrabold text-slate-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> Avg. Order Value
            </span>
            <p className="text-3xl font-black text-white mt-2">Rs. {averageOrderValue}</p>
            <span className="text-[10px] text-slate-500 mt-1 block">Per completed transaction</span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
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

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingBag, MapPin, ChefHat, Bike, ShieldCheck, UserCheck, ChevronDown, Sparkles, User, LogOut } from 'lucide-react';
import { Branch, Profile } from '@/lib/types';
import { AuthService } from '@/lib/services/auth-service';
import { Logo } from './Logo';
import { BranchSelectorModal } from './BranchSelectorModal';

interface Props {
  activeBranch?: Branch | null;
  onSelectBranch?: (branch: Branch) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  customLogoUrl?: string;
}

export const Navbar: React.FC<Props> = ({
  activeBranch,
  onSelectBranch,
  cartCount = 0,
  onOpenCart,
  customLogoUrl,
}) => {
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);

  useEffect(() => {
    const currentUser = AuthService.getCurrentUser();
    setUser(currentUser);
  }, []);

  const handleLogout = () => {
    AuthService.logout();
    setUser(null);
    window.location.reload();
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 text-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            
            {/* Logo / Brand with custom logo placeholder */}
            <Link href="/">
              <Logo customLogoUrl={customLogoUrl} size="md" />
            </Link>

            {/* Branch Selector Pill */}
            {activeBranch && (
              <button
                onClick={() => setIsBranchModalOpen(true)}
                className="flex items-center gap-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-all text-left shadow-sm group"
              >
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 group-hover:animate-bounce" />
                <div className="hidden sm:block">
                  <span className="text-[10px] block text-slate-400 uppercase tracking-wider font-semibold">Active Branch</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-200">{activeBranch.name}</span>
                </div>
                <div className="sm:hidden">
                  <span className="text-xs font-bold text-slate-200">{activeBranch.name}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
              </button>
            )}

            {/* Portals, Buffet & Cart Controls */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              {/* Open Buffet Link */}
              <Link
                href="/buffet"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-slate-950 font-bold text-xs transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" /> Open Buffet
              </Link>

              {/* Portals Login Links */}
              <div className="hidden lg:flex items-center gap-1 border-l border-r border-slate-800 px-3">
                <Link
                  href="/admin/login"
                  className="px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-amber-400 hover:bg-slate-900 flex items-center gap-1 transition-colors"
                  title="Admin Portal Login"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" /> Admin
                </Link>
                <Link
                  href="/kitchen/login"
                  className="px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-amber-400 hover:bg-slate-900 flex items-center gap-1 transition-colors"
                  title="Kitchen Display Login"
                >
                  <ChefHat className="w-3.5 h-3.5 text-amber-400" /> Kitchen
                </Link>
                <Link
                  href="/rider/login"
                  className="px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-amber-400 hover:bg-slate-900 flex items-center gap-1 transition-colors"
                  title="Rider Delivery Login"
                >
                  <Bike className="w-3.5 h-3.5 text-amber-400" /> Rider
                </Link>
                <Link
                  href="/owner/login"
                  className="px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-amber-400 hover:bg-slate-900 flex items-center gap-1 transition-colors"
                  title="Owner Portal Login"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Owner
                </Link>
              </div>

              {/* Customer Account Profile / Sign In */}
              {user ? (
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <div className="text-left hidden sm:block">
                    <span className="text-[9px] block text-slate-400 uppercase font-semibold">Logged In</span>
                    <span className="text-xs font-bold text-amber-400 truncate max-w-[100px] block">{user.full_name}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    title="Sign Out"
                    className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-slate-800 transition-colors"
                >
                  <User className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Account</span>
                </Link>
              )}

              {/* Shopping Cart Button */}
              {onOpenCart && (
                <button
                  onClick={onOpenCart}
                  className="relative bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-xs sm:text-sm"
                >
                  <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950" />
                  <span className="hidden sm:inline font-bold">Cart</span>
                  {cartCount > 0 && (
                    <span className="bg-slate-950 text-amber-400 text-[11px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {cartCount}
                    </span>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Branch Selector Modal */}
      {onSelectBranch && (
        <BranchSelectorModal
          isOpen={isBranchModalOpen}
          onClose={() => setIsBranchModalOpen(false)}
          currentBranchId={activeBranch?.id}
          onSelectBranch={onSelectBranch}
        />
      )}
    </>
  );
};

'use client';

import React, { useEffect, useState } from 'react';
import { MapPin, Bike, Utensils, ShoppingBag, Check, X } from 'lucide-react';
import { Branch, BranchCapability } from '@/lib/types';
import { BranchService } from '@/lib/services/branch-service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentBranchId?: string;
  onSelectBranch: (branch: Branch) => void;
}

export const BranchSelectorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentBranchId,
  onSelectBranch,
}) => {
  const [branches, setBranches] = useState<(Branch & { capabilities: BranchCapability })[]>([]);

  useEffect(() => {
    BranchService.getBranches().then(setBranches);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-100 overflow-hidden">
        
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-400" /> Choose Restaurant Branch
            </h3>
            <p className="text-xs text-slate-400 mt-1">Select your nearest OK Restaurant location to view menu & order</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {branches.map((b) => {
            const isSelected = b.id === currentBranchId;
            return (
              <div
                key={b.id}
                onClick={() => {
                  onSelectBranch(b);
                  onClose();
                }}
                className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-lg text-white flex items-center gap-2">
                      {b.name}
                      {isSelected && (
                        <span className="text-[10px] uppercase font-extrabold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> Selected
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">{b.address}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Phone: {b.phone}</p>
                  </div>
                </div>

                {/* Capabilities Badges */}
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-800/60 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 flex items-center gap-1 font-medium">
                    <Utensils className="w-3.5 h-3.5 text-emerald-400" /> Dine-In
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 flex items-center gap-1 font-medium">
                    <ShoppingBag className="w-3.5 h-3.5 text-blue-400" /> Takeaway
                  </span>
                  {b.capabilities?.delivery_enabled ? (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 font-semibold">
                      <Bike className="w-3.5 h-3.5 text-amber-400" /> Delivery Available
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 text-slate-500 flex items-center gap-1 font-normal line-through">
                      <Bike className="w-3.5 h-3.5 text-slate-600" /> No Delivery
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 border-t border-slate-800/80 pt-4">
          All 3 branches share the same master recipe catalog & quality standards.
        </div>
      </div>
    </div>
  );
};

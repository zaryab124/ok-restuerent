'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, X, Plus, Minus, Trash2, ArrowRight, Utensils } from 'lucide-react';
import { CartItem } from '@/lib/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (index: number, delta: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
  activeBranchName?: string;
  tableNumber?: string;
}

export const CartDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  activeBranchName,
  tableNumber,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => {
    const price = item.variant ? item.variant.price : item.menuItem.base_price;
    return sum + price * item.quantity;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fadeIn">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-950 border-l border-slate-800 text-slate-100 flex flex-col shadow-2xl">
          
          {/* Drawer Header */}
          <div className="p-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Your Order</h3>
                <p className="text-xs text-slate-400">
                  {activeBranchName || 'OK Restaurant'} {tableNumber ? `• Table ${tableNumber}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
                <Utensils className="w-12 h-12 text-slate-700 animate-pulse" />
                <p className="text-base font-medium text-slate-400">Your cart is currently empty</p>
                <p className="text-xs text-slate-600 max-w-xs">
                  Browse our delicious menu items, special deals, or traditional karahis and add them to your cart!
                </p>
              </div>
            ) : (
              items.map((item, index) => {
                const itemPrice = item.variant ? item.variant.price : item.menuItem.base_price;
                const totalItemPrice = itemPrice * item.quantity;

                return (
                  <div
                    key={index}
                    className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-4 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <h4 className="font-bold text-sm text-white">{item.menuItem.name}</h4>
                        <span className="font-extrabold text-sm text-amber-400">Rs. {totalItemPrice}</span>
                      </div>
                      
                      {item.variant && (
                        <span className="inline-block mt-1 text-[11px] font-semibold bg-slate-800 text-amber-300 px-2 py-0.5 rounded-md">
                          Variant: {item.variant.name}
                        </span>
                      )}

                      {item.specialInstructions && (
                        <p className="text-xs italic text-slate-400 mt-1">Note: {item.specialInstructions}</p>
                      )}

                      {/* Quantity Controls */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/50">
                        <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                          <button
                            onClick={() => onUpdateQuantity(index, -1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-6 text-center text-white">{item.quantity}</span>
                          <button
                            onClick={() => onUpdateQuantity(index, 1)}
                            className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => onRemoveItem(index)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Subtotal & Checkout Button */}
          {items.length > 0 && (
            <div className="p-6 bg-slate-900 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-black text-xl text-amber-400">Rs. {subtotal}</span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-2">
                <span>Taxes & Service Charges</span>
                <span className="font-semibold text-emerald-400">Included</span>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2">
                <button
                  onClick={onClearCart}
                  className="col-span-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold rounded-xl text-xs transition-colors"
                >
                  Clear
                </button>
                <Link
                  href="/checkout"
                  onClick={onClose}
                  className="col-span-3 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

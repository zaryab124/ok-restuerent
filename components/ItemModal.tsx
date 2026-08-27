'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Plus, Minus, ShoppingBag, Check } from 'lucide-react';
import { MenuItem, MenuItemVariant } from '@/lib/types';

interface Props {
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (item: MenuItem, variant?: MenuItemVariant, quantity?: number, notes?: string) => void;
}

export const ItemModal: React.FC<Props> = ({ item, onClose, onAddToCart }) => {
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (item) {
      setSelectedVariant(item.variants && item.variants.length > 0 ? item.variants[0] : undefined);
      setQuantity(1);
      setNotes('');
    }
  }, [item?.id]);

  if (!item) return null;

  const currentPrice = selectedVariant ? selectedVariant.price : (item.price ?? item.base_price);
  const totalPrice = currentPrice * quantity;
  const isAvailable = item.is_available && (!selectedVariant || selectedVariant.is_available !== false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative text-slate-100">
        
        {/* Header / Image banner */}
        <div className="relative h-56 w-full bg-slate-950 flex items-center justify-center">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="text-amber-500 font-extrabold text-2xl">OK RESTAURANT</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-black/50" />
          
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-800 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">{item.name}</h3>
              <span className="text-xl font-extrabold text-amber-400">Rs. {currentPrice}</span>
            </div>
            {item.description && (
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{item.description}</p>
            )}
            {item.preparation_time && (
              <p className="text-[11px] text-amber-400/80 mt-1 font-semibold">
                Estimated Prep Time: ~{item.preparation_time} mins
              </p>
            )}
            {!item.is_available && (
              <div className="mt-2 py-1.5 px-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs font-bold">
                ⚠️ Currently sold out / unavailable at this branch
              </div>
            )}
          </div>

          {/* Variants Selector if item has variants */}
          {item.has_variants && item.variants && item.variants.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Select Serving Size</label>
              <div className="grid grid-cols-2 gap-2">
                {item.variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  const isVarAvail = v.is_available !== false;
                  return (
                    <button
                      key={v.id}
                      disabled={!isVarAvail}
                      onClick={() => setSelectedVariant(v)}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
                        !isVarAvail
                          ? 'opacity-40 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-600 line-through'
                          : isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span>{v.name}</span>
                      <span className="flex items-center gap-1">
                        Rs. {v.price}
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 ml-1" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special Instructions */}
          <div className="space-y-1 pt-2">
            <label className="text-xs font-semibold text-slate-400">Special Instructions (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Extra spicy, less oil, no onions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Quantity & Add to Cart Controls */}
          <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl">
              <button
                disabled={!isAvailable}
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 disabled:opacity-30"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-extrabold text-sm w-6 text-center text-white">{quantity}</span>
              <button
                disabled={!isAvailable}
                onClick={() => setQuantity(quantity + 1)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              disabled={!isAvailable}
              onClick={() => {
                if (!isAvailable) return;
                onAddToCart(item, selectedVariant, quantity, notes);
                onClose();
              }}
              className={`flex-1 py-3 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                isAvailable
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-amber-500/20 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              {isAvailable ? `Add to Cart • Rs. ${totalPrice}` : 'Sold Out at Branch'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

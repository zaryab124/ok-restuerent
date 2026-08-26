'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Search, Flame, Utensils, Pizza, CookingPot, Soup, Drumstick, Coffee, MapPin, Sparkles, Plus, Check } from 'lucide-react';
import { Branch, MenuCategory, MenuItem, CartItem, MenuItemVariant } from '@/lib/types';
import { BranchService } from '@/lib/services/branch-service';
import { MenuService } from '@/lib/services/menu-service';
import { Navbar } from '@/components/Navbar';
import { CartDrawer } from '@/components/CartDrawer';
import { ItemModal } from '@/components/ItemModal';

export default function CustomerHomePage() {
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState<MenuItem | null>(null);
  const [qrTableInfo, setQrTableInfo] = useState<{ tableNumber: string; branchName: string } | null>(null);

  useEffect(() => {
    BranchService.getBranches().then((branches) => {
      if (branches.length > 0) setActiveBranch(branches[0]);
    });

    MenuService.getCategories().then(setCategories);
    MenuService.getMenuItems().then(setMenuItems);

    const savedCart = localStorage.getItem('ok_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {}
    }

    const savedQr = localStorage.getItem('ok_qr_session');
    if (savedQr) {
      try {
        const parsed = JSON.parse(savedQr);
        setQrTableInfo(parsed);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ok_cart', JSON.stringify(cart));
  }, [cart]);

  const handleAddToCart = (item: MenuItem, variant?: MenuItemVariant, quantity: number = 1, notes?: string) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (ci) => ci.menuItem.id === item.id && ci.variant?.id === variant?.id
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += quantity;
        return updated;
      }
      return [...prev, { menuItem: item, variant, quantity, specialInstructions: notes }];
    });
  };

  const handleUpdateCartQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index].quantity = newQty;
      }
      return updated;
    });
  };

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.item_code && item.item_code.toString().includes(searchQuery));
    return matchesCategory && matchesSearch;
  });

  const cartTotalCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      
      {/* Navbar */}
      <Navbar
        activeBranch={activeBranch}
        onSelectBranch={(b) => setActiveBranch(b)}
        cartCount={cartTotalCount}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* QR Banner Notification if Ordering from Physical Table */}
      {qrTableInfo && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950 py-2.5 px-4 text-center font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-inner">
          <Sparkles className="w-4 h-4 text-slate-950 animate-spin" />
          <span>Dine-In Active: Ordering for {qrTableInfo.branchName} — Table {qrTableInfo.tableNumber}</span>
          <button
            onClick={() => {
              localStorage.removeItem('ok_qr_session');
              setQrTableInfo(null);
            }}
            className="ml-3 underline text-[10px] text-slate-900 font-bold hover:text-white"
          >
            Clear Table
          </button>
        </div>
      )}

      {/* Hero Banner with Featured Deals */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 py-8 sm:py-12 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black tracking-wide">
                <Flame className="w-3.5 h-3.5 text-amber-400" /> Ap OK Karien, Bas
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                OK <span className="text-amber-400">RESTAURANT</span>
                <span className="block text-2xl sm:text-3xl font-bold text-amber-300/90 font-serif italic mt-1.5">
                  “Ap OK Karien, Bas”
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
                Experience South Punjab&apos;s finest dining and fast delivery across Dera Chungi, Main Bypass Jampur, and Kot Chuta branches.
              </p>

              {/* Branch capabilities info card */}
              {activeBranch && (
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs max-w-md">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <div>
                      <span className="font-bold text-white block">{activeBranch.name}</span>
                      <span className="text-[11px] text-slate-400">{activeBranch.address}</span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase ${
                    activeBranch.capabilities?.delivery_enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {activeBranch.capabilities?.delivery_enabled ? 'Delivery Enabled' : 'Dine-In & Takeaway Only'}
                  </span>
                </div>
              )}
            </div>

            {/* Promotional Deal Cards (June Deal & Royal Platter) with AI Photography */}
            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              <div
                onClick={() => setSelectedItemForModal(menuItems.find((i) => i.id === 'd1000000-0000-0000-0000-000000000001') || menuItems[0])}
                className="group relative h-48 rounded-2xl overflow-hidden border border-amber-500/40 cursor-pointer shadow-lg hover:border-amber-400 transition-all"
              >
                <Image src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80" alt="June Deal" fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent p-3 flex flex-col justify-end">
                  <span className="text-[10px] font-extrabold bg-amber-500 text-slate-950 px-2 py-0.5 rounded uppercase w-fit">June Deal</span>
                  <h4 className="font-black text-sm text-white mt-1">1 Large + 1 Medium Pizza</h4>
                  <span className="text-amber-400 font-black text-xs">Rs. 1495/-</span>
                </div>
              </div>

              <div
                onClick={() => setSelectedItemForModal(menuItems.find((i) => i.id === 'd1000000-0000-0000-0000-000000000002') || menuItems[1])}
                className="group relative h-48 rounded-2xl overflow-hidden border border-amber-500/40 cursor-pointer shadow-lg hover:border-amber-400 transition-all"
              >
                <Image src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80" alt="Royal Platter" fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent p-3 flex flex-col justify-end">
                  <span className="text-[10px] font-extrabold bg-amber-500 text-slate-950 px-2 py-0.5 rounded uppercase w-fit">Royal Platter</span>
                  <h4 className="font-black text-sm text-white mt-1">Deal No. 27 Platter</h4>
                  <span className="text-amber-400 font-black text-xs">Rs. 2495/-</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Main Menu Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        
        {/* Search Bar & Category Navigation */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <Utensils className="w-6 h-6 text-amber-400" /> Our Menu Catalog
            </h2>
            
            {/* Search input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search menu or deal code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Sticky Scrollable Categories Pill Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              All Items ({menuItems.length})
            </button>
            {categories.map((c) => {
              const isSelected = selectedCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:shadow-xl hover:shadow-amber-500/5 group"
            >
              {/* Image */}
              <div
                onClick={() => setSelectedItemForModal(item)}
                className="relative h-44 w-full bg-slate-950 cursor-pointer overflow-hidden"
              >
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700 font-extrabold text-lg">
                    OK RESTAURANT
                  </div>
                )}
                {item.item_code && (
                  <span className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md text-amber-400 text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-slate-800">
                    #{item.item_code}
                  </span>
                )}
                {item.has_variants && (
                  <span className="absolute bottom-3 right-3 bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                    Multiple Sizes
                  </span>
                )}
              </div>

              {/* Item Info */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h3
                    onClick={() => setSelectedItemForModal(item)}
                    className="font-bold text-base text-white group-hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">Price</span>
                    <span className="font-black text-base text-amber-400">
                      Rs. {item.base_price} {item.has_variants ? '+' : ''}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      if (item.has_variants) {
                        setSelectedItemForModal(item);
                      } else {
                        handleAddToCart(item);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-amber-500 text-amber-400 hover:text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>

      </main>

      {/* Cart Drawer Component */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={(idx) => setCart((prev) => prev.filter((_, i) => i !== idx))}
        onClearCart={() => setCart([])}
        activeBranchName={activeBranch?.name}
        tableNumber={qrTableInfo?.tableNumber}
      />

      {/* Item Detail & Variant Selector Modal */}
      <ItemModal
        item={selectedItemForModal}
        onClose={() => setSelectedItemForModal(null)}
        onAddToCart={(item, variant, qty, notes) => handleAddToCart(item, variant, qty, notes)}
      />

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© {new Date().getFullYear()} OK RESTAURANT JAMPUR. All Rights Reserved.</p>
          <p className="text-[11px] text-slate-600">
            Dera Chungi • Main Bypass Jampur • Kot Chuta
          </p>
        </div>
      </footer>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag, MapPin, Bike, Utensils, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { Branch, OrderType, PaymentMethod, CartItem, DeliveryZone } from '@/lib/types';
import { BranchService } from '@/lib/services/branch-service';
import { OrderService } from '@/lib/services/order-service';
import { DeliveryZoneService } from '@/lib/services/delivery-zone-service';

export default function CheckoutPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('b1000000-0000-0000-0000-000000000001');
  const [orderType, setOrderType] = useState<OrderType>('TAKEAWAY');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [tableId, setTableId] = useState<string | undefined>(undefined);
  const [paymentMethod] = useState<PaymentMethod>('CASH');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isDeliverySupported, setIsDeliverySupported] = useState<boolean>(true);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [loadingZones, setLoadingZones] = useState<boolean>(false);

  useEffect(() => {
    BranchService.isDeliveryAllowed(selectedBranchId)
      .then((v) => setIsDeliverySupported(v))
      .catch(() => setIsDeliverySupported(false));

    setLoadingZones(true);
    DeliveryZoneService.getDeliveryZones(selectedBranchId, true)
      .then((zones) => {
        setDeliveryZones(zones);
        if (zones.length > 0) {
          setSelectedZoneId((prev) => (zones.some((z) => z.id === prev) ? prev : zones[0].id));
        } else {
          setSelectedZoneId('');
        }
      })
      .catch(() => {
        setDeliveryZones([]);
        setSelectedZoneId('');
      })
      .finally(() => setLoadingZones(false));
  }, [selectedBranchId]);

  useEffect(() => {
    BranchService.getBranches().then((bList) => {
      setBranches(bList);
      if (bList.length > 0) setSelectedBranchId(bList[0].id);
    });

    const savedCart = localStorage.getItem('ok_cart');
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) setCart(parsed);
      } catch (e) {}
    }

    const savedQr = localStorage.getItem('ok_qr_session');
    if (savedQr) {
      try {
        const parsed = JSON.parse(savedQr);
        if (parsed.branchId) setSelectedBranchId(parsed.branchId);
        if (parsed.tableId) setTableId(parsed.tableId);
        if (parsed.tableNumber) {
          setTableNumber(parsed.tableNumber);
          setOrderType('DINE_IN');
        }
      } catch (e) {}
    }
  }, []);

  const activeBranch = branches.find((b) => b.id === selectedBranchId);

  const subtotal = cart.reduce((sum, item) => {
    const price = item.variant ? item.variant.price : (item.menuItem.price ?? item.menuItem.base_price);
    return sum + price * item.quantity;
  }, 0);

  const selectedZone = deliveryZones.find((z) => z.id === selectedZoneId) || (deliveryZones.length > 0 ? deliveryZones[0] : null);
  const deliveryFee = orderType === 'DELIVERY' && selectedZone ? selectedZone.delivery_fee : 0;
  const isBelowMinOrder = orderType === 'DELIVERY' && selectedZone && subtotal < selectedZone.minimum_order_amount;
  const minOrderShortage = isBelowMinOrder && selectedZone ? selectedZone.minimum_order_amount - subtotal : 0;
  const totalAmount = subtotal + deliveryFee;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cart.length === 0) {
      setError('Your cart is empty. Please add items from the menu before placing an order.');
      return;
    }

    if (!customerName || !customerPhone) {
      setError('Please enter your Name and Phone Number.');
      return;
    }

    if (orderType === 'DELIVERY') {
      let currentZones = deliveryZones;
      let currentZone = selectedZone;

      if (currentZones.length === 0) {
        currentZones = await DeliveryZoneService.getDeliveryZones(selectedBranchId, true);
        setDeliveryZones(currentZones);
        if (currentZones.length > 0) {
          currentZone = currentZones[0];
          setSelectedZoneId(currentZone.id);
        }
      }

      if (currentZone && subtotal < currentZone.minimum_order_amount) {
        const shortage = currentZone.minimum_order_amount - subtotal;
        setError(`Minimum order amount for delivery to "${currentZone.name}" is Rs. ${currentZone.minimum_order_amount}. Please add Rs. ${shortage} more to your cart.`);
        return;
      }
      if (!deliveryAddress) {
        setError('Please enter a valid delivery address.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const order = await OrderService.createOrder({
        branchId: selectedBranchId,
        customerName,
        customerPhone,
        orderType,
        tableId: orderType === 'DINE_IN' ? (tableId || tableNumber) : undefined,
        deliveryZoneId: orderType === 'DELIVERY' ? (selectedZoneId || selectedZone?.id) : undefined,
        deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress : undefined,
        deliveryNotes,
        items: cart,
        paymentMethod,
      });

      localStorage.removeItem('ok_cart');
      localStorage.removeItem('ok_qr_session');

      // Cash on Delivery: Immediate order confirmation
      router.push(`/order-tracking/${order.tracking_token || order.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit order.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 py-4 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-bold transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Menu
          </Link>
          <span className="font-extrabold text-sm text-white">Checkout & Payment Portal</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-3 animate-fadeIn">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {cart.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4 shadow-2xl">
            <ShoppingBag className="w-16 h-16 text-slate-700 mx-auto" />
            <h2 className="text-xl font-black text-white">Your Cart is Empty</h2>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Please browse our delicious food items and deals from the menu to add them to your order!
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all"
            >
              Browse Full Menu
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 md:grid-cols-12 gap-8">
            
            {/* Left Column: Details & Payment Methods */}
            <div className="md:col-span-7 space-y-6">
              
              {/* Branch Selection */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" /> Select Branch
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBranchId(b.id)}
                      className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                        selectedBranchId === b.id
                          ? 'bg-amber-500/10 border-amber-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs block">{b.name}</span>
                        <span className="text-[11px] text-slate-500">{b.address}</span>
                      </div>
                      {selectedBranchId === b.id && <CheckCircle className="w-4 h-4 text-amber-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Type Selection */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Order Fulfillment</h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('TAKEAWAY')}
                    className={`py-3 px-2 rounded-2xl border text-center text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                      orderType === 'TAKEAWAY'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4" /> Takeaway
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('DINE_IN')}
                    className={`py-3 px-2 rounded-2xl border text-center text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                      orderType === 'DINE_IN'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Utensils className="w-4 h-4" /> Dine-In
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('DELIVERY')}
                    disabled={!isDeliverySupported}
                    className={`py-3 px-2 rounded-2xl border text-center text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                      !isDeliverySupported
                        ? 'opacity-40 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-600'
                        : orderType === 'DELIVERY'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Bike className="w-4 h-4" /> Delivery
                  </button>
                </div>
              </div>

              {/* Customer Details */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Customer Details</h3>
                
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Usman Khan"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="03XX-XXXXXXX"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  {orderType === 'DINE_IN' && (
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-400">Table Number</label>
                      <input
                        type="text"
                        placeholder="e.g. T-12"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                        required
                      />
                    </div>
                  )}

                  {orderType === 'DELIVERY' && (
                    <>
                      {/* Delivery Zone Selector */}
                      <div className="space-y-2 pt-1 border-t border-slate-800">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-slate-400 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400" />
                            Select Delivery Area / Zone
                          </label>
                          {selectedZone && (
                            <span className="text-[11px] text-amber-400 font-bold">
                              ETA: ~{selectedZone.estimated_delivery_minutes} mins
                            </span>
                          )}
                        </div>

                        {loadingZones ? (
                          <div className="p-3 rounded-xl bg-slate-950 text-slate-500 text-xs animate-pulse">
                            Loading delivery zones for {activeBranch?.name || 'branch'}...
                          </div>
                        ) : deliveryZones.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2">
                            {deliveryZones.map((zone) => {
                              const isSelected = (selectedZoneId || deliveryZones[0].id) === zone.id;
                              return (
                                <div
                                  key={zone.id}
                                  onClick={() => setSelectedZoneId(zone.id)}
                                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-amber-500/10 border-amber-500 text-white shadow-md shadow-amber-500/10'
                                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                                  }`}
                                >
                                  <div>
                                    <span className="font-bold block text-white text-xs">{zone.name}</span>
                                    <span className="text-[10px] text-slate-500">
                                      Min. Order: Rs. {zone.minimum_order_amount} • ~{zone.estimated_delivery_minutes} mins
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className={`font-black text-xs ${isSelected ? 'text-amber-400' : 'text-slate-300'}`}>
                                      + Rs. {zone.delivery_fee}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                            No active delivery zones configured for this branch.
                          </div>
                        )}
                      </div>

                      {/* Minimum Order Warning Alert */}
                      {isBelowMinOrder && selectedZone && (
                        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-fadeIn">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-rose-200">Minimum Order Requirement</span>
                            Delivery to <strong>{selectedZone.name}</strong> requires a minimum order of <strong>Rs. {selectedZone.minimum_order_amount}</strong>. Please add <strong>Rs. {minOrderShortage}</strong> more items to proceed.
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-400">Street / House / Delivery Address</label>
                        <textarea
                          placeholder="House number, Street, Near landmark in Jampur..."
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          rows={2}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-400">Delivery Notes / Landmark Instructions</label>
                        <input
                          type="text"
                          placeholder="e.g. Opposite Masjid, call on arrival..."
                          value={deliveryNotes}
                          onChange={(e) => setDeliveryNotes(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Payment Method - Cash on Delivery Only */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center justify-between">
                  <span>Payment Method</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-bold uppercase">
                    Cash on Delivery
                  </span>
                </h3>

                <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-extrabold text-white text-sm block">
                        Cash on Delivery / Pay at Counter
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Pay cash directly to the delivery rider or counter receptionist upon order delivery.
                      </span>
                    </div>
                  </div>
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                </div>
              </div>

            </div>

            {/* Right Column: Order Summary & Place Order */}
            <div className="md:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl sticky top-24">
                <h3 className="text-base font-black text-white border-b border-slate-800 pb-3">Order Summary</h3>

                {/* Items List */}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {cart.map((item, idx) => {
                    const price = item.variant ? item.variant.price : item.menuItem.base_price;
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-white block">
                            {item.quantity}x {item.menuItem.name} {item.variant ? `(${item.variant.name})` : ''}
                          </span>
                          <span className="text-[10px] text-slate-500">Rs. {price} each</span>
                        </div>
                        <span className="font-extrabold text-amber-400">Rs. {price * item.quantity}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Subtotal Calculations */}
                <div className="space-y-2 border-t border-slate-800 pt-4 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-bold text-white">Rs. {subtotal}</span>
                  </div>
                  {orderType === 'DELIVERY' && (
                    <div className="flex justify-between text-slate-400">
                      <span>Delivery Fee</span>
                      <span className="font-bold text-white">Rs. {deliveryFee}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-800 text-amber-400">
                    <span>Total Amount</span>
                    <span className="text-lg">Rs. {totalAmount}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || Boolean(isBelowMinOrder)}
                  className={`w-full py-4 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all mt-4 ${
                    isBelowMinOrder
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-rose-500/30'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  {submitting
                    ? 'Processing Order...'
                    : isBelowMinOrder && selectedZone
                    ? `Min. Order Rs. ${selectedZone.minimum_order_amount} Required (+Rs. ${minOrderShortage})`
                    : 'Confirm Order (Cash on Delivery)'}
                </button>
              </div>
            </div>

          </form>
        )}

      </main>
    </div>
  );
}

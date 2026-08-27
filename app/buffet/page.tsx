'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Utensils, Calendar, Clock, Users, QrCode, CheckCircle, ArrowLeft, Printer, Sparkles, CreditCard } from 'lucide-react';
import { BuffetRegistration, BuffetBooking } from '@/lib/types';
import { BuffetService } from '@/lib/services/buffet-service';

export default function OpenBuffetPage() {
  const [buffets, setBuffets] = useState<BuffetRegistration[]>([]);
  const [selectedBuffet, setSelectedBuffet] = useState<BuffetRegistration | null>(null);
  
  // Registration Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(2);
  const [bookingTicket, setBookingTicket] = useState<BuffetBooking | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  useEffect(() => {
    BuffetService.getActiveBuffets().then((list) => {
      setBuffets(list);
      if (list.length > 0) setSelectedBuffet(list[0]);
    });
  }, []);

  const handleBookBuffet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuffet || !name || !phone) return;

    const total = selectedBuffet.price_per_head * guests;
    const booking = await BuffetService.bookBuffetTicket({
      buffetId: selectedBuffet.id,
      customerName: name,
      customerPhone: phone,
      guestsCount: guests,
      totalAmount: total,
    });

    const qrUrl = await QRCode.toDataURL(booking.qr_ticket_token, { width: 300, margin: 2 });
    setBookingTicket(booking);
    setQrCodeDataUrl(qrUrl);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-bold transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Menu
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span className="font-extrabold text-sm text-white">OPEN BUFFET REGISTRATION</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        
        {/* Ticket Modal if Booked */}
        {bookingTicket && qrCodeDataUrl ? (
          <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-6 shadow-2xl animate-fadeIn">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            
            <div>
              <span className="text-[10px] uppercase font-extrabold text-amber-400 tracking-wider">Registration Confirmed</span>
              <h2 className="text-xl font-black text-white mt-1">Open Buffet Entry Ticket</h2>
              <p className="text-xs text-slate-400 mt-1">{bookingTicket.customer_name} ({bookingTicket.guests_count} Guests)</p>
            </div>

            {/* QR Ticket */}
            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCodeDataUrl} alt="Buffet Ticket QR Code" className="w-48 h-48 mx-auto" />
            </div>

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <p><strong className="text-white">Ticket Token:</strong> <span className="font-mono text-amber-400">{bookingTicket.qr_ticket_token}</span></p>
              <p><strong className="text-white">Status:</strong> <span className={bookingTicket.status === 'CONFIRMED' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>{bookingTicket.status}</span></p>
              <p><strong className="text-white">Total Amount:</strong> Rs. {bookingTicket.total_amount}</p>
            </div>

            {bookingTicket.status === 'PENDING' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/payments/checkout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        bookingId: bookingTicket.id,
                        customer: { name: bookingTicket.customer_name, phone: bookingTicket.customer_phone },
                      }),
                    });
                    const data = await res.json();
                    if (data.checkoutUrl) {
                      window.location.href = data.checkoutUrl;
                    }
                  } catch (err) {
                    console.error('Payment redirect failed', err);
                  }
                }}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" /> Pay Rs. {bookingTicket.total_amount} with Safepay
              </button>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setBookingTicket(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Back to Buffet
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Print Ticket
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Buffet Details */}
            <div className="lg:col-span-7 space-y-6">
              {selectedBuffet && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-6 p-6">
                  <div className="relative h-60 w-full rounded-2xl overflow-hidden bg-slate-950">
                    <Image
                      src={selectedBuffet.banner_image_url || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&auto=format&fit=crop&q=80'}
                      alt={selectedBuffet.title}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent p-4 flex flex-col justify-end">
                      <span className="text-[10px] font-extrabold bg-amber-500 text-slate-950 px-2 py-0.5 rounded uppercase w-fit">
                        Special Open Buffet
                      </span>
                      <h2 className="text-2xl font-black text-white mt-1">{selectedBuffet.title}</h2>
                      <p className="text-amber-400 font-black text-lg">Rs. {selectedBuffet.price_per_head} / Head</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center text-center">
                      <Calendar className="w-4 h-4 text-amber-400 mb-1" />
                      <span className="text-slate-400 text-[10px]">Timing</span>
                      <span className="font-bold text-white mt-0.5">{selectedBuffet.event_date}</span>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center text-center">
                      <Clock className="w-4 h-4 text-amber-400 mb-1" />
                      <span className="text-slate-400 text-[10px]">Hours</span>
                      <span className="font-bold text-white mt-0.5">{selectedBuffet.start_time} - {selectedBuffet.end_time}</span>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center text-center">
                      <Utensils className="w-4 h-4 text-amber-400 mb-1" />
                      <span className="text-slate-400 text-[10px]">Dishes</span>
                      <span className="font-bold text-white mt-0.5">40+ Items</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-white mb-2">Featured Dishes Included:</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                      {selectedBuffet.dishes_list.map((dish, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span>{dish}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Booking Form */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl sticky top-24">
                <h3 className="text-lg font-black text-white border-b border-slate-800 pb-3">Book Buffet Ticket</h3>
                
                <form onSubmit={handleBookBuffet} className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Full Name</label>
                    <input
                      type="text"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="03XX-XXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-400">Number of Guests</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={guests}
                      onChange={(e) => setGuests(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>

                  {selectedBuffet && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-sm font-bold pt-3">
                      <span className="text-slate-400">Total Price ({guests} Guests)</span>
                      <span className="text-amber-400 font-black text-lg">
                        Rs. {selectedBuffet.price_per_head * guests}
                      </span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                  >
                    Register & Generate QR Ticket
                  </button>
                </form>
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

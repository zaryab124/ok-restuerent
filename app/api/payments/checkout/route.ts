import { NextRequest, NextResponse } from 'next/server';
import { PaymentGateway } from '@/lib/payment/payment-gateway';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, bookingId, customer } = body;

    if (!orderId && !bookingId) {
      return NextResponse.json(
        { success: false, error: 'Missing orderId or bookingId in checkout request.' },
        { status: 400 }
      );
    }

    const provider = PaymentGateway.getProvider('SAFEPAY');
    const origin = req.nextUrl.origin || 'http://localhost:3000';

    // A. Food Order Checkout Flow
    if (orderId) {
      if (!supabase) {
        throw new Error('Supabase database client is unavailable.');
      }

      // 1. Authoritative DB fetch of order total and status
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        return NextResponse.json(
          { success: false, error: `Order ${orderId} not found.` },
          { status: 404 }
        );
      }

      if (order.payment_status === 'PAID') {
        return NextResponse.json(
          { success: false, error: 'This order has already been paid.' },
          { status: 400 }
        );
      }

      const authoritativeAmount = Number(order.total_amount);
      if (authoritativeAmount <= 0) {
        return NextResponse.json(
          { success: false, error: 'Order total amount is invalid.' },
          { status: 400 }
        );
      }

      // 2. Create authoritative gateway checkout session
      const checkoutResult = await provider.createCheckout({
        orderId: order.id,
        orderNumber: order.order_number,
        amount: authoritativeAmount,
        currency: 'PKR',
        customer: {
          name: customer?.name || order.customer_name,
          phone: customer?.phone || order.customer_phone,
          email: customer?.email,
        },
        redirectUrl: `${origin}/order-tracking/${order.tracking_token || order.id}?payment=success`,
        cancelUrl: `${origin}/order-tracking/${order.tracking_token || order.id}?payment=cancelled`,
        webhookUrl: `${origin}/api/webhooks/safepay`,
      });

      // 3. Record INITIATED transaction in database
      await supabase.from('payment_transactions').insert({
        order_id: order.id,
        provider: 'SAFEPAY',
        provider_transaction_id: checkoutResult.token,
        amount: authoritativeAmount,
        currency: 'PKR',
        status: 'INITIATED',
        payment_method: 'SAFEPAY',
        checkout_url: checkoutResult.checkoutUrl,
        provider_reference: checkoutResult.token,
        raw_response: { session: checkoutResult },
      });

      return NextResponse.json({
        success: true,
        provider: checkoutResult.provider,
        checkoutUrl: checkoutResult.checkoutUrl,
        token: checkoutResult.token,
        amount: authoritativeAmount,
        currency: checkoutResult.currency,
      });
    }

    // B. Buffet Ticket Checkout Flow
    if (bookingId) {
      if (!supabase) {
        throw new Error('Supabase database client is unavailable.');
      }

      const { data: booking, error: bookingError } = await supabase
        .from('buffet_bookings')
        .select('*, buffet_registrations(title, price_per_head)')
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        return NextResponse.json(
          { success: false, error: `Buffet booking ${bookingId} not found.` },
          { status: 404 }
        );
      }

      if (booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN') {
        return NextResponse.json(
          { success: false, error: 'This buffet booking is already confirmed.' },
          { status: 400 }
        );
      }

      const authoritativeAmount = Number(booking.total_amount);

      const checkoutResult = await provider.createCheckout({
        buffetBookingId: booking.id,
        orderNumber: `BUFFET-${booking.id.substring(0, 8).toUpperCase()}`,
        amount: authoritativeAmount,
        currency: 'PKR',
        customer: {
          name: customer?.name || booking.customer_name,
          phone: customer?.phone || booking.customer_phone,
          email: customer?.email || booking.customer_email,
        },
        redirectUrl: `${origin}/buffet?payment=success&token=${booking.qr_ticket_token}`,
        cancelUrl: `${origin}/buffet?payment=cancelled`,
        webhookUrl: `${origin}/api/webhooks/safepay`,
      });

      await supabase.from('payment_transactions').insert({
        buffet_booking_id: booking.id,
        provider: 'SAFEPAY',
        provider_transaction_id: checkoutResult.token,
        amount: authoritativeAmount,
        currency: 'PKR',
        status: 'INITIATED',
        payment_method: 'SAFEPAY',
        checkout_url: checkoutResult.checkoutUrl,
        provider_reference: checkoutResult.token,
        raw_response: { session: checkoutResult },
      });

      return NextResponse.json({
        success: true,
        provider: checkoutResult.provider,
        checkoutUrl: checkoutResult.checkoutUrl,
        token: checkoutResult.token,
        amount: authoritativeAmount,
        currency: checkoutResult.currency,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid checkout request' }, { status: 400 });
  } catch (err: any) {
    console.error('Checkout API error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal payment error.' },
      { status: 500 }
    );
  }
}

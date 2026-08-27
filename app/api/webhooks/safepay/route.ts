import { NextRequest, NextResponse } from 'next/server';
import { PaymentGateway } from '@/lib/payment/payment-gateway';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const provider = PaymentGateway.getProvider('SAFEPAY');

    // 1. Signature & Payload Verification
    const verification = await provider.parseWebhook(rawBody, req.headers);

    if (!verification.isValid) {
      console.warn('Safepay webhook signature validation failed:', verification.error);
      return NextResponse.json(
        { error: verification.error || 'Invalid webhook signature.' },
        { status: 401 }
      );
    }

    if (!supabase) {
      console.error('Supabase client unavailable during webhook execution.');
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    const { orderId, buffetBookingId, amount, currency, status, providerTransactionId, event, rawPayload } = verification;

    // 2. Handle Food Orders
    if (orderId && status === 'PAID') {
      const idempotencyKey = `wh_${event}_${providerTransactionId || orderId}`;

      const { data, error } = await supabase.rpc('record_verified_payment', {
        p_order_id: orderId,
        p_provider: 'SAFEPAY',
        p_provider_transaction_id: providerTransactionId || null,
        p_amount: amount || 0,
        p_currency: currency || 'PKR',
        p_provider_reference: event,
        p_idempotency_key: idempotencyKey,
        p_raw_response: rawPayload || {},
      });

      if (error) {
        console.error(`Failed to atomically record verified payment for order ${orderId}:`, error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        received: true,
        orderId,
        result: data,
      });
    }

    // 3. Handle Buffet Bookings
    if (buffetBookingId && status === 'PAID') {
      const idempotencyKey = `wh_buffet_${event}_${providerTransactionId || buffetBookingId}`;

      const { data, error } = await supabase.rpc('record_verified_buffet_payment', {
        p_booking_id: buffetBookingId,
        p_provider: 'SAFEPAY',
        p_provider_transaction_id: providerTransactionId || null,
        p_amount: amount || 0,
        p_currency: currency || 'PKR',
        p_provider_reference: event,
        p_idempotency_key: idempotencyKey,
        p_raw_response: rawPayload || {},
      });

      if (error) {
        console.error(`Failed to atomically record buffet payment for ${buffetBookingId}:`, error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        received: true,
        buffetBookingId,
        result: data,
      });
    }

    // Unhandled or non-PAID events (e.g. refund / cancel / initiated)
    return NextResponse.json({
      received: true,
      event,
      status,
      note: 'Acknowledged without order status mutation',
    });
  } catch (err: any) {
    console.error('Safepay webhook unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Webhook processing failed.' },
      { status: 500 }
    );
  }
}

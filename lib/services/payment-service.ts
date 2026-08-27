import { PaymentMethod, PaymentStatus } from '../types';
import { supabase } from '../supabase/client';

export interface PaymentProcessResult {
  success: boolean;
  transactionId?: string;
  checkoutUrl?: string;
  paymentStatus: PaymentStatus;
  message: string;
  gateway?: string;
}

export class PaymentService {
  /**
   * Authoritative Payment Initiation.
   * CASH orders are placed directly with paymentStatus = PENDING (settled at counter or delivery).
   * Online orders (SAFEPAY, CARD, JAZZCASH, EASYPAISA, ONLINE) initiate an authenticated checkout session via the backend gateway.
   */
  static async processPayment(
    amount: number,
    method: PaymentMethod,
    customerDetails: { name: string; phone: string; email?: string; orderId?: string; bookingId?: string }
  ): Promise<PaymentProcessResult> {
    if (method === 'CASH') {
      return {
        success: true,
        paymentStatus: 'PENDING',
        message: 'Order placed with Cash Payment. Amount will be collected upon counter pickup or doorstep delivery.',
        gateway: 'Cash on Delivery / Counter Ledger',
      };
    }

    // For online payments, request checkout session from backend API
    try {
      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: customerDetails.orderId,
          bookingId: customerDetails.bookingId,
          method,
          customer: {
            name: customerDetails.name,
            phone: customerDetails.phone,
            email: customerDetails.email,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to initiate payment gateway session.');
      }

      return {
        success: true,
        transactionId: data.transactionId,
        checkoutUrl: data.checkoutUrl,
        paymentStatus: 'INITIATED',
        message: 'Redirecting to Safepay secure checkout portal...',
        gateway: data.provider || 'Safepay',
      };
    } catch (err: any) {
      return {
        success: false,
        paymentStatus: 'FAILED',
        message: err.message || 'Payment gateway initialization failed.',
      };
    }
  }

  /**
   * Fetch payment transaction history and live status from the database.
   */
  static async getPaymentStatus(orderId: string): Promise<{ payment_status: PaymentStatus; transactions: any[] }> {
    if (!supabase) {
      return { payment_status: 'PENDING', transactions: [] };
    }

    const { data: order } = await supabase
      .from('orders')
      .select('payment_status')
      .eq('id', orderId)
      .maybeSingle();

    const { data: transactions } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    return {
      payment_status: order?.payment_status || 'PENDING',
      transactions: transactions || [],
    };
  }
}

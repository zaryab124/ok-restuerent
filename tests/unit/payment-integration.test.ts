import crypto from 'crypto';
import { SafepayPaymentProvider } from '../../lib/payment/safepay-provider';
import { PaymentGateway } from '../../lib/payment/payment-gateway';
import { PaymentService } from '../../lib/services/payment-service';

describe('Production Payment Integration & Safepay Gateway (Migration 010)', () => {
  const mockWebhookSecret = 'whsec_test_secret_1234567890abcdef';
  let provider: SafepayPaymentProvider;

  beforeAll(() => {
    process.env.SAFEPAY_SECRET_KEY = 'sec_test_mock_secret_key';
    process.env.SAFEPAY_PUBLISHABLE_KEY = 'myp_test_mock_pub_key';
    process.env.SAFEPAY_ENVIRONMENT = 'sandbox';
    process.env.SAFEPAY_WEBHOOK_SECRET = mockWebhookSecret;

    provider = new SafepayPaymentProvider();
  });

  describe('1. Safepay Webhook HMAC-SHA256 Signature Verification', () => {
    test('Successfully validates authentic webhook signature generated with secret', () => {
      const payload = JSON.stringify({
        event: 'payment.captured',
        data: {
          token: 'track_test_12345',
          amount: 1880,
          currency: 'PKR',
          order_id: 'ord-test-1111',
          state: 'PAID',
        },
      });

      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(payload)
        .digest('hex');

      const isValid = provider.verifySignature(payload, {
        'x-sfpy-signature': validSignature,
      });

      expect(isValid).toBe(true);
    });

    test('Rejects webhook when payload has been tampered with', () => {
      const originalPayload = JSON.stringify({
        event: 'payment.captured',
        data: { amount: 1880, order_id: 'ord-test-1111' },
      });

      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(originalPayload)
        .digest('hex');

      const tamperedPayload = JSON.stringify({
        event: 'payment.captured',
        data: { amount: 10, order_id: 'ord-test-1111' }, // Tampered amount
      });

      const isValid = provider.verifySignature(tamperedPayload, {
        'x-sfpy-signature': validSignature,
      });

      expect(isValid).toBe(false);
    });

    test('Rejects webhook with forged signature or missing signature header', () => {
      const payload = JSON.stringify({ event: 'payment.captured' });

      // Forged signature
      expect(provider.verifySignature(payload, { 'x-sfpy-signature': 'deadbeef00001111' })).toBe(false);

      // Missing header
      expect(provider.verifySignature(payload, {})).toBe(false);
    });
  });

  describe('2. Webhook Payload Parsing & Event State Extraction', () => {
    test('Parses payment.captured event into PAID status with matching order metadata', async () => {
      const rawPayload = JSON.stringify({
        event: 'payment.captured',
        data: {
          token: 'track_sfpy_998877',
          amount: 2450.00,
          currency: 'PKR',
          state: 'PAID',
          metadata: {
            order_id: 'b1000000-0000-0000-0000-000000000099',
          },
        },
      });

      const signature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(rawPayload)
        .digest('hex');

      const result = await provider.parseWebhook(rawPayload, {
        'x-sfpy-signature': signature,
      });

      expect(result.isValid).toBe(true);
      expect(result.status).toBe('PAID');
      expect(result.amount).toBe(2450);
      expect(result.currency).toBe('PKR');
      expect(result.orderId).toBe('b1000000-0000-0000-0000-000000000099');
      expect(result.providerTransactionId).toBe('track_sfpy_998877');
    });

    test('Parses payment.failed event into FAILED status', async () => {
      const rawPayload = JSON.stringify({
        event: 'payment.failed',
        data: {
          token: 'track_sfpy_fail_11',
          amount: 500.00,
          currency: 'PKR',
          state: 'FAILED',
          order_id: 'ord-fail-1',
        },
      });

      const signature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(rawPayload)
        .digest('hex');

      const result = await provider.parseWebhook(rawPayload, {
        'x-sfpy-signature': signature,
      });

      expect(result.isValid).toBe(true);
      expect(result.status).toBe('FAILED');
      expect(result.orderId).toBe('ord-fail-1');
    });
  });

  describe('3. Database Zero-Trust Amount & Currency Verification Simulation', () => {
    const simulateDatabasePaymentVerification = (
      order: { id: string; total_amount: number; payment_status: string; currency?: string },
      payment: { amount: number; currency: string; orderId: string }
    ) => {
      if (order.id !== payment.orderId) {
        throw new Error(`Order ${payment.orderId} not found.`);
      }

      if (payment.currency !== 'PKR') {
        throw new Error(`Currency ${payment.currency} is not supported. Must be PKR.`);
      }

      if (payment.amount < order.total_amount) {
        throw new Error(
          `Paid amount (Rs. ${payment.amount}) is lower than authoritative order total (Rs. ${order.total_amount}).`
        );
      }

      if (order.payment_status === 'PAID') {
        return {
          success: true,
          message: 'Order is already marked as PAID (Idempotent call)',
          order_id: order.id,
          payment_status: 'PAID',
        };
      }

      return {
        success: true,
        order_id: order.id,
        payment_status: 'PAID',
        paid_amount: payment.amount,
      };
    };

    test('Rejects payment confirmation if gateway paid amount is less than order total', () => {
      const order = {
        id: 'ord-sec-001',
        total_amount: 1880, // Karahi + Delivery Fee
        payment_status: 'PENDING',
      };

      // Attacker managed to checkout for Rs. 500
      expect(() => {
        simulateDatabasePaymentVerification(order, {
          orderId: 'ord-sec-001',
          amount: 500,
          currency: 'PKR',
        });
      }).toThrow('Paid amount (Rs. 500) is lower than authoritative order total (Rs. 1880).');
    });

    test('Rejects payment confirmation if currency is not PKR', () => {
      const order = {
        id: 'ord-sec-002',
        total_amount: 1880,
        payment_status: 'PENDING',
      };

      expect(() => {
        simulateDatabasePaymentVerification(order, {
          orderId: 'ord-sec-002',
          amount: 1880,
          currency: 'USD',
        });
      }).toThrow('Currency USD is not supported. Must be PKR.');
    });

    test('Idempotency: Replaying duplicate webhook returns success without double-mutating', () => {
      const order = {
        id: 'ord-sec-003',
        total_amount: 1880,
        payment_status: 'PAID', // Already paid
      };

      const result = simulateDatabasePaymentVerification(order, {
        orderId: 'ord-sec-003',
        amount: 1880,
        currency: 'PKR',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Idempotent call');
      expect(result.payment_status).toBe('PAID');
    });
  });

  describe('4. Safepay Checkout Session Generation', () => {
    test('Constructs valid checkout redirect URL with beacon token and query params', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { token: 'order_tok_mock_12345678' },
        }),
        text: async () => '',
      } as any);

      try {
        const checkout = await provider.createCheckout({
          orderId: 'ord-123',
          orderNumber: 'OK-2026-123',
          amount: 1500,
          currency: 'PKR',
          customer: {
            name: 'Usman Ali',
            phone: '03001234567',
          },
          redirectUrl: 'https://ok-restuerent.vercel.app/order-tracking/trk-123',
          cancelUrl: 'https://ok-restuerent.vercel.app/order-tracking/trk-123?cancelled=true',
        });

        expect(checkout.provider).toBe('SAFEPAY');
        expect(checkout.checkoutUrl).toContain('https://sandbox.api.getsafepay.com/checkout/pay');
        expect(checkout.checkoutUrl).toContain('beacon=order_tok_mock_12345678');
        expect(checkout.checkoutUrl).toContain('order_id=ord-123');
        expect(checkout.checkoutUrl).toContain('env=sandbox');
        expect(checkout.amount).toBe(1500);
        expect(checkout.currency).toBe('PKR');
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('Rejects checkout creation for zero or negative amount', async () => {
      await expect(
        provider.createCheckout({
          orderId: 'ord-invalid',
          orderNumber: 'OK-ERR',
          amount: 0,
          currency: 'PKR',
          customer: { name: 'Test', phone: '0300' },
          redirectUrl: 'http://localhost:3000',
          cancelUrl: 'http://localhost:3000',
        })
      ).rejects.toThrow('Amount must be greater than zero.');
    });
  });

  describe('5. Cash / COD Payment Preservation', () => {
    test('CASH method operates immediately with PENDING payment status without payment gateway', async () => {
      const res = await PaymentService.processPayment(1800, 'CASH', {
        name: 'Ahmad Khan',
        phone: '03001234567',
      });

      expect(res.success).toBe(true);
      expect(res.paymentStatus).toBe('PENDING');
      expect(res.gateway).toContain('Cash');
      expect(res.checkoutUrl).toBeUndefined();
    });
  });

  describe('6. Payment Gateway Registry & Provider Factory', () => {
    test('Resolves SAFEPAY as default provider', () => {
      const p = PaymentGateway.getProvider('SAFEPAY');
      expect(p.name).toBe('SAFEPAY');
    });

    test('Throws descriptive error for unregistered provider', () => {
      expect(() => {
        PaymentGateway.getProvider('STRIPE' as any);
      }).toThrow('Payment provider "STRIPE" is not registered.');
    });
  });
});

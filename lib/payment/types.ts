export type PaymentGatewayProviderName = 'SAFEPAY' | 'CASH';

export type PaymentTransactionStatus =
  | 'PENDING'
  | 'INITIATED'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export interface CheckoutCustomerInfo {
  name: string;
  phone: string;
  email?: string;
}

export interface CheckoutParams {
  orderId?: string;
  buffetBookingId?: string;
  orderNumber: string;
  amount: number; // In PKR major units e.g. 1850.00
  currency: 'PKR';
  customer: CheckoutCustomerInfo;
  redirectUrl: string;
  cancelUrl: string;
  webhookUrl?: string;
  metadata?: Record<string, any>;
}

export interface CheckoutResult {
  provider: PaymentGatewayProviderName;
  checkoutUrl: string;
  token?: string;
  trackerId?: string;
  amount: number;
  currency: string;
  expiresAt?: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  event: string;
  orderId?: string;
  buffetBookingId?: string;
  providerTransactionId?: string;
  amount?: number;
  currency?: string;
  status: PaymentTransactionStatus;
  rawPayload: any;
  error?: string;
}

export interface RefundParams {
  transactionId: string;
  amount?: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount: number;
  status: 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED';
  rawResponse?: any;
}

export interface PaymentProvider {
  name: PaymentGatewayProviderName;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  verifyPayment(trackerOrToken: string): Promise<{
    status: PaymentTransactionStatus;
    amount: number;
    currency: string;
    raw: any;
  }>;
  verifySignature(rawBody: string, headers: Headers | Record<string, string | null | undefined>): boolean;
  parseWebhook(rawBody: string, headers: Headers | Record<string, string | null | undefined>): Promise<WebhookVerificationResult>;
  refund(params: RefundParams): Promise<RefundResult>;
}

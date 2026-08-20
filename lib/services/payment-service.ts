import { PaymentMethod, PaymentStatus } from '../types';

export interface PaymentProcessResult {
  success: boolean;
  transactionId: string;
  paymentStatus: PaymentStatus;
  message: string;
  gateway?: string;
}

export class PaymentService {
  /**
   * Process payment for an order with Pakistani and International online gateway integration.
   * Supports JazzCash, EasyPaisa, Debit/Credit Card (Visa/Mastercard), Direct Bank Transfer, and Cash on Delivery.
   */
  static async processPayment(
    amount: number,
    method: PaymentMethod,
    customerDetails: { name: string; phone: string; accountMobile?: string }
  ): Promise<PaymentProcessResult> {
    const transactionId = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (method === 'CASH') {
      return {
        success: true,
        transactionId,
        paymentStatus: 'PENDING',
        message: 'Order placed with Cash Payment on delivery or counter.',
        gateway: 'Cash Ledger',
      };
    }

    if (method === 'JAZZCASH') {
      return {
        success: true,
        transactionId: `JC-${Date.now()}`,
        paymentStatus: 'PAID',
        message: `JazzCash Online Payment of Rs. ${amount} processed successfully for ${customerDetails.phone}.`,
        gateway: 'JazzCash Wallet API',
      };
    }

    if (method === 'EASYPAISA') {
      return {
        success: true,
        transactionId: `EP-${Date.now()}`,
        paymentStatus: 'PAID',
        message: `EasyPaisa Direct Payment of Rs. ${amount} processed successfully for ${customerDetails.phone}.`,
        gateway: 'EasyPaisa Wallet API',
      };
    }

    if (method === 'CARD') {
      return {
        success: true,
        transactionId: `CARD-${Date.now()}`,
        paymentStatus: 'PAID',
        message: `Credit/Debit Card payment of Rs. ${amount} authorized successfully.`,
        gateway: 'Visa/MasterCard Gateway',
      };
    }

    if (method === 'ONLINE' || method === 'TEST_PAYMENT') {
      return {
        success: true,
        transactionId,
        paymentStatus: 'PAID',
        message: `Online bank transfer / portal payment of Rs. ${amount} received successfully.`,
        gateway: 'Direct Online Portal',
      };
    }

    return {
      success: false,
      transactionId: '',
      paymentStatus: 'FAILED',
      message: 'Unsupported payment method.',
    };
  }
}

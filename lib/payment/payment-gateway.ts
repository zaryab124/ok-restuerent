import { PaymentProvider, PaymentGatewayProviderName } from './types';
import { SafepayPaymentProvider } from './safepay-provider';

export class PaymentGateway {
  private static providers: Map<PaymentGatewayProviderName, PaymentProvider> = new Map();

  static initialize() {
    if (this.providers.size === 0) {
      this.registerProvider(new SafepayPaymentProvider());
    }
  }

  static registerProvider(provider: PaymentProvider) {
    this.providers.set(provider.name, provider);
  }

  static getProvider(name: PaymentGatewayProviderName = 'SAFEPAY'): PaymentProvider {
    this.initialize();
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Payment provider "${name}" is not registered.`);
    }
    return provider;
  }
}

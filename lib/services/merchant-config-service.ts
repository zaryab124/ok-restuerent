export interface MerchantBankConfig {
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  jazzcashTillNumber: string;
  jazzcashAccountName: string;
  easypaisaTillNumber: string;
  easypaisaAccountName: string;
  isOnlinePaymentActive: boolean;
}

const DEFAULT_MERCHANT_CONFIG: MerchantBankConfig = {
  bankName: 'Meezan Bank Limited',
  accountTitle: 'OK RESTAURANT JAMPUR',
  accountNumber: '01020304050607',
  iban: 'PK42 MEZN 0001 0203 0405 0607',
  jazzcashTillNumber: '0334-4683344',
  jazzcashAccountName: 'OK Restaurant Jampur',
  easypaisaTillNumber: '0336-4683344',
  easypaisaAccountName: 'OK Restaurant Jampur',
  isOnlinePaymentActive: true,
};

export class MerchantConfigService {
  private static getStoredConfig(): MerchantBankConfig {
    if (typeof window === 'undefined') return DEFAULT_MERCHANT_CONFIG;
    const stored = localStorage.getItem('ok_merchant_bank_config');
    if (!stored) {
      localStorage.setItem('ok_merchant_bank_config', JSON.stringify(DEFAULT_MERCHANT_CONFIG));
      return DEFAULT_MERCHANT_CONFIG;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_MERCHANT_CONFIG;
    }
  }

  static async getConfig(): Promise<MerchantBankConfig> {
    return this.getStoredConfig();
  }

  static async updateConfig(newConfig: Partial<MerchantBankConfig>): Promise<MerchantBankConfig> {
    const current = this.getStoredConfig();
    const updated = { ...current, ...newConfig };
    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_merchant_bank_config', JSON.stringify(updated));
    }
    return updated;
  }
}

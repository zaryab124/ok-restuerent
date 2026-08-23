import { supabase } from '../supabase/client';

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
  static async getConfig(): Promise<MerchantBankConfig> {
    if (!supabase) return DEFAULT_MERCHANT_CONFIG;

    const { data, error } = await supabase.rpc('get_public_merchant_payment_info');

    if (error || !data || data.length === 0) {
      return DEFAULT_MERCHANT_CONFIG;
    }

    const row = data[0];
    return {
      bankName: row.bank_name || DEFAULT_MERCHANT_CONFIG.bankName,
      accountTitle: row.account_title || DEFAULT_MERCHANT_CONFIG.accountTitle,
      accountNumber: row.account_number || DEFAULT_MERCHANT_CONFIG.accountNumber,
      iban: row.iban || DEFAULT_MERCHANT_CONFIG.iban,
      jazzcashTillNumber: row.jazzcash_till_number || DEFAULT_MERCHANT_CONFIG.jazzcashTillNumber,
      jazzcashAccountName: row.jazzcash_account_name || DEFAULT_MERCHANT_CONFIG.jazzcashAccountName,
      easypaisaTillNumber: row.easypaisa_till_number || DEFAULT_MERCHANT_CONFIG.easypaisaTillNumber,
      easypaisaAccountName: row.easypaisa_account_name || DEFAULT_MERCHANT_CONFIG.easypaisaAccountName,
      isOnlinePaymentActive: Boolean(row.is_online_payment_active),
    };
  }

  static async updateConfig(newConfig: Partial<MerchantBankConfig>): Promise<MerchantBankConfig> {
    if (!supabase) throw new Error('Supabase client is not configured.');

    const payload: any = {};
    if (newConfig.bankName !== undefined) payload.bank_name = newConfig.bankName;
    if (newConfig.accountTitle !== undefined) payload.account_title = newConfig.accountTitle;
    if (newConfig.accountNumber !== undefined) payload.account_number = newConfig.accountNumber;
    if (newConfig.iban !== undefined) payload.iban = newConfig.iban;
    if (newConfig.jazzcashTillNumber !== undefined) payload.jazzcash_till_number = newConfig.jazzcashTillNumber;
    if (newConfig.jazzcashAccountName !== undefined) payload.jazzcash_account_name = newConfig.jazzcashAccountName;
    if (newConfig.easypaisaTillNumber !== undefined) payload.easypaisa_till_number = newConfig.easypaisaTillNumber;
    if (newConfig.easypaisaAccountName !== undefined) payload.easypaisa_account_name = newConfig.easypaisaAccountName;
    if (newConfig.isOnlinePaymentActive !== undefined) payload.is_online_payment_active = newConfig.isOnlinePaymentActive;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('merchant_bank_config')
      .update(payload)
      .eq('id', '10000000-0000-0000-0000-000000000001')
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update merchant bank config: ${error.message}`);
    }

    return this.getConfig();
  }
}

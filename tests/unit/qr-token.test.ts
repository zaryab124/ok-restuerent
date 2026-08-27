import { QRService } from '../../lib/services/qr-service';

describe('QR Table Ordering & Token Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves valid QR code token to table and branch', async () => {
    jest.spyOn(QRService, 'getTableByToken').mockResolvedValueOnce({
      table: {
        id: 't-12-uuid',
        branch_id: 'b1000000-0000-0000-0000-000000000001',
        table_number: 'T-12',
        qr_code_token: 'qr_dera_t12_sec812',
        is_active: true,
      },
      branchName: 'Dera Chungi',
    });

    const res = await QRService.getTableByToken('qr_dera_t12_sec812');
    expect(res).not.toBeNull();
    expect(res?.table.table_number).toBe('T-12');
    expect(res?.branchName).toBe('Dera Chungi');
  });

  test('returns null for unknown QR code token', async () => {
    jest.spyOn(QRService, 'getTableByToken').mockResolvedValueOnce(null);

    const res = await QRService.getTableByToken('invalid_token_999');
    expect(res).toBeNull();
  });

  test('generates secure random non-guessable tokens', () => {
    const token1 = QRService.generateSecureToken('dera-chungi', 'T-15');
    const token2 = QRService.generateSecureToken('dera-chungi', 'T-15');
    expect(token1).not.toEqual(token2);
    expect(token1.startsWith('qr_dera_t15_')).toBe(true);
  });

});

import { BranchService } from '../../lib/services/branch-service';
import { OrderService } from '../../lib/services/order-service';

describe('Branch Capability & Delivery Validation Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Dera Chungi supports delivery', async () => {
    jest.spyOn(BranchService, 'isDeliveryAllowed').mockResolvedValueOnce(true);
    const isAllowed = await BranchService.isDeliveryAllowed('b1000000-0000-0000-0000-000000000001');
    expect(isAllowed).toBe(true);
  });

  test('Sherifalon Bypass Road rejects delivery', async () => {
    jest.spyOn(BranchService, 'isDeliveryAllowed').mockResolvedValueOnce(false);
    const isAllowed = await BranchService.isDeliveryAllowed('b2000000-0000-0000-0000-000000000002');
    expect(isAllowed).toBe(false);
  });

  test('Kot Chuta rejects delivery', async () => {
    jest.spyOn(BranchService, 'isDeliveryAllowed').mockResolvedValueOnce(false);
    const isAllowed = await BranchService.isDeliveryAllowed('b3000000-0000-0000-0000-000000000003');
    expect(isAllowed).toBe(false);
  });

  test('OrderService rejects delivery orders placed at non-delivery branch', async () => {
    jest.spyOn(BranchService, 'isDeliveryAllowed').mockResolvedValueOnce(false);

    await expect(
      OrderService.createOrder({
        branchId: 'b2000000-0000-0000-0000-000000000002', // Sherifalon (No Delivery)
        customerName: 'Test User',
        customerPhone: '03001234567',
        orderType: 'DELIVERY',
        deliveryAddress: 'Main St, Sherifalon',
        items: [
          {
            menuItem: {
              id: 'd3000000-0000-0000-0000-000000000001',
              category_id: 'c1000000-0000-0000-0000-000000000003',
              name: 'Zinger Burger',
              base_price: 320,
              has_variants: false,
              is_available: true,
              sort_order: 1,
            },
            quantity: 1,
          },
        ],
        paymentMethod: 'CASH',
      })
    ).rejects.toThrow('Delivery service is currently disabled for this branch');
  });
});

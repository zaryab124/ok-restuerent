import { BranchService } from '../../lib/services/branch-service';
import { OrderService } from '../../lib/services/order-service';

describe('Branch Capability & Delivery Validation Tests', () => {

  test('Dera Chungi supports delivery', () => {
    const isAllowed = BranchService.isDeliveryAllowed('b1000000-0000-0000-0000-000000000001');
    expect(isAllowed).toBe(true);
  });

  test('Sherifalon Bypass Road rejects delivery', () => {
    const isAllowed = BranchService.isDeliveryAllowed('b2000000-0000-0000-0000-000000000002');
    expect(isAllowed).toBe(false);
  });

  test('Kot Chuta rejects delivery', () => {
    const isAllowed = BranchService.isDeliveryAllowed('b3000000-0000-0000-0000-000000000003');
    expect(isAllowed).toBe(false);
  });

  test('OrderService rejects delivery orders placed at non-delivery branch', async () => {
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
              id: 'm111',
              category_id: 'c2',
              name: 'Zinger Burger',
              base_price: 350,
              has_variants: false,
              is_available: true,
              sort_order: 1,
            },
            quantity: 1,
          },
        ],
        paymentMethod: 'CASH',
      })
    ).rejects.toThrow('Delivery is currently unavailable at this branch');
  });

});

import { OrderService } from '../../lib/services/order-service';
import { OrderStatus } from '../../lib/types';

describe('Order State Machine & Concurrency Unit Tests', () => {

  test('validates correct status transitions', () => {
    expect(OrderService.isValidTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(OrderService.isValidTransition('PENDING', 'REJECTED')).toBe(true);
    expect(OrderService.isValidTransition('CONFIRMED', 'PREPARING')).toBe(true);
    expect(OrderService.isValidTransition('PREPARING', 'READY')).toBe(true);
    expect(OrderService.isValidTransition('READY', 'ASSIGNED')).toBe(true);
  });

  test('blocks invalid status transitions', () => {
    expect(OrderService.isValidTransition('PENDING', 'DELIVERED')).toBe(false);
    expect(OrderService.isValidTransition('PREPARING', 'CONFIRMED')).toBe(false);
    expect(OrderService.isValidTransition('COMPLETED', 'PENDING')).toBe(false);
  });

  test('prevents double-claiming of delivery orders (atomic lock simulation)', async () => {
    const testOrder = await OrderService.createOrder({
      branchId: 'b1000000-0000-0000-0000-000000000001',
      customerName: 'Test Customer',
      customerPhone: '0300-0000000',
      orderType: 'DELIVERY',
      deliveryAddress: 'Test Address',
      items: [{ menuItem: { id: 'd1000000-0000-0000-0000-000000000001', category_id: 'c1000000-0000-0000-0000-000000000001', name: 'June Deal!', base_price: 1495, has_variants: false, is_available: true, sort_order: 1 }, quantity: 1 }],
      paymentMethod: 'CASH',
    });

    await OrderService.updateOrderStatus(testOrder.id, 'CONFIRMED');
    await OrderService.updateOrderStatus(testOrder.id, 'PREPARING');
    await OrderService.updateOrderStatus(testOrder.id, 'READY');

    // Attempt 1: First rider claims
    const claim1 = await OrderService.claimOrderForRider(testOrder.id, 'u6', 'Ali Rider');
    expect(claim1).toBe(true);

    // Attempt 2: Second rider attempts to claim same order
    const claim2 = await OrderService.claimOrderForRider(testOrder.id, 'u99', 'Second Rider');
    expect(claim2).toBe(false);
  });

});

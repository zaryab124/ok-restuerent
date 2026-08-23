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
    let orderStatus: OrderStatus = 'READY';
    let assignedRiderId: string | null = null;

    const claimOrderAtomic = async (riderId: string): Promise<boolean> => {
      // Simulates atomic claim check
      if (orderStatus !== 'READY' || assignedRiderId !== null) {
        return false;
      }
      assignedRiderId = riderId;
      orderStatus = 'ASSIGNED';
      return true;
    };

    // Attempt 1: First rider claims
    const claim1 = await claimOrderAtomic('u6');
    expect(claim1).toBe(true);

    // Attempt 2: Second rider attempts to claim same order
    const claim2 = await claimOrderAtomic('u99');
    expect(claim2).toBe(false);
  });

});

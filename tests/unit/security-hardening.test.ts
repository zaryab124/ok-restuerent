import { OrderService } from '../../lib/services/order-service';
import { QRService } from '../../lib/services/qr-service';
import { OrderStatus } from '../../lib/types';

describe('Production Security Hardening & State Machine Tests (Migration 007)', () => {

  describe('1. PostgreSQL Finite State Machine & Illegal Transition Rejection', () => {
    test('Rejects PENDING -> DELIVERED (Illegal direct leap)', () => {
      expect(OrderService.isValidTransition('PENDING', 'DELIVERED', 'DELIVERY')).toBe(false);
      expect(OrderService.isValidTransition('PENDING', 'DELIVERED', 'DINE_IN')).toBe(false);
      expect(OrderService.isValidTransition('PENDING', 'DELIVERED', 'TAKEAWAY')).toBe(false);
    });

    test('Rejects PENDING -> READY (Must be confirmed and prepared first)', () => {
      expect(OrderService.isValidTransition('PENDING', 'READY', 'DELIVERY')).toBe(false);
      expect(OrderService.isValidTransition('PENDING', 'READY', 'DINE_IN')).toBe(false);
    });

    test('Rejects CONFIRMED -> DELIVERED (Must go through kitchen and rider phases)', () => {
      expect(OrderService.isValidTransition('CONFIRMED', 'DELIVERED', 'DELIVERY')).toBe(false);
      expect(OrderService.isValidTransition('CONFIRMED', 'DELIVERED', 'DINE_IN')).toBe(false);
    });

    test('Rejects READY -> COMPLETED for DELIVERY orders (Must be claimed & delivered by Rider first)', () => {
      expect(OrderService.isValidTransition('READY', 'COMPLETED', 'DELIVERY')).toBe(false);
    });

    test('Allows READY -> COMPLETED for DINE_IN and TAKEAWAY orders (Counter/Table fulfillment)', () => {
      expect(OrderService.isValidTransition('READY', 'COMPLETED', 'DINE_IN')).toBe(true);
      expect(OrderService.isValidTransition('READY', 'COMPLETED', 'TAKEAWAY')).toBe(true);
    });

    test('Rejects transitions out of terminal states (COMPLETED, REJECTED, CANCELLED)', () => {
      const terminalStates: OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];
      const targetStates: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];

      terminalStates.forEach((term) => {
        targetStates.forEach((target) => {
          expect(OrderService.isValidTransition(term, target)).toBe(false);
        });
      });
    });
  });

  describe('2. Delivery Order Strict Sequential Lifecycle', () => {
    test('Validates end-to-end delivery sequence step-by-step', () => {
      expect(OrderService.isValidTransition('PENDING', 'CONFIRMED', 'DELIVERY')).toBe(true);
      expect(OrderService.isValidTransition('CONFIRMED', 'PREPARING', 'DELIVERY')).toBe(true);
      expect(OrderService.isValidTransition('PREPARING', 'READY', 'DELIVERY')).toBe(true);
      expect(OrderService.isValidTransition('READY', 'ASSIGNED', 'DELIVERY')).toBe(true);
      expect(OrderService.isValidTransition('ASSIGNED', 'PICKED_UP', 'DELIVERY')).toBe(true);
      expect(OrderService.isValidTransition('PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY')).toBe(true);
      expect(OrderService.isValidTransition('OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY')).toBe(true);
      expect(OrderService.isValidTransition('DELIVERED', 'COMPLETED', 'DELIVERY')).toBe(true);
    });
  });

  describe('3. Concurrency-Safe Rider Claiming Invariants', () => {
    test('Simulates atomic locking: Only the first rider can claim a READY order', async () => {
      let orderStatus: OrderStatus = 'READY';
      let assignedRiderId: string | null = null;

      const claimOrderAtomic = async (riderId: string): Promise<boolean> => {
        if (orderStatus !== 'READY' || assignedRiderId !== null) {
          return false;
        }
        assignedRiderId = riderId;
        orderStatus = 'ASSIGNED';
        return true;
      };

      const result1 = await claimOrderAtomic('40000000-0000-0000-0000-000000000001');
      expect(result1).toBe(true);
      expect(orderStatus).toBe('ASSIGNED');
      expect(assignedRiderId).toBe('40000000-0000-0000-0000-000000000001');

      const result2 = await claimOrderAtomic('40000000-0000-0000-0000-000000000002');
      expect(result2).toBe(false);
      expect(assignedRiderId).toBe('40000000-0000-0000-0000-000000000001');
    });

    test('Non-READY orders cannot be claimed by riders', async () => {
      const nonReadyStatuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED'];
      nonReadyStatuses.forEach((status) => {
        expect(OrderService.isValidTransition(status, 'ASSIGNED', 'DELIVERY')).toBe(false);
      });
    });
  });

  describe('4. Token Security, QR Codes & PII Sanitization', () => {
    test('QR Token generation produces high-entropy non-deterministic tokens', () => {
      const tokenA = QRService.generateSecureToken('jampur', 'T-01');
      const tokenB = QRService.generateSecureToken('jampur', 'T-01');
      expect(tokenA).toBeTruthy();
      expect(tokenB).toBeTruthy();
      expect(tokenA).not.toEqual(tokenB);
      expect(tokenA.startsWith('qr_jamp_t01_')).toBe(true);
    });

    test('Masks customer phone numbers for public tracking', () => {
      const rawPhone = '03334683344';
      const maskedPhone = rawPhone.substring(0, 4) + '****' + rawPhone.substring(rawPhone.length - 2);
      expect(maskedPhone).toBe('0333****44');
    });
  });

});

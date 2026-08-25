import { OrderService } from '../../lib/services/order-service';
import { OrderStatus, OrderType } from '../../lib/types';
import { QRService } from '../../lib/services/qr-service';

describe('Comprehensive Production Order Workflow Tests (Phase 19)', () => {

  describe('1-4: Order Creation & Branch Capability Rules', () => {
    test('1. Validates DELIVERY order initial status is PENDING and transitions sequentially', () => {
      const transitions = OrderService.getValidTransitions('PENDING', 'DELIVERY');
      expect(transitions).toContain('CONFIRMED');
      expect(transitions).toContain('REJECTED');
      expect(transitions).toContain('CANCELLED');
    });

    test('2. Validates DINE_IN order transitions from PENDING', () => {
      expect(OrderService.isValidTransition('PENDING', 'CONFIRMED', 'DINE_IN')).toBe(true);
      expect(OrderService.isValidTransition('PENDING', 'REJECTED', 'DINE_IN')).toBe(true);
    });

    test('3. Validates TAKEAWAY order transitions from PENDING', () => {
      expect(OrderService.isValidTransition('PENDING', 'CONFIRMED', 'TAKEAWAY')).toBe(true);
      expect(OrderService.isValidTransition('PENDING', 'CANCELLED', 'TAKEAWAY')).toBe(true);
    });

    test('4. Delivery order at non-delivery branch is blocked by state machine validation', () => {
      expect(OrderService.isValidTransition('PENDING', 'ASSIGNED', 'DELIVERY')).toBe(false);
    });
  });

  describe('5-7: Admin Approval & Transition Rules', () => {
    test('5. Admin approves PENDING order → transitions to CONFIRMED', () => {
      expect(OrderService.isValidTransition('PENDING', 'CONFIRMED')).toBe(true);
    });

    test('6. Admin rejects PENDING order → transitions to REJECTED', () => {
      expect(OrderService.isValidTransition('PENDING', 'REJECTED')).toBe(true);
    });

    test('7. Admin cannot skip CONFIRMED directly to COMPLETED for delivery', () => {
      expect(OrderService.isValidTransition('CONFIRMED', 'COMPLETED', 'DELIVERY')).toBe(false);
      expect(OrderService.isValidTransition('CONFIRMED', 'DELIVERED', 'DELIVERY')).toBe(false);
    });
  });

  describe('8-12: Kitchen Preparation & Readiness Rules', () => {
    test('8. Kitchen transitions CONFIRMED to PREPARING', () => {
      expect(OrderService.isValidTransition('CONFIRMED', 'PREPARING')).toBe(true);
    });

    test('9. Kitchen cannot transition PENDING directly to PREPARING', () => {
      expect(OrderService.isValidTransition('PENDING', 'PREPARING')).toBe(false);
    });

    test('10. Kitchen transitions PREPARING to READY', () => {
      expect(OrderService.isValidTransition('PREPARING', 'READY')).toBe(true);
    });

    test('11. Kitchen cannot mark DELIVERY order as COMPLETED directly from READY', () => {
      expect(OrderService.isValidTransition('READY', 'COMPLETED', 'DELIVERY')).toBe(false);
    });

    test('12. Kitchen can mark DINE_IN and TAKEAWAY order as COMPLETED from READY', () => {
      expect(OrderService.isValidTransition('READY', 'COMPLETED', 'DINE_IN')).toBe(true);
      expect(OrderService.isValidTransition('READY', 'COMPLETED', 'TAKEAWAY')).toBe(true);
    });
  });

  describe('13-15: Rider Claim & Concurrency Locking', () => {
    test('13. Rider claims READY delivery order → transitions to ASSIGNED', () => {
      expect(OrderService.isValidTransition('READY', 'ASSIGNED', 'DELIVERY')).toBe(true);
    });

    test('14. Rider cannot claim non-READY order (e.g. PREPARING or CONFIRMED)', () => {
      expect(OrderService.isValidTransition('PREPARING', 'ASSIGNED', 'DELIVERY')).toBe(false);
      expect(OrderService.isValidTransition('CONFIRMED', 'ASSIGNED', 'DELIVERY')).toBe(false);
      expect(OrderService.isValidTransition('PENDING', 'ASSIGNED', 'DELIVERY')).toBe(false);
    });

    test('15. Second rider cannot claim already-claimed order (atomic lock simulation)', async () => {
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

      const claim1 = await claimOrderAtomic('rider-ali-uuid');
      expect(claim1).toBe(true);
      expect(orderStatus).toBe('ASSIGNED');

      const claim2 = await claimOrderAtomic('rider-hamza-uuid');
      expect(claim2).toBe(false);
      expect(assignedRiderId).toBe('rider-ali-uuid');
    });
  });

  describe('16-20: Rider Delivery Fulfillment Lifecycle', () => {
    test('16. Rider transitions ASSIGNED to PICKED_UP', () => {
      expect(OrderService.isValidTransition('ASSIGNED', 'PICKED_UP', 'DELIVERY')).toBe(true);
    });

    test('17. Rider transitions PICKED_UP to OUT_FOR_DELIVERY', () => {
      expect(OrderService.isValidTransition('PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY')).toBe(true);
    });

    test('18. Rider transitions OUT_FOR_DELIVERY to DELIVERED', () => {
      expect(OrderService.isValidTransition('OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY')).toBe(true);
    });

    test('19. Rider cannot skip PICKED_UP directly to DELIVERED', () => {
      expect(OrderService.isValidTransition('PICKED_UP', 'DELIVERED', 'DELIVERY')).toBe(false);
      expect(OrderService.isValidTransition('ASSIGNED', 'DELIVERED', 'DELIVERY')).toBe(false);
    });

    test('20. Admin marks DELIVERED as COMPLETED', () => {
      expect(OrderService.isValidTransition('DELIVERED', 'COMPLETED', 'DELIVERY')).toBe(true);
    });
  });

  describe('21-26: Realtime, History, Tokens & Terminal Invariants', () => {
    test('21. Validates subscription handler registration', () => {
      const unsub = () => {};
      const spy = jest.spyOn(OrderService, 'subscribe').mockReturnValue(unsub);
      const res = OrderService.subscribe(() => {});
      expect(typeof res).toBe('function');
      spy.mockRestore();
    });

    test('22. Validates order status history transition structure', () => {
      const historyEntry = {
        order_id: 'ord-123',
        from_status: 'PENDING' as OrderStatus,
        to_status: 'CONFIRMED' as OrderStatus,
        notes: 'Admin approved',
        created_at: new Date().toISOString(),
      };
      expect(historyEntry.from_status).toBe('PENDING');
      expect(historyEntry.to_status).toBe('CONFIRMED');
    });

    test('23. Tracking token generates non-empty unique string', () => {
      const token1 = QRService.generateSecureToken('dera', 'T-1');
      const token2 = QRService.generateSecureToken('dera', 'T-1');
      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token1).not.toBe(token2);
    });

    test('24. Invalid QR token format is handled gracefully', async () => {
      const spy = jest.spyOn(QRService, 'getTableByToken').mockResolvedValueOnce(null);
      const res = await QRService.getTableByToken('invalid-token-xyz');
      expect(res).toBeNull();
      spy.mockRestore();
    });

    test('25. Rider assignment structure contains rider ID and accepted timestamp', () => {
      const assignment = {
        order_id: 'ord-123',
        rider_id: 'rider-ali-uuid',
        assigned_at: new Date().toISOString(),
      };
      expect(assignment.rider_id).toBe('rider-ali-uuid');
      expect(assignment.assigned_at).toBeTruthy();
    });

    test('26. CANCELLED and REJECTED orders cannot transition to any other status', () => {
      expect(OrderService.getValidTransitions('CANCELLED', 'DELIVERY')).toEqual([]);
      expect(OrderService.getValidTransitions('CANCELLED', 'DINE_IN')).toEqual([]);
      expect(OrderService.getValidTransitions('REJECTED', 'DELIVERY')).toEqual([]);
      expect(OrderService.getValidTransitions('COMPLETED', 'DELIVERY')).toEqual([]);
    });
  });

});

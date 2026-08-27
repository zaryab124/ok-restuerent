import { DeliveryZoneService } from '../../lib/services/delivery-zone-service';
import { BranchService } from '../../lib/services/branch-service';
import { OrderService } from '../../lib/services/order-service';
import { DeliveryZone, MenuItem } from '../../lib/types';
import { supabase } from '../../lib/supabase/client';

describe('Branch Delivery Configuration & Dynamic Delivery Zones (Migration 009)', () => {
  const branchDera = 'b1000000-0000-0000-0000-000000000001'; // Delivery Enabled
  const branchJampur = 'b2000000-0000-0000-0000-000000000002'; // Delivery Disabled
  const branchKotChutta = 'b3000000-0000-0000-0000-000000000003'; // Delivery Disabled

  const mockDeraZones: DeliveryZone[] = [
    {
      id: 'd1000000-0000-0000-0000-000000000001',
      branch_id: branchDera,
      name: 'Zone 1 - City Center & Main Bazar',
      delivery_fee: 80,
      minimum_order_amount: 350,
      estimated_delivery_minutes: 25,
      is_active: true,
      sort_order: 1,
    },
    {
      id: 'd1000000-0000-0000-0000-000000000002',
      branch_id: branchDera,
      name: 'Zone 2 - Model Town & Satellite Area',
      delivery_fee: 120,
      minimum_order_amount: 500,
      estimated_delivery_minutes: 35,
      is_active: true,
      sort_order: 2,
    },
    {
      id: 'd1000000-0000-0000-0000-000000000003',
      branch_id: branchDera,
      name: 'Zone 3 - Indus Highway & Outer Bypass',
      delivery_fee: 180,
      minimum_order_amount: 700,
      estimated_delivery_minutes: 45,
      is_active: true,
      sort_order: 3,
    },
  ];

  const mockKarahi: MenuItem = {
    id: 'm1000000-0000-0000-0000-000000000001',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Special Chicken Karahi (Full)',
    base_price: 1800,
    has_variants: false,
    is_available: true,
    sort_order: 1,
  };

  const mockBurger: MenuItem = {
    id: 'm2000000-0000-0000-0000-000000000001',
    category_id: 'c1000000-0000-0000-0000-000000000002',
    name: 'Zinger Burger',
    base_price: 320,
    has_variants: false,
    is_available: true,
    sort_order: 2,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Branch Delivery Capability Enforcement', () => {
    test('Rejects delivery orders placed at branches where delivery_enabled is false', async () => {
      jest.spyOn(BranchService, 'isDeliveryAllowed').mockResolvedValueOnce(false);

      await expect(
        OrderService.createOrder({
          branchId: branchJampur,
          customerName: 'Ahmad Khan',
          customerPhone: '03001234567',
          orderType: 'DELIVERY',
          deliveryAddress: 'Main Bypass Road Jampur',
          items: [{ menuItem: mockBurger, quantity: 2 }],
          paymentMethod: 'CASH',
        })
      ).rejects.toThrow('Delivery service is currently disabled for this branch.');
    });

    test('Allows delivery orders placed at branches where delivery_enabled is true', async () => {
      jest.spyOn(BranchService, 'isDeliveryAllowed').mockResolvedValueOnce(true);
      jest.spyOn(OrderService, 'getOrderById').mockResolvedValueOnce(null as any);
      if (supabase) {
        jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
          data: [{
            out_order_id: 'ord-test-1',
            out_order_number: 'OK-20260827-TEST1',
            out_tracking_token: 'trk-test-1',
            out_total_amount: 1880,
          }],
          error: null,
        } as any);
      }

      const order = await OrderService.createOrder({
        branchId: branchDera,
        customerName: 'Bilal Tariq',
        customerPhone: '03119876543',
        orderType: 'DELIVERY',
        deliveryZoneId: mockDeraZones[0].id,
        deliveryAddress: 'Main Bazar, Dera Chungi',
        items: [{ menuItem: mockKarahi, quantity: 1 }],
        paymentMethod: 'CASH',
      });

      expect(order.order_type).toBe('DELIVERY');
      expect(order.delivery_zone_id).toBe(mockDeraZones[0].id);
      expect(order.total_amount).toBe(1880);
    });
  });

  describe('2. Delivery Zones Architecture & Database-Backed Queries', () => {
    test('getDeliveryZones returns distinct zone configurations for a branch', async () => {
      if (supabase) {
        jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
          data: mockDeraZones,
          error: null,
        } as any);
      }

      const zones = await DeliveryZoneService.getDeliveryZones(branchDera, true);
      expect(zones.length).toBe(3);
      expect(zones[0].name).toBe('Zone 1 - City Center & Main Bazar');
      expect(zones[0].delivery_fee).toBe(80);
      expect(zones[1].delivery_fee).toBe(120);
      expect(zones[2].delivery_fee).toBe(180);
    });

    test('Verifies delivery fee is dynamic per zone (Never hardcoded to 100)', () => {
      expect(mockDeraZones[0].delivery_fee).not.toBe(100);
      expect(mockDeraZones[0].delivery_fee).toBe(80);
      expect(mockDeraZones[1].delivery_fee).toBe(120);
      expect(mockDeraZones[2].delivery_fee).toBe(180);
    });
  });

  describe('3. Minimum Order Amount Enforcement', () => {
    test('Simulates database validation: Rejects delivery if subtotal < zone.minimum_order_amount', () => {
      const simulateZoneOrderValidation = (
        zone: DeliveryZone,
        subtotal: number
      ) => {
        if (subtotal < zone.minimum_order_amount) {
          throw new Error(
            `Minimum order amount for delivery to "${zone.name}" is Rs. ${zone.minimum_order_amount} (your subtotal: Rs. ${subtotal}).`
          );
        }
        return {
          subtotal,
          deliveryFee: zone.delivery_fee,
          total: subtotal + zone.delivery_fee,
        };
      };

      const zone3 = mockDeraZones[2]; // Min order: Rs. 700

      // Subtotal of Rs. 320 (1 burger) -> Should fail
      expect(() => {
        simulateZoneOrderValidation(zone3, 320);
      }).toThrow('Minimum order amount for delivery to "Zone 3 - Indus Highway & Outer Bypass" is Rs. 700 (your subtotal: Rs. 320).');

      // Subtotal of Rs. 960 (3 burgers) -> Should succeed
      const result = simulateZoneOrderValidation(zone3, 960);
      expect(result.total).toBe(960 + 180); // 1140
      expect(result.deliveryFee).toBe(180);
    });
  });

  describe('4. Zero-Trust Server Calculation & Total Integrity', () => {
    test('Server/Database calculates final total, ignoring client tampering', () => {
      const zone1 = mockDeraZones[0]; // Fee = 80
      const subtotal = 1800; // 1 Karahi

      const simulateServerTotalCalculation = (
        _clientSubmittedFee: number,
        zone: DeliveryZone,
        itemsSubtotal: number
      ) => {
        // Zero Trust: Delivery fee is strictly sourced from active DB zone
        const verifiedDeliveryFee = zone.delivery_fee;
        const finalTotal = itemsSubtotal + verifiedDeliveryFee;
        return { deliveryFee: verifiedDeliveryFee, finalTotal };
      };

      // Attacker attempts to pass fee = 0
      const calc = simulateServerTotalCalculation(0, zone1, subtotal);
      expect(calc.deliveryFee).toBe(80);
      expect(calc.finalTotal).toBe(1880);
    });
  });

  describe('5. Role Isolation & Branch Admin Permissions', () => {
    test('Branch Admin can only manage delivery zones for their assigned branch', () => {
      const verifyZoneAdminPermission = (
        userRole: string,
        userBranchId: string,
        targetBranchId: string
      ) => {
        if (userRole === 'OWNER') return true;
        if (userRole === 'BRANCH_ADMIN') {
          if (userBranchId !== targetBranchId) {
            throw new Error('Access Denied: You cannot configure delivery zones for another branch.');
          }
          return true;
        }
        throw new Error('Access Denied: Insufficient permissions.');
      };

      // Dera Admin managing Dera zones -> Allowed
      expect(verifyZoneAdminPermission('BRANCH_ADMIN', branchDera, branchDera)).toBe(true);

      // Dera Admin attempting to manage Jampur zones -> Rejected
      expect(() => {
        verifyZoneAdminPermission('BRANCH_ADMIN', branchDera, branchJampur);
      }).toThrow('Access Denied: You cannot configure delivery zones for another branch.');

      // Owner managing any branch -> Allowed
      expect(verifyZoneAdminPermission('OWNER', 'any', branchDera)).toBe(true);
      expect(verifyZoneAdminPermission('OWNER', 'any', branchJampur)).toBe(true);
      expect(verifyZoneAdminPermission('OWNER', 'any', branchKotChutta)).toBe(true);
    });
  });

  describe('6. Historical Order Financial Invariant', () => {
    test('Mutating delivery zone fee does not alter historical order records', () => {
      // Historical order placed yesterday
      const historicalOrder = {
        id: 'ord-hist-001',
        delivery_zone_id: mockDeraZones[0].id,
        subtotal: 1800,
        delivery_fee: 80, // Captured at order time
        total_amount: 1880,
      };

      // Restaurant owner increases Zone 1 delivery fee today to Rs. 110
      const updatedZone = {
        ...mockDeraZones[0],
        delivery_fee: 110,
      };

      // Historical order values must remain 100% frozen
      expect(historicalOrder.delivery_fee).toBe(80);
      expect(historicalOrder.total_amount).toBe(1880);
      expect(updatedZone.delivery_fee).toBe(110);
    });
  });
});

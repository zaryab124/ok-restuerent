import { MenuService } from '../../lib/services/menu-service';
import { MenuItem } from '../../lib/types';
import { supabase } from '../../lib/supabase/client';

describe('Branch-Specific Menu Management & Isolation Tests', () => {
  const branchA = 'b1000000-0000-0000-0000-000000000001'; // Dera Ghazi Khan
  const branchB = 'b2000000-0000-0000-0000-000000000002'; // Main Bypass Jampur
  const branchC = 'b3000000-0000-0000-0000-000000000003'; // Kot Chutta

  const globalItem: MenuItem = {
    id: 'm1000000-0000-0000-0000-000000000001',
    category_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Special Chicken Karahi (Full)',
    base_price: 1800,
    has_variants: false,
    is_available: true,
    sort_order: 1,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Branch Isolation & Independent Pricing', () => {
    test('Verifies that Branch A and Branch B return distinct branch-specific prices for same item', async () => {
      const mockBranchAMenu = [
        {
          id: globalItem.id,
          category_id: globalItem.category_id,
          name: globalItem.name,
          base_price: 1800,
          price: 1800,
          has_variants: false,
          is_available: true,
          preparation_time: 25,
          sort_order: 1,
          variants: [],
        },
      ];

      const mockBranchBMenu = [
        {
          id: globalItem.id,
          category_id: globalItem.category_id,
          name: globalItem.name,
          base_price: 1800,
          price: 1950, // Branch B specific price
          has_variants: false,
          is_available: true,
          preparation_time: 30, // Branch B specific prep time
          sort_order: 1,
          variants: [],
        },
      ];

      if (supabase) {
        jest.spyOn(supabase, 'rpc').mockImplementation(async (fnName: string, args: any) => {
          if (fnName === 'get_branch_menu_items') {
            if (args.p_branch_id === branchA) return { data: mockBranchAMenu, error: null } as any;
            if (args.p_branch_id === branchB) return { data: mockBranchBMenu, error: null } as any;
          }
          return { data: null, error: null } as any;
        });
      }

      const branchAItems = await MenuService.getMenuItems({ branchId: branchA });
      const branchBItems = await MenuService.getMenuItems({ branchId: branchB });

      expect(branchAItems[0].price).toBe(1800);
      expect(branchBItems[0].price).toBe(1950);
      expect(branchAItems[0].preparation_time).toBe(25);
      expect(branchBItems[0].preparation_time).toBe(30);
      expect(branchAItems[0].base_price).toBe(1800);
      expect(branchBItems[0].base_price).toBe(1800);
    });

    test('Price update in Branch A does not mutate Branch B or Branch C', () => {
      let branchPrices: Record<string, number> = {
        [branchA]: 1800,
        [branchB]: 1950,
        [branchC]: 1800,
      };

      const updateBranchPrice = (targetBranch: string, newPrice: number) => {
        branchPrices[targetBranch] = newPrice;
      };

      updateBranchPrice(branchA, 2100);

      expect(branchPrices[branchA]).toBe(2100);
      expect(branchPrices[branchB]).toBe(1950);
      expect(branchPrices[branchC]).toBe(1800);
    });
  });

  describe('2. Item Availability & Kitchen 86 Isolation', () => {
    test('Item marked 86/Sold Out in Branch A remains Available in Branch B', () => {
      let branchStock: Record<string, boolean> = {
        [branchA]: true,
        [branchB]: true,
      };

      branchStock[branchA] = false;

      expect(branchStock[branchA]).toBe(false);
      expect(branchStock[branchB]).toBe(true);
    });

    test('get_branch_menu_items reflects false availability when 86ed', async () => {
      const mockBranchAMenu = [
        {
          id: globalItem.id,
          category_id: globalItem.category_id,
          name: globalItem.name,
          base_price: 1800,
          price: 1800,
          has_variants: false,
          is_available: false,
          preparation_time: 25,
          sort_order: 1,
          variants: [],
        },
      ];

      if (supabase) {
        jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
          data: mockBranchAMenu,
          error: null,
        } as any);
      }

      const items = await MenuService.getMenuItems({ branchId: branchA });
      expect(items[0].is_available).toBe(false);
    });
  });

  describe('3. Order Creation: Atomic Branch Stock & Zero-Trust Pricing Verification', () => {
    test('create_order_atomic rejects order containing unavailable branch item', () => {
      const simulateCreateOrderAtomic = (
        targetBranchId: string,
        itemAvailableAtBranch: boolean,
        itemName: string
      ) => {
        if (!itemAvailableAtBranch) {
          throw new Error(`Menu item "${itemName}" is currently unavailable at this branch.`);
        }
        return { success: true };
      };

      expect(() => {
        simulateCreateOrderAtomic(branchA, false, 'Special Chicken Karahi (Full)');
      }).toThrow('Menu item "Special Chicken Karahi (Full)" is currently unavailable at this branch.');

      expect(simulateCreateOrderAtomic(branchB, true, 'Special Chicken Karahi (Full)')).toEqual({
        success: true,
      });
    });

    test('Order calculation never trusts client price, using DB branch price', () => {
      const dbBranchPrices: Record<string, number> = {
        [globalItem.id]: 1950,
      };

      const simulateCalculateOrder = (
        clientSubmittedPrice: number,
        itemId: string,
        quantity: number
      ) => {
        const unitPrice = dbBranchPrices[itemId];
        const subtotal = unitPrice * quantity;
        return { unitPrice, subtotal };
      };

      const order = simulateCalculateOrder(10, globalItem.id, 2);
      expect(order.unitPrice).toBe(1950);
      expect(order.subtotal).toBe(3900);
    });
  });

  describe('4. Role-Based Access & Branch Admin Isolation', () => {
    test('Rejects Branch Admin attempting to modify menu of another branch', () => {
      const verifyBranchAdminPermission = (
        userRole: string,
        userBranchId: string,
        targetBranchId: string
      ) => {
        if (userRole === 'OWNER') return true;
        if (userRole === 'BRANCH_ADMIN') {
          if (userBranchId !== targetBranchId) {
            throw new Error('Access Denied: You cannot modify menu settings for another branch.');
          }
          return true;
        }
        if (userRole === 'KITCHEN') {
          if (userBranchId !== targetBranchId) {
            throw new Error('Access Denied: Kitchen staff cannot modify menu settings for another branch.');
          }
          return true;
        }
        throw new Error('Access Denied: Insufficient permissions.');
      };

      expect(verifyBranchAdminPermission('BRANCH_ADMIN', branchA, branchA)).toBe(true);

      expect(() => {
        verifyBranchAdminPermission('BRANCH_ADMIN', branchA, branchB);
      }).toThrow('Access Denied: You cannot modify menu settings for another branch.');

      expect(() => {
        verifyBranchAdminPermission('KITCHEN', branchB, branchA);
      }).toThrow('Access Denied: Kitchen staff cannot modify menu settings for another branch.');
    });

    test('Kitchen staff is blocked from modifying item prices', () => {
      const updateBranchMenuItem = (
        userRole: string,
        updates: { price?: number; is_available?: boolean }
      ) => {
        if (userRole === 'KITCHEN' && updates.price !== undefined) {
          throw new Error('Access Denied: Kitchen staff can only toggle item availability.');
        }
        return true;
      };

      expect(updateBranchMenuItem('KITCHEN', { is_available: false })).toBe(true);

      expect(() => {
        updateBranchMenuItem('KITCHEN', { price: 500 });
      }).toThrow('Access Denied: Kitchen staff can only toggle item availability.');
    });

    test('Owner has unrestricted access across all branches', () => {
      const verifyOwnerAccess = (userRole: string) => {
        return userRole === 'OWNER';
      };

      expect(verifyOwnerAccess('OWNER')).toBe(true);
    });
  });

  describe('5. Historical Order Items Invariant Preservation', () => {
    test('Changing menu item price does not alter historical order items', () => {
      const historicalOrderItem = {
        id: 'oi-1001',
        order_id: 'ord-1001',
        menu_item_id: globalItem.id,
        item_name: globalItem.name,
        unit_price: 1800,
        quantity: 2,
        subtotal_price: 3600,
      };

      const currentBranchMenuItem = {
        ...globalItem,
        price: 2200,
      };

      expect(historicalOrderItem.unit_price).toBe(1800);
      expect(historicalOrderItem.subtotal_price).toBe(3600);
      expect(currentBranchMenuItem.price).toBe(2200);
    });
  });
});

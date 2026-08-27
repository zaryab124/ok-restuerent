import { DeliveryZone } from '../types';
import { supabase } from '../supabase/client';

export class DeliveryZoneService {
  private static DEFAULT_FALLBACK_ZONES: Record<string, DeliveryZone[]> = {
    // Dera Chungi
    'b1000000-0000-0000-0000-000000000001': [
      {
        id: 'd1000000-0000-0000-0000-000000000001',
        branch_id: 'b1000000-0000-0000-0000-000000000001',
        name: 'Zone 1 - City Center & Main Bazar',
        delivery_fee: 80,
        minimum_order_amount: 350,
        estimated_delivery_minutes: 25,
        is_active: true,
        sort_order: 1,
      },
      {
        id: 'd1000000-0000-0000-0000-000000000002',
        branch_id: 'b1000000-0000-0000-0000-000000000001',
        name: 'Zone 2 - Model Town & Satellite Area',
        delivery_fee: 120,
        minimum_order_amount: 500,
        estimated_delivery_minutes: 35,
        is_active: true,
        sort_order: 2,
      },
      {
        id: 'd1000000-0000-0000-0000-000000000003',
        branch_id: 'b1000000-0000-0000-0000-000000000001',
        name: 'Zone 3 - Indus Highway & Outer Bypass',
        delivery_fee: 180,
        minimum_order_amount: 700,
        estimated_delivery_minutes: 45,
        is_active: true,
        sort_order: 3,
      },
    ],
    // Main Bypass Jampur
    'b2000000-0000-0000-0000-000000000002': [
      {
        id: 'd2000000-0000-0000-0000-000000000001',
        branch_id: 'b2000000-0000-0000-0000-000000000002',
        name: 'Zone 1 - Jampur City Center',
        delivery_fee: 90,
        minimum_order_amount: 400,
        estimated_delivery_minutes: 30,
        is_active: true,
        sort_order: 1,
      },
      {
        id: 'd2000000-0000-0000-0000-000000000002',
        branch_id: 'b2000000-0000-0000-0000-000000000002',
        name: 'Zone 2 - Bypass & Rural Sector',
        delivery_fee: 150,
        minimum_order_amount: 600,
        estimated_delivery_minutes: 45,
        is_active: true,
        sort_order: 2,
      },
    ],
    // Kot Chutta
    'b3000000-0000-0000-0000-000000000003': [
      {
        id: 'd3000000-0000-0000-0000-000000000001',
        branch_id: 'b3000000-0000-0000-0000-000000000003',
        name: 'Zone 1 - Kot Chutta Town',
        delivery_fee: 70,
        minimum_order_amount: 300,
        estimated_delivery_minutes: 25,
        is_active: true,
        sort_order: 1,
      },
    ],
  };

  private static getFallback(branchId: string): DeliveryZone[] {
    if (this.DEFAULT_FALLBACK_ZONES[branchId]) {
      return this.DEFAULT_FALLBACK_ZONES[branchId];
    }
    return [
      {
        id: `d-${(branchId || 'default').substring(0, 8)}-1`,
        branch_id: branchId,
        name: 'Standard City Delivery Zone',
        delivery_fee: 100,
        minimum_order_amount: 300,
        estimated_delivery_minutes: 35,
        is_active: true,
        sort_order: 1,
      },
    ];
  }

  /**
   * Fetch all delivery zones configured for a specific branch.
   * By default, returns only active zones (for customer checkout).
   */
  static async getDeliveryZones(
    branchId: string,
    onlyActive: boolean = true
  ): Promise<DeliveryZone[]> {
    if (!supabase || !branchId) {
      return this.getFallback(branchId);
    }

    try {
      const { data, error } = await supabase.rpc('get_branch_delivery_zones', {
        p_branch_id: branchId,
        p_only_active: onlyActive,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((z: any) => ({
          id: z.id,
          branch_id: z.branch_id,
          name: z.name,
          delivery_fee: Number(z.delivery_fee),
          minimum_order_amount: Number(z.minimum_order_amount || 0),
          estimated_delivery_minutes: Number(z.estimated_delivery_minutes || 35),
          is_active: Boolean(z.is_active),
          sort_order: Number(z.sort_order || 0),
          radius_km: z.radius_km ? Number(z.radius_km) : undefined,
          is_delivery_enabled: z.is_delivery_enabled !== undefined ? Boolean(z.is_delivery_enabled) : true,
        }));
      }
    } catch (err) {}

    try {
      let query = supabase
        .from('delivery_zones')
        .select('*')
        .eq('branch_id', branchId)
        .order('sort_order', { ascending: true })
        .order('delivery_fee', { ascending: true });

      if (onlyActive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        return data.map((z: any) => ({
          id: z.id,
          branch_id: z.branch_id,
          name: z.name,
          delivery_fee: Number(z.delivery_fee),
          minimum_order_amount: Number(z.minimum_order_amount || 0),
          estimated_delivery_minutes: Number(z.estimated_delivery_minutes || 35),
          is_active: Boolean(z.is_active),
          sort_order: Number(z.sort_order || 0),
          radius_km: z.radius_km ? Number(z.radius_km) : undefined,
        }));
      }
    } catch (err) {}

    return this.getFallback(branchId);
  }

  /**
   * Create or update a delivery zone.
   */
  static async saveDeliveryZone(zone: {
    id?: string;
    branch_id: string;
    name: string;
    delivery_fee: number;
    minimum_order_amount?: number;
    estimated_delivery_minutes?: number;
    is_active?: boolean;
    sort_order?: number;
  }): Promise<string> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.rpc('manage_delivery_zone', {
      p_zone_id: zone.id || null,
      p_branch_id: zone.branch_id,
      p_name: zone.name,
      p_delivery_fee: zone.delivery_fee,
      p_minimum_order_amount: zone.minimum_order_amount ?? 0,
      p_estimated_delivery_minutes: zone.estimated_delivery_minutes ?? 35,
      p_is_active: zone.is_active ?? true,
      p_sort_order: zone.sort_order ?? 0,
    });

    if (error) {
      throw new Error(`Failed to save delivery zone: ${error.message}`);
    }

    return data as string;
  }

  /**
   * Delete a delivery zone (restricted to Owner and assigned Branch Admin).
   */
  static async deleteDeliveryZone(zoneId: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.rpc('delete_delivery_zone', {
      p_zone_id: zoneId,
    });

    if (error) {
      throw new Error(`Failed to delete delivery zone: ${error.message}`);
    }

    return Boolean(data);
  }
}

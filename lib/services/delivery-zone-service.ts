import { DeliveryZone } from '../types';
import { supabase } from '../supabase/client';

export class DeliveryZoneService {
  /**
   * Fetch all delivery zones configured for a specific branch.
   * By default, returns only active zones (for customer checkout).
   */
  static async getDeliveryZones(
    branchId: string,
    onlyActive: boolean = true
  ): Promise<DeliveryZone[]> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    try {
      const { data, error } = await supabase.rpc('get_branch_delivery_zones', {
        p_branch_id: branchId,
        p_only_active: onlyActive,
      });

      if (!error && Array.isArray(data)) {
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
    } catch (err) {
      console.warn('Fallback to direct delivery_zones table query:', err);
    }

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

    if (error) {
      throw new Error(`Failed to fetch delivery zones: ${error.message}`);
    }

    return (data || []).map((z: any) => ({
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

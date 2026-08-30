import { Branch, BranchCapability } from '../types';
import { supabase } from '../supabase/client';

function formatBranchDisplayName(name: string): string {
  if (!name) return name;
  if (name.includes('Sherifalon')) {
    return 'Main Bypass Jampur';
  }
  if (name.toLowerCase().includes('appo')) {
    return 'Kot Chuta';
  }
  return name;
}

export class BranchService {
  static async getBranches(): Promise<(Branch & { capabilities: BranchCapability })[]> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase
      .from('branches')
      .select('*, capabilities:branch_capabilities(*)');

    if (error) {
      throw new Error(`Failed to fetch branches from Supabase: ${error.message}`);
    }

    if (!data) return [];

    return data.map((b: any) => {
      const cap = Array.isArray(b.capabilities) ? b.capabilities[0] : b.capabilities;
      return {
        id: b.id,
        name: formatBranchDisplayName(b.name),
        slug: b.slug,
        address: b.address,
        phone: b.phone,
        is_active: b.is_active,
        capabilities: cap || {
          id: '',
          branch_id: b.id,
          dine_in_enabled: true,
          takeaway_enabled: true,
          delivery_enabled: false,
        },
      };
    });
  }

  static async getBranchById(id: string): Promise<(Branch & { capabilities: BranchCapability }) | null> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase
      .from('branches')
      .select('*, capabilities:branch_capabilities(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch branch by ID (${id}): ${error.message}`);
    }

    if (!data) return null;

    const cap = Array.isArray(data.capabilities) ? data.capabilities[0] : data.capabilities;
    return {
      id: data.id,
      name: formatBranchDisplayName(data.name),
      slug: data.slug,
      address: data.address,
      phone: data.phone,
      is_active: data.is_active,
      capabilities: cap || {
        id: '',
        branch_id: data.id,
        dine_in_enabled: true,
        takeaway_enabled: true,
        delivery_enabled: false,
      },
    };
  }

  static async getBranchBySlug(slug: string): Promise<(Branch & { capabilities: BranchCapability }) | null> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase
      .from('branches')
      .select('*, capabilities:branch_capabilities(*)')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch branch by slug (${slug}): ${error.message}`);
    }

    if (!data) return null;

    const cap = Array.isArray(data.capabilities) ? data.capabilities[0] : data.capabilities;
    return {
      id: data.id,
      name: formatBranchDisplayName(data.name),
      slug: data.slug,
      address: data.address,
      phone: data.phone,
      is_active: data.is_active,
      capabilities: cap || {
        id: '',
        branch_id: data.id,
        dine_in_enabled: true,
        takeaway_enabled: true,
        delivery_enabled: false,
      },
    };
  }

  static async updateBranchCapabilities(
    branchId: string,
    capabilities: Partial<BranchCapability>
  ): Promise<BranchCapability> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    // 1. Try atomic RPC update first
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('update_branch_capability', {
        p_branch_id: branchId,
        p_dine_in: capabilities.dine_in_enabled !== undefined ? capabilities.dine_in_enabled : null,
        p_takeaway: capabilities.takeaway_enabled !== undefined ? capabilities.takeaway_enabled : null,
        p_delivery: capabilities.delivery_enabled !== undefined ? capabilities.delivery_enabled : null,
      });

      if (!rpcErr && rpcData) {
        return rpcData as BranchCapability;
      }
    } catch {}

    // 2. Direct table upsert fallback
    const { data, error } = await supabase
      .from('branch_capabilities')
      .upsert(
        {
          branch_id: branchId,
          ...capabilities,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'branch_id' }
      )
      .select('*')
      .maybeSingle();

    if (error && !data) {
      console.warn(`Direct upsert for branch ${branchId}:`, error.message);
    }

    return (data || capabilities) as BranchCapability;
  }

  static async isDeliveryAllowed(branchId: string): Promise<boolean> {
    if (!supabase) {
      return true;
    }

    try {
      const { data, error } = await supabase
        .from('branch_capabilities')
        .select('delivery_enabled')
        .eq('branch_id', branchId)
        .maybeSingle();

      if (!error && data !== null && data.delivery_enabled !== undefined) {
        return Boolean(data.delivery_enabled);
      }
    } catch {}

    return true;
  }
}

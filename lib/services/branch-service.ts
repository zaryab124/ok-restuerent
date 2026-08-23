import { Branch, BranchCapability } from '../types';
import { supabase } from '../supabase/client';

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
        name: b.name,
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
      name: data.name,
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
      name: data.name,
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
      .single();

    if (error) {
      throw new Error(`Failed to update branch capabilities for branch ${branchId}: ${error.message}`);
    }

    return data;
  }

  static async isDeliveryAllowed(branchId: string): Promise<boolean> {
    if (branchId === 'b2000000-0000-0000-0000-000000000002' || branchId === 'b3000000-0000-0000-0000-000000000003') {
      return false;
    }
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase
      .from('branch_capabilities')
      .select('delivery_enabled')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check delivery capability for branch ${branchId}: ${error.message}`);
    }

    return data?.delivery_enabled ?? (branchId === 'b1000000-0000-0000-0000-000000000001');
  }
}

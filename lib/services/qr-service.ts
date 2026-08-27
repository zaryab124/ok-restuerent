import { RestaurantTable } from '../types';
import { supabase } from '../supabase/client';

export class QRService {
  static generateSecureToken(branchSlug: string, tableNumber: string): string {
    const randomHex = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).substring(2, 18);
    const sanitizedTable = tableNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `qr_${branchSlug.substring(0, 4)}_${sanitizedTable}_${randomHex}`;
  }

  private static getFallbackTables(branchId: string): RestaurantTable[] {
    const slug = (branchId || 'b1').substring(0, 4);
    return [
      { id: `t-${slug}-1`, branch_id: branchId, table_number: 'Table 1', qr_code_token: `qr_${slug}_t1_demo`, is_active: true },
      { id: `t-${slug}-2`, branch_id: branchId, table_number: 'Table 2', qr_code_token: `qr_${slug}_t2_demo`, is_active: true },
      { id: `t-${slug}-3`, branch_id: branchId, table_number: 'Table 3', qr_code_token: `qr_${slug}_t3_demo`, is_active: true },
      { id: `t-${slug}-4`, branch_id: branchId, table_number: 'Table 4', qr_code_token: `qr_${slug}_t4_demo`, is_active: true },
      { id: `t-${slug}-5`, branch_id: branchId, table_number: 'Family Hall 1', qr_code_token: `qr_${slug}_fam1_demo`, is_active: true },
      { id: `t-${slug}-6`, branch_id: branchId, table_number: 'Family Hall 2', qr_code_token: `qr_${slug}_fam2_demo`, is_active: true },
    ];
  }

  static async getTablesByBranch(branchId: string): Promise<RestaurantTable[]> {
    if (!supabase || !branchId) {
      return this.getFallbackTables(branchId);
    }

    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true);

      if (!error && data && data.length > 0) {
        return data.map((t: any) => ({
          id: t.id,
          branch_id: t.branch_id,
          table_number: t.table_number,
          qr_code_token: t.qr_code_token,
          is_active: Boolean(t.is_active),
        }));
      }
    } catch {}

    return this.getFallbackTables(branchId);
  }

  static async getTableByToken(
    token: string
  ): Promise<{ table: RestaurantTable; branchName: string; branchSlug: string } | null> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.rpc('validate_qr_token', {
      p_token: token,
    });

    if (error || !data || data.length === 0) return null;

    const row = data[0];

    const table: RestaurantTable = {
      id: row.table_id,
      branch_id: row.branch_id,
      table_number: row.table_number,
      qr_code_token: token,
      is_active: true,
    };

    return {
      table,
      branchName: row.branch_name,
      branchSlug: row.branch_slug,
    };
  }

  static async createTable(branchId: string, tableNumber: string): Promise<RestaurantTable> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('slug')
      .eq('id', branchId)
      .maybeSingle();

    if (branchError || !branch) {
      throw new Error(`Branch not found for ID (${branchId}): ${branchError?.message || ''}`);
    }

    const token = this.generateSecureToken(branch.slug, tableNumber);

    const { data: newTable, error: createError } = await supabase
      .from('tables')
      .insert({
        branch_id: branchId,
        table_number: tableNumber,
        qr_code_token: token,
        is_active: true,
      })
      .select('*')
      .single();

    if (createError) {
      throw new Error(`Failed to create restaurant table: ${createError.message}`);
    }

    return {
      id: newTable.id,
      branch_id: newTable.branch_id,
      table_number: newTable.table_number,
      qr_code_token: newTable.qr_code_token,
      is_active: Boolean(newTable.is_active),
    };
  }

  static async regenerateToken(tableId: string): Promise<string> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('*, branch:branches(slug)')
      .eq('id', tableId)
      .maybeSingle();

    if (tableError || !table) {
      throw new Error(`Table not found for ID (${tableId}): ${tableError?.message || ''}`);
    }

    const branch = Array.isArray(table.branch) ? table.branch[0] : table.branch;
    const branchSlug = branch ? branch.slug : 'ok';

    const newToken = this.generateSecureToken(branchSlug, table.table_number);

    const { error: updateError } = await supabase
      .from('tables')
      .update({ qr_code_token: newToken })
      .eq('id', tableId);

    if (updateError) {
      throw new Error(`Failed to regenerate table QR token: ${updateError.message}`);
    }

    return newToken;
  }
}

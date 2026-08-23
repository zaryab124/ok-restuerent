import { RestaurantTable } from '../types';
import { supabase } from '../supabase/client';

export class QRService {
  static generateSecureToken(branchSlug: string, tableNumber: string): string {
    const randomHex = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const sanitizedTable = tableNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `qr_${branchSlug.substring(0, 4)}_${sanitizedTable}_${randomHex}`;
  }

  static async getTablesByBranch(branchId: string): Promise<RestaurantTable[]> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to fetch tables for branch (${branchId}): ${error.message}`);
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      branch_id: t.branch_id,
      table_number: t.table_number,
      qr_code_token: t.qr_code_token,
      is_active: Boolean(t.is_active),
    }));
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

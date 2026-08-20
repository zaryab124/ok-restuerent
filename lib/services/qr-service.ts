import { RestaurantTable } from '../types';
import { INITIAL_TABLES, INITIAL_BRANCHES } from '../supabase/mock-db';

export class QRService {
  private static tables: RestaurantTable[] = [...INITIAL_TABLES];

  static generateSecureToken(branchSlug: string, tableNumber: string): string {
    const randomHex = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const sanitizedTable = tableNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `qr_${branchSlug.substring(0, 4)}_${sanitizedTable}_${randomHex}`;
  }

  static async getTablesByBranch(branchId: string): Promise<RestaurantTable[]> {
    return this.tables.filter((t) => t.branch_id === branchId && t.is_active);
  }

  static async getTableByToken(
    token: string
  ): Promise<{ table: RestaurantTable; branchName: string; branchSlug: string } | null> {
    const table = this.tables.find((t) => t.qr_code_token === token && t.is_active);
    if (!table) return null;
    const branch = INITIAL_BRANCHES.find((b) => b.id === table.branch_id);
    if (!branch) return null;
    return {
      table,
      branchName: branch.name,
      branchSlug: branch.slug,
    };
  }

  static async createTable(branchId: string, tableNumber: string): Promise<RestaurantTable> {
    const branch = INITIAL_BRANCHES.find((b) => b.id === branchId);
    if (!branch) throw new Error('Branch not found');

    const token = this.generateSecureToken(branch.slug, tableNumber);
    const newTable: RestaurantTable = {
      id: `t-${Date.now()}`,
      branch_id: branchId,
      table_number: tableNumber,
      qr_code_token: token,
      is_active: true,
    };
    this.tables.push(newTable);
    return newTable;
  }

  static async regenerateToken(tableId: string): Promise<string> {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table) throw new Error('Table not found');

    const branch = INITIAL_BRANCHES.find((b) => b.id === table.branch_id);
    const newToken = this.generateSecureToken(branch ? branch.slug : 'ok', table.table_number);
    table.qr_code_token = newToken;
    return newToken;
  }
}

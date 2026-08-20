import { Branch, BranchCapability } from '../types';
import { INITIAL_BRANCHES } from '../supabase/mock-db';

export class BranchService {
  private static branches: (Branch & { capabilities: BranchCapability })[] = [...INITIAL_BRANCHES];

  static async getBranches(): Promise<(Branch & { capabilities: BranchCapability })[]> {
    return this.branches;
  }

  static async getBranchById(id: string): Promise<(Branch & { capabilities: BranchCapability }) | null> {
    const b = this.branches.find((b) => b.id === id);
    return b || null;
  }

  static async getBranchBySlug(slug: string): Promise<(Branch & { capabilities: BranchCapability }) | null> {
    const b = this.branches.find((b) => b.slug === slug);
    return b || null;
  }

  static async updateBranchCapabilities(
    branchId: string,
    capabilities: Partial<BranchCapability>
  ): Promise<BranchCapability> {
    const branch = this.branches.find((b) => b.id === branchId);
    if (!branch) throw new Error('Branch not found');
    branch.capabilities = {
      ...branch.capabilities,
      ...capabilities,
    };
    return branch.capabilities;
  }

  static isDeliveryAllowed(branchId: string): boolean {
    const branch = this.branches.find((b) => b.id === branchId);
    if (!branch || !branch.capabilities) return false;
    return branch.capabilities.delivery_enabled;
  }
}

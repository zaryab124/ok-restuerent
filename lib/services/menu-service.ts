import { MenuCategory, MenuItem, MenuItemVariant, BranchMenuItem } from '../types';
import { supabase } from '../supabase/client';

export interface MenuQueryFilter {
  branchId?: string;
  categoryId?: string;
  onlyAvailable?: boolean;
}

export class MenuService {
  static async getCategories(): Promise<MenuCategory[]> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch menu categories: ${error.message}`);
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon || undefined,
      sort_order: c.sort_order ?? 0,
      is_active: Boolean(c.is_active),
    }));
  }

  static async getMenuItems(
    filterOrCategoryId?: MenuQueryFilter | string
  ): Promise<MenuItem[]> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const filter: MenuQueryFilter =
      typeof filterOrCategoryId === 'string'
        ? { categoryId: filterOrCategoryId }
        : filterOrCategoryId || {};

    // 1. If branchId is provided, use the branch-specific menu RPC
    if (filter.branchId && filter.branchId !== 'all') {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_branch_menu_items', {
          p_branch_id: filter.branchId,
          p_category_id: filter.categoryId || null,
        });

        if (!rpcError && Array.isArray(rpcData)) {
          return rpcData.map((i: any) => {
            const rawVariants = Array.isArray(i.variants) ? i.variants : [];
            const sortedVariants: MenuItemVariant[] = rawVariants
              .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((v: any) => ({
                id: v.id,
                menu_item_id: v.menu_item_id || i.id,
                name: v.name,
                price: Number(v.price),
                is_available: v.is_available !== undefined ? Boolean(v.is_available) : true,
                sort_order: v.sort_order ?? 0,
              }));

            return {
              id: i.id,
              category_id: i.category_id,
              item_code: i.item_code ?? undefined,
              name: i.name,
              description: i.description || undefined,
              base_price: Number(i.base_price),
              price: Number(i.price ?? i.base_price),
              has_variants: Boolean(i.has_variants),
              image_url: i.image_url || undefined,
              is_available: Boolean(i.is_available),
              is_visible: i.is_visible !== undefined ? Boolean(i.is_visible) : true,
              preparation_time: Number(i.preparation_time || 15),
              sort_order: i.sort_order ?? 0,
              branch_id: filter.branchId,
              variants: sortedVariants.length > 0 ? sortedVariants : undefined,
            };
          });
        }
      } catch (err) {
        console.warn('Fallback to direct menu table query:', err);
      }
    }

    // 2. Fallback to global product catalog query
    let query = supabase
      .from('menu_items')
      .select('*, variants:menu_item_variants(*)')
      .order('sort_order', { ascending: true });

    if (filter.categoryId) {
      query = query.eq('category_id', filter.categoryId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch menu items: ${error.message}`);
    }

    return (data || []).map((i: any) => {
      const rawVariants = Array.isArray(i.variants) ? i.variants : [];
      const sortedVariants: MenuItemVariant[] = rawVariants
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((v: any) => ({
          id: v.id,
          menu_item_id: v.menu_item_id,
          name: v.name,
          price: Number(v.price),
          is_available: true,
          sort_order: v.sort_order ?? 0,
        }));

      return {
        id: i.id,
        category_id: i.category_id,
        item_code: i.item_code ?? undefined,
        name: i.name,
        description: i.description || undefined,
        base_price: Number(i.base_price),
        price: Number(i.base_price),
        has_variants: Boolean(i.has_variants),
        image_url: i.image_url || undefined,
        is_available: Boolean(i.is_available),
        is_visible: true,
        preparation_time: 15,
        sort_order: i.sort_order ?? 0,
        variants: sortedVariants.length > 0 ? sortedVariants : undefined,
      };
    });
  }

  static async getBranchMenuItems(branchId: string, categoryId?: string): Promise<MenuItem[]> {
    return this.getMenuItems({ branchId, categoryId });
  }

  static async updateBranchMenuItem(
    branchId: string,
    menuItemId: string,
    updates: {
      price?: number;
      is_available?: boolean;
      is_visible?: boolean;
      preparation_time?: number;
      sort_order?: number;
    }
  ): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.rpc('update_branch_menu_item', {
      p_branch_id: branchId,
      p_menu_item_id: menuItemId,
      p_price: updates.price !== undefined ? updates.price : null,
      p_is_available: updates.is_available !== undefined ? updates.is_available : null,
      p_is_visible: updates.is_visible !== undefined ? updates.is_visible : null,
      p_preparation_time: updates.preparation_time !== undefined ? updates.preparation_time : null,
      p_sort_order: updates.sort_order !== undefined ? updates.sort_order : null,
    });

    if (error) {
      throw new Error(`Failed to update branch menu item: ${error.message}`);
    }

    return Boolean(data);
  }

  static async toggleBranchItemAvailability(
    branchId: string,
    menuItemId: string
  ): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.rpc('toggle_branch_item_availability', {
      p_branch_id: branchId,
      p_menu_item_id: menuItemId,
    });

    if (error) {
      throw new Error(`Failed to toggle branch item availability: ${error.message}`);
    }

    return Boolean(data);
  }

  static async toggleItemAvailability(itemId: string, branchId?: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    if (branchId && branchId !== 'all') {
      return this.toggleBranchItemAvailability(branchId, itemId);
    }

    const { data: item, error: fetchError } = await supabase
      .from('menu_items')
      .select('is_available')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError || !item) {
      throw new Error(`Failed to fetch item for availability toggle: ${fetchError?.message || 'Item not found'}`);
    }

    const newStatus = !item.is_available;

    const { data: updated, error: updateError } = await supabase
      .from('menu_items')
      .update({ is_available: newStatus })
      .eq('id', itemId)
      .select('is_available')
      .single();

    if (updateError) {
      throw new Error(`Failed to update item availability: ${updateError.message}`);
    }

    return Boolean(updated.is_available);
  }

  static async addMenuItem(newItem: Omit<MenuItem, 'id'>, targetBranchId?: string): Promise<MenuItem> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { variants, ...itemPayload } = newItem;

    const { data: insertedItem, error: itemError } = await supabase
      .from('menu_items')
      .insert({
        category_id: itemPayload.category_id,
        item_code: itemPayload.item_code,
        name: itemPayload.name,
        description: itemPayload.description,
        base_price: itemPayload.base_price,
        has_variants: itemPayload.has_variants,
        image_url: itemPayload.image_url,
        is_available: itemPayload.is_available ?? true,
        sort_order: itemPayload.sort_order ?? 0,
      })
      .select('*')
      .single();

    if (itemError) {
      throw new Error(`Failed to add menu item: ${itemError.message}`);
    }

    let insertedVariants: MenuItemVariant[] = [];

    if (variants && variants.length > 0) {
      const variantsPayload = variants.map((v) => ({
        menu_item_id: insertedItem.id,
        name: v.name,
        price: v.price,
        sort_order: v.sort_order ?? 0,
      }));

      const { data: varData, error: varError } = await supabase
        .from('menu_item_variants')
        .insert(variantsPayload)
        .select('*');

      if (varError) {
        throw new Error(`Failed to add item variants: ${varError.message}`);
      }

      insertedVariants = (varData || []).map((v: any) => ({
        id: v.id,
        menu_item_id: v.menu_item_id,
        name: v.name,
        price: Number(v.price),
        sort_order: v.sort_order ?? 0,
      }));
    }

    // If targetBranchId provided and item price differs from base_price, update branch price
    if (targetBranchId && targetBranchId !== 'all' && itemPayload.price && itemPayload.price !== itemPayload.base_price) {
      await this.updateBranchMenuItem(targetBranchId, insertedItem.id, {
        price: itemPayload.price,
      }).catch(() => {});
    }

    return {
      id: insertedItem.id,
      category_id: insertedItem.category_id,
      item_code: insertedItem.item_code ?? undefined,
      name: insertedItem.name,
      description: insertedItem.description || undefined,
      base_price: Number(insertedItem.base_price),
      price: Number(itemPayload.price ?? insertedItem.base_price),
      has_variants: Boolean(insertedItem.has_variants),
      image_url: insertedItem.image_url || undefined,
      is_available: Boolean(insertedItem.is_available),
      sort_order: insertedItem.sort_order ?? 0,
      variants: insertedVariants.length > 0 ? insertedVariants : undefined,
    };
  }

  static async updateMenuItem(
    itemId: string,
    updates: Partial<Omit<MenuItem, 'id'>>,
    targetBranchId?: string
  ): Promise<MenuItem> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    // If targetBranchId is specified, apply operational overrides to that branch
    if (targetBranchId && targetBranchId !== 'all') {
      const branchUpdates: any = {};
      if (updates.price !== undefined) branchUpdates.price = updates.price;
      if (updates.is_available !== undefined) branchUpdates.is_available = updates.is_available;
      if (updates.is_visible !== undefined) branchUpdates.is_visible = updates.is_visible;
      if (updates.preparation_time !== undefined) branchUpdates.preparation_time = updates.preparation_time;
      if (updates.sort_order !== undefined) branchUpdates.sort_order = updates.sort_order;

      if (Object.keys(branchUpdates).length > 0) {
        await this.updateBranchMenuItem(targetBranchId, itemId, branchUpdates);
      }
    }

    const { variants, price, is_visible, preparation_time, branch_id, ...itemUpdates } = updates as any;

    if (Object.keys(itemUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('menu_items')
        .update(itemUpdates)
        .eq('id', itemId);

      if (updateError) {
        throw new Error(`Failed to update menu item (${itemId}): ${updateError.message}`);
      }
    }

    if (variants !== undefined) {
      await supabase.from('menu_item_variants').delete().eq('menu_item_id', itemId);

      if (variants.length > 0) {
        const variantsPayload = variants.map((v: any) => ({
          menu_item_id: itemId,
          name: v.name,
          price: v.price,
          sort_order: v.sort_order ?? 0,
        }));

        const { error: varInsertError } = await supabase
          .from('menu_item_variants')
          .insert(variantsPayload);

        if (varInsertError) {
          throw new Error(`Failed to update item variants: ${varInsertError.message}`);
        }
      }
    }

    const { data: updatedItem, error: refetchError } = await supabase
      .from('menu_items')
      .select('*, variants:menu_item_variants(*)')
      .eq('id', itemId)
      .maybeSingle();

    if (refetchError || !updatedItem) {
      throw new Error(`Failed to refetch updated menu item (${itemId}): ${refetchError?.message || 'Item not found'}`);
    }

    const rawVariants = Array.isArray(updatedItem.variants) ? updatedItem.variants : [];
    const sortedVariants: MenuItemVariant[] = rawVariants
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((v: any) => ({
        id: v.id,
        menu_item_id: v.menu_item_id,
        name: v.name,
        price: Number(v.price),
        sort_order: v.sort_order ?? 0,
      }));

    return {
      id: updatedItem.id,
      category_id: updatedItem.category_id,
      item_code: updatedItem.item_code ?? undefined,
      name: updatedItem.name,
      description: updatedItem.description || undefined,
      base_price: Number(updatedItem.base_price),
      price: Number(price ?? updatedItem.base_price),
      has_variants: Boolean(updatedItem.has_variants),
      image_url: updatedItem.image_url || undefined,
      is_available: Boolean(updatedItem.is_available),
      sort_order: updatedItem.sort_order ?? 0,
      variants: sortedVariants.length > 0 ? sortedVariants : undefined,
    };
  }

  static async deleteMenuItem(itemId: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { error } = await supabase.from('menu_items').delete().eq('id', itemId);

    if (error) {
      throw new Error(`Failed to delete menu item (${itemId}): ${error.message}`);
    }

    return true;
  }
}


import { MenuCategory, MenuItem, MenuItemVariant } from '../types';
import { supabase } from '../supabase/client';

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

  static async getMenuItems(categoryId?: string): Promise<MenuItem[]> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    let query = supabase
      .from('menu_items')
      .select('*, variants:menu_item_variants(*)')
      .order('sort_order', { ascending: true });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
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
          sort_order: v.sort_order ?? 0,
        }));

      return {
        id: i.id,
        category_id: i.category_id,
        item_code: i.item_code ?? undefined,
        name: i.name,
        description: i.description || undefined,
        base_price: Number(i.base_price),
        has_variants: Boolean(i.has_variants),
        image_url: i.image_url || undefined,
        is_available: Boolean(i.is_available),
        sort_order: i.sort_order ?? 0,
        variants: sortedVariants.length > 0 ? sortedVariants : undefined,
      };
    });
  }

  static async toggleItemAvailability(itemId: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data: item, error: fetchError } = await supabase
      .from('menu_items')
      .select('is_available')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to fetch item for availability toggle: ${fetchError.message}`);
    }

    if (!item) {
      throw new Error('Menu item not found');
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

  static async addMenuItem(newItem: Omit<MenuItem, 'id'>): Promise<MenuItem> {
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

    return {
      id: insertedItem.id,
      category_id: insertedItem.category_id,
      item_code: insertedItem.item_code ?? undefined,
      name: insertedItem.name,
      description: insertedItem.description || undefined,
      base_price: Number(insertedItem.base_price),
      has_variants: Boolean(insertedItem.has_variants),
      image_url: insertedItem.image_url || undefined,
      is_available: Boolean(insertedItem.is_available),
      sort_order: insertedItem.sort_order ?? 0,
      variants: insertedVariants.length > 0 ? insertedVariants : undefined,
    };
  }

  static async updateMenuItem(
    itemId: string,
    updates: Partial<Omit<MenuItem, 'id'>>
  ): Promise<MenuItem> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { variants, ...itemUpdates } = updates;

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
        const variantsPayload = variants.map((v) => ({
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

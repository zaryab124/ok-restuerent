import { MenuCategory, MenuItem, MenuItemVariant } from '../types';
import { INITIAL_CATEGORIES, INITIAL_MENU_ITEMS } from '../supabase/mock-db';

export class MenuService {
  private static categories: MenuCategory[] = [...INITIAL_CATEGORIES];
  private static items: MenuItem[] = [...INITIAL_MENU_ITEMS];

  static async getCategories(): Promise<MenuCategory[]> {
    return this.categories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
  }

  static async getMenuItems(categoryId?: string): Promise<MenuItem[]> {
    let result = this.items;
    if (categoryId) {
      result = result.filter((i) => i.category_id === categoryId);
    }
    return result.sort((a, b) => a.sort_order - b.sort_order);
  }

  static async toggleItemAvailability(itemId: string): Promise<boolean> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) throw new Error('Menu item not found');
    item.is_available = !item.is_available;
    return item.is_available;
  }

  static async addMenuItem(newItem: Omit<MenuItem, 'id'>): Promise<MenuItem> {
    const item: MenuItem = {
      ...newItem,
      id: `m-${Date.now()}`,
    };
    this.items.push(item);
    return item;
  }

  static async updateMenuItem(
    itemId: string,
    updates: Partial<Omit<MenuItem, 'id'>>
  ): Promise<MenuItem> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) throw new Error('Menu item not found');

    Object.assign(item, updates);
    return item;
  }

  static async deleteMenuItem(itemId: string): Promise<boolean> {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx > -1) {
      this.items.splice(idx, 1);
      return true;
    }
    return false;
  }
}

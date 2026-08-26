import { Branch, BranchCapability, MenuCategory, MenuItem, RestaurantTable, Order, Profile } from '../types';

export const INITIAL_BRANCHES: (Branch & { capabilities: BranchCapability })[] = [
  {
    id: 'b1000000-0000-0000-0000-000000000001',
    name: 'Dera Chungi',
    slug: 'dera-chungi',
    address: 'Opposite Shell Pump, Jampur',
    phone: '0334-4683344',
    is_active: true,
    capabilities: {
      id: 'cap-1',
      branch_id: 'b1000000-0000-0000-0000-000000000001',
      dine_in_enabled: true,
      takeaway_enabled: true,
      delivery_enabled: true,
    },
  },
  {
    id: 'b2000000-0000-0000-0000-000000000002',
    name: 'Main Bypass Jampur',
    slug: 'sherifalon-bypass',
    address: 'Main Bypass Jampur Road, Jampur',
    phone: '0336-4683344',
    is_active: true,
    capabilities: {
      id: 'cap-2',
      branch_id: 'b2000000-0000-0000-0000-000000000002',
      dine_in_enabled: true,
      takeaway_enabled: true,
      delivery_enabled: false,
    },
  },
  {
    id: 'b3000000-0000-0000-0000-000000000003',
    name: 'Kot Chuta / Appo Chuta',
    slug: 'kot-chuta',
    address: 'Main Highway, Kot Chuta',
    phone: '0333-2225757',
    is_active: true,
    capabilities: {
      id: 'cap-3',
      branch_id: 'b3000000-0000-0000-0000-000000000003',
      dine_in_enabled: true,
      takeaway_enabled: true,
      delivery_enabled: false,
    },
  },
];

export const INITIAL_CATEGORIES: MenuCategory[] = [
  { id: 'c1', name: 'Special Platters & Offers', slug: 'special-platters', icon: 'Flame', sort_order: 1, is_active: true },
  { id: 'c2', name: 'Fast Food Deals (1-21)', slug: 'fast-food-deals', icon: 'Sparkles', sort_order: 2, is_active: true },
  { id: 'c3', name: 'Fast Food', slug: 'fast-food', icon: 'Utensils', sort_order: 3, is_active: true },
  { id: 'c4', name: 'OK Special Pizza', slug: 'ok-special-pizza', icon: 'Pizza', sort_order: 4, is_active: true },
  { id: 'c5', name: 'OK Regular Pizza', slug: 'ok-regular-pizza', icon: 'Pizza', sort_order: 5, is_active: true },
  { id: 'c6', name: 'Chicken Karahi', slug: 'chicken-karahi', icon: 'CookingPot', sort_order: 6, is_active: true },
  { id: 'c7', name: 'Chicken Handi', slug: 'chicken-handi', icon: 'Soup', sort_order: 7, is_active: true },
  { id: 'c8', name: 'Mutton Karahi', slug: 'mutton-karahi', icon: 'CookingPot', sort_order: 8, is_active: true },
  { id: 'c9', name: 'Mutton Handi', slug: 'mutton-handi', icon: 'Soup', sort_order: 9, is_active: true },
  { id: 'c10', name: 'Bar B.Q', slug: 'bar-bq', icon: 'Flame', sort_order: 10, is_active: true },
  { id: 'c11', name: 'Soup', slug: 'soup', icon: 'Soup', sort_order: 11, is_active: true },
  { id: 'c12', name: 'Chinese Starter', slug: 'chinese-starter', icon: 'Drumstick', sort_order: 12, is_active: true },
  { id: 'c13', name: 'Chowmain', slug: 'chowmain', icon: 'Utensils', sort_order: 13, is_active: true },
  { id: 'c14', name: 'Rice', slug: 'rice', icon: 'Utensils', sort_order: 14, is_active: true },
  { id: 'c15', name: 'Chinese Gravy', slug: 'chinese-gravy', icon: 'CookingPot', sort_order: 15, is_active: true },
  { id: 'c16', name: 'Salad & Raita', slug: 'salad-raita', icon: 'Utensils', sort_order: 16, is_active: true },
  { id: 'c17', name: 'Tandoor', slug: 'tandoor', icon: 'Flame', sort_order: 17, is_active: true },
  { id: 'c18', name: 'Beverages', slug: 'beverages', icon: 'Coffee', sort_order: 18, is_active: true },
  { id: 'c19', name: 'Tea', slug: 'tea', icon: 'Coffee', sort_order: 19, is_active: true },
  { id: 'c20', name: 'Ice Cream', slug: 'ice-cream', icon: 'Coffee', sort_order: 20, is_active: true },
];

// Curated 100% AI photography URLs (Zero local file dependencies)
const AI_IMG = {
  juneDeal: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
  royalPlatter: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
  deal27: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
  zinger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
  burger: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
  fries: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=600&auto=format&fit=crop&q=80',
  loadedFries: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&auto=format&fit=crop&q=80',
  shawarma: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
  pizzaSpecial: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop&q=80',
  karahi: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80',
  whiteKarahi: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80',
  handi: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
  mutton: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
  bbq: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
  kabab: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&auto=format&fit=crop&q=80',
  soup: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&auto=format&fit=crop&q=80',
  wings: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=600&auto=format&fit=crop&q=80',
  fish: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop&q=80',
  chowmain: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
  friedRice: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80',
  chineseGravy: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=600&auto=format&fit=crop&q=80',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
  naan: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&auto=format&fit=crop&q=80',
  drink: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
  milkTea: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
  greenTea: 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=600&auto=format&fit=crop&q=80',
  badamiChai: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&auto=format&fit=crop&q=80',
  iceCream: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&auto=format&fit=crop&q=80',
};

export const INITIAL_MENU_ITEMS: MenuItem[] = [
  // ⭐ SPECIAL PLATTERS & OFFERS
  {
    id: 'm1',
    category_id: 'c1',
    item_code: 9991,
    name: 'June Deal!',
    description: '1 Large Pizza + 1 Medium Pizza + 1 Liter Next Cola Drink',
    base_price: 1495,
    has_variants: false,
    image_url: AI_IMG.juneDeal,
    is_available: true,
    sort_order: 1,
  },
  {
    id: 'm2',
    category_id: 'c1',
    item_code: 9992,
    name: 'Royal Platter',
    description: 'Chicken Karahi + Fried Rice + Tikka Boti + Kabab + 4 Person Roti + Raita & Salad + 1 Liter Bottle (No service charges)',
    base_price: 2495,
    has_variants: false,
    image_url: AI_IMG.royalPlatter,
    is_available: true,
    sort_order: 2,
  },
  {
    id: 'm3',
    category_id: 'c1',
    item_code: 9993,
    name: 'Deal No. 27 — Grand Family Feast',
    description: 'Family-style platter with multiple chicken/BBQ items, rice, naan/roti, salad & 1.5L drink',
    base_price: 3495,
    has_variants: false,
    image_url: AI_IMG.deal27,
    is_available: true,
    sort_order: 3,
  },

  // 🎁 FAST FOOD DEALS (1 to 21)
  { id: 'd1', category_id: 'c2', name: 'Deal 1', description: '1 Zinger Burger + Fries + 300ml Bottle', base_price: 400, has_variants: false, image_url: AI_IMG.zinger, is_available: true, sort_order: 1 },
  { id: 'd2', category_id: 'c2', name: 'Deal 2', description: '1 Spicy Burger + Fries + 300ml Bottle', base_price: 350, has_variants: false, image_url: AI_IMG.burger, is_available: true, sort_order: 2 },
  { id: 'd3', category_id: 'c2', name: 'Deal 3', description: '1 Chicken Burger + Fries + 345ml Bottle', base_price: 350, has_variants: false, image_url: AI_IMG.burger, is_available: true, sort_order: 3 },
  { id: 'd4', category_id: 'c2', name: 'Deal 4', description: '3 Zinger Burgers + Fries + 1L Bottle', base_price: 1099, has_variants: false, image_url: AI_IMG.zinger, is_available: true, sort_order: 4 },
  { id: 'd5', category_id: 'c2', name: 'Deal 5', description: '2 Zinger Burgers + Fries + 1L Bottle', base_price: 799, has_variants: false, image_url: AI_IMG.zinger, is_available: true, sort_order: 5 },
  { id: 'd6', category_id: 'c2', name: 'Deal 6', description: '5 Zinger Burgers + 1.5L Bottle', base_price: 1850, has_variants: false, image_url: AI_IMG.zinger, is_available: true, sort_order: 6 },
  { id: 'd7', category_id: 'c2', name: 'Deal 7', description: '3 Paratha Rolls + 1L Bottle', base_price: 850, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 7 },
  { id: 'd8', category_id: 'c2', name: 'Deal 8', description: '3 Chicken Shawarmas + 1L Bottle', base_price: 599, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 8 },
  { id: 'd9', category_id: 'c2', name: 'Deal 9', description: '5 Chicken Drums + 1L Bottle', base_price: 999, has_variants: false, image_url: AI_IMG.wings, is_available: true, sort_order: 9 },
  { id: 'd10', category_id: 'c2', name: 'Deal 10', description: '10 Nuggets + 345ml Bottle', base_price: 650, has_variants: false, image_url: AI_IMG.wings, is_available: true, sort_order: 10 },
  { id: 'd11', category_id: 'c2', name: 'Deal 11', description: '6 Paratha Rolls + 1L Bottle', base_price: 1600, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 11 },
  { id: 'd12', category_id: 'c2', name: 'Deal 12', description: '1 Large Pizza + 1 Medium Pizza + 1 Small Pizza + 1.5L Bottle', base_price: 2599, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 12 },
  { id: 'd13', category_id: 'c2', name: 'Deal 13', description: '2 Medium Pizzas + 1.5L Bottle', base_price: 1899, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 13 },
  { id: 'd14', category_id: 'c2', name: 'Deal 14', description: '2 Large Pizzas + 1.5L Bottle', base_price: 2499, has_variants: false, image_url: AI_IMG.pizzaSpecial, is_available: true, sort_order: 14 },
  { id: 'd15', category_id: 'c2', name: 'Deal 15', description: '2 Small Pizzas + 1L Bottle', base_price: 999, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 15 },
  { id: 'd16', category_id: 'c2', name: 'Deal 16', description: '1 Large Pizza + 1 Medium Pizza + 1.5L Bottle', base_price: 2099, has_variants: false, image_url: AI_IMG.pizzaSpecial, is_available: true, sort_order: 16 },
  { id: 'd17', category_id: 'c2', name: 'Deal 17', description: '1 Large Pizza + 1 Small Pizza + 1.5L Bottle', base_price: 1699, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 17 },
  { id: 'd18', category_id: 'c2', name: 'Deal 18', description: '1 Small Pizza + 1 Zinger Burger + 5 pcs Wings + 1L Bottle', base_price: 1150, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 18 },
  { id: 'd19', category_id: 'c2', name: 'Deal 19', description: '1 Medium Pizza + 1 Zinger Burger + Nuggets + Shawarma + 1.5L Bottle', base_price: 1699, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 19 },
  { id: 'd20', category_id: 'c2', name: 'Deal 20', description: '1 Large Pizza + 5 pcs Wings + Paratha Roll + 1.5L Bottle', base_price: 1700, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 20 },
  { id: 'd21', category_id: 'c2', name: 'Deal 21', description: '1 Large Pizza + 3 Zinger Burgers + 1 Plate Wings + 1.5L Bottle', base_price: 2799, has_variants: false, image_url: AI_IMG.pizza, is_available: true, sort_order: 21 },

  // 🍔 FAST FOOD
  { id: 'ff1', category_id: 'c3', item_code: 104, name: 'Broast Piece (Leg)', base_price: 480, has_variants: false, image_url: AI_IMG.wings, is_available: true, sort_order: 1 },
  { id: 'ff2', category_id: 'c3', item_code: 105, name: 'Broast Piece (Chest)', base_price: 500, has_variants: false, image_url: AI_IMG.wings, is_available: true, sort_order: 2 },
  { id: 'ff3', category_id: 'c3', item_code: 106, name: 'Chicken Drum', base_price: 150, has_variants: false, image_url: AI_IMG.wings, is_available: true, sort_order: 3 },
  { id: 'ff4', category_id: 'c3', item_code: 107, name: 'Nuggets (per piece)', base_price: 60, has_variants: false, image_url: AI_IMG.wings, is_available: true, sort_order: 4 },
  { id: 'ff5', category_id: 'c3', item_code: 108, name: 'Hot Shot (12 pcs)', base_price: 600, has_variants: false, image_url: AI_IMG.wings, is_available: true, sort_order: 5 },
  { id: 'ff6', category_id: 'c3', item_code: 109, name: 'Plain Fries', base_price: 150, has_variants: false, image_url: AI_IMG.fries, is_available: true, sort_order: 6 },
  { id: 'ff7', category_id: 'c3', item_code: 110, name: 'Loaded Fries', base_price: 350, has_variants: false, image_url: AI_IMG.loadedFries, is_available: true, sort_order: 7 },
  { id: 'ff8', category_id: 'c3', item_code: 111, name: 'Zinger Burger', base_price: 350, has_variants: false, image_url: AI_IMG.zinger, is_available: true, sort_order: 8 },
  { id: 'ff9', category_id: 'c3', item_code: 112, name: 'Chicken Burger', base_price: 300, has_variants: false, image_url: AI_IMG.burger, is_available: true, sort_order: 9 },
  { id: 'ff10', category_id: 'c3', item_code: 113, name: 'Spicy Burger', base_price: 300, has_variants: false, image_url: AI_IMG.burger, is_available: true, sort_order: 10 },
  { id: 'ff11', category_id: 'c3', item_code: 114, name: 'Zee Tower Burger', base_price: 550, has_variants: false, image_url: AI_IMG.zinger, is_available: true, sort_order: 11 },
  { id: 'ff12', category_id: 'c3', item_code: 115, name: 'Zinger Cheese Burger', base_price: 400, has_variants: false, image_url: AI_IMG.zinger, is_available: true, sort_order: 12 },
  { id: 'ff13', category_id: 'c3', item_code: 116, name: 'Pizza Burger', base_price: 500, has_variants: false, image_url: AI_IMG.burger, is_available: true, sort_order: 13 },
  { id: 'ff14', category_id: 'c3', item_code: 117, name: 'Chicken Shawarma', base_price: 180, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 14 },
  { id: 'ff15', category_id: 'c3', item_code: 118, name: 'Chicken Cheese Shawarma', base_price: 250, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 15 },
  { id: 'ff16', category_id: 'c3', item_code: 119, name: 'Paratha Roll', base_price: 250, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 16 },
  { id: 'ff17', category_id: 'c3', item_code: 120, name: 'Cheese Paratha Roll', base_price: 300, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 17 },
  { id: 'ff18', category_id: 'c3', item_code: 121, name: 'Arabic Shawarma', base_price: 200, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 18 },
  { id: 'ff19', category_id: 'c3', item_code: 122, name: 'Arabic Paratha', base_price: 300, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 19 },
  { id: 'ff20', category_id: 'c3', item_code: 123, name: 'Twister Roll', base_price: 300, has_variants: false, image_url: AI_IMG.shawarma, is_available: true, sort_order: 20 },

  // 🍕 OK SPECIAL PIZZA (Large: 1400 / Medium: 1000)
  {
    id: 'sp1', category_id: 'c4', item_code: 124, name: 'OK SP Royal Pizza', base_price: 1400, has_variants: true, image_url: AI_IMG.pizzaSpecial, is_available: true, sort_order: 1,
    variants: [{ id: 'sp1-l', menu_item_id: 'sp1', name: 'Large', price: 1400, sort_order: 1 }, { id: 'sp1-m', menu_item_id: 'sp1', name: 'Medium', price: 1000, sort_order: 2 }]
  },
  {
    id: 'sp2', category_id: 'c4', item_code: 125, name: 'Nawabi Pizza', base_price: 1400, has_variants: true, image_url: AI_IMG.pizzaSpecial, is_available: true, sort_order: 2,
    variants: [{ id: 'sp2-l', menu_item_id: 'sp2', name: 'Large', price: 1400, sort_order: 1 }, { id: 'sp2-m', menu_item_id: 'sp2', name: 'Medium', price: 1000, sort_order: 2 }]
  },

  // 🍗 CHICKEN KARAHI (Full / Half)
  {
    id: 'ck1', category_id: 'c6', item_code: 1, name: 'OK Special Afghani Karahi', base_price: 1900, has_variants: true, image_url: AI_IMG.karahi, is_available: true, sort_order: 1,
    variants: [{ id: 'ck1-f', menu_item_id: 'ck1', name: 'Full', price: 1900, sort_order: 1 }, { id: 'ck1-h', menu_item_id: 'ck1', name: 'Half', price: 999, sort_order: 2 }]
  },
  {
    id: 'ck2', category_id: 'c6', item_code: 2, name: 'Chicken Karahi', base_price: 1800, has_variants: true, image_url: AI_IMG.karahi, is_available: true, sort_order: 2,
    variants: [{ id: 'ck2-f', menu_item_id: 'ck2', name: 'Full', price: 1800, sort_order: 1 }, { id: 'ck2-h', menu_item_id: 'ck2', name: 'Half', price: 900, sort_order: 2 }]
  },

  // ☕ TEA
  { id: 'tea1', category_id: 'c19', item_code: 98, name: 'Simple Tea (Doodh Patti Milk Tea)', base_price: 100, has_variants: false, image_url: AI_IMG.milkTea, is_available: true, sort_order: 1 },
  { id: 'tea2', category_id: 'c19', item_code: 99, name: 'Green Tea (Kahwa)', base_price: 80, has_variants: false, image_url: AI_IMG.greenTea, is_available: true, sort_order: 2 },
  { id: 'tea3', category_id: 'c19', item_code: 100, name: 'Badami Chai (Almond Kashmiri Chai)', base_price: 120, has_variants: false, image_url: AI_IMG.badamiChai, is_available: true, sort_order: 3 },
];

export const INITIAL_TABLES: RestaurantTable[] = [
  { id: 't1', branch_id: 'b1000000-0000-0000-0000-000000000001', table_number: 'T-01', qr_code_token: 'qr_dera_t01_sec789', is_active: true },
  { id: 't2', branch_id: 'b1000000-0000-0000-0000-000000000001', table_number: 'T-02', qr_code_token: 'qr_dera_t02_sec790', is_active: true },
  { id: 't12', branch_id: 'b1000000-0000-0000-0000-000000000001', table_number: 'T-12', qr_code_token: 'qr_dera_t12_sec812', is_active: true },
];

export const DEMO_USERS: Profile[] = [
  // 3 OWNER ACCOUNTS
  { id: 'u-owner1', email: 'owner1@okrestaurant.com', full_name: 'Muhammad Ibrahim (Owner 1)', phone: '0333-4683344', role: 'OWNER', password: 'okaykarubas12390' },
  { id: 'u-owner2', email: 'owner2@okrestaurant.com', full_name: 'Sheikh Farooq (Owner 2)', phone: '0333-5551122', role: 'OWNER', password: 'okaykarubas12390' },
  { id: 'u-owner3', email: 'owner3@okrestaurant.com', full_name: 'Malik Usman (Owner 3)', phone: '0333-9994455', role: 'OWNER', password: 'okaykarubas12390' },

  // BRANCH ADMINS FOR EVERY BRANCH
  { id: 'u-admin-dera', email: 'admin.dera@okrestaurant.com', full_name: 'Tariq Admin (Dera Chungi Branch)', phone: '0334-4683344', role: 'BRANCH_ADMIN', password: 'okaykarubas12390' },
  { id: 'u-admin-sherifalon', email: 'admin.sherifalon@okrestaurant.com', full_name: 'Sajjad Admin (Main Bypass Jampur Branch)', phone: '0336-4683344', role: 'BRANCH_ADMIN', password: 'okaykarubas12390' },
  { id: 'u-admin-kotchuta', email: 'admin.kotchuta@okrestaurant.com', full_name: 'Rashid Admin (Kot Chuta Branch)', phone: '0333-2225757', role: 'BRANCH_ADMIN', password: 'okaykarubas12390' },

  // KITCHEN STAFF FOR EVERY BRANCH
  { id: 'u-kitchen-dera', email: 'kitchen.dera@okrestaurant.com', full_name: 'Chef Ahmad (Dera Chungi Kitchen)', phone: '0300-1112233', role: 'KITCHEN', password: 'okaykarubas12390' },
  { id: 'u-kitchen-sherifalon', email: 'kitchen.sherifalon@okrestaurant.com', full_name: 'Chef Bilal (Main Bypass Jampur Kitchen)', phone: '0300-4445566', role: 'KITCHEN', password: 'okaykarubas12390' },
  { id: 'u-kitchen-kotchuta', email: 'kitchen.kotchuta@okrestaurant.com', full_name: 'Chef Tariq (Kot Chuta Kitchen)', phone: '0300-7778899', role: 'KITCHEN', password: 'okaykarubas12390' },

  // RIDERS FOR EVERY BRANCH
  { id: 'u-rider1-dera', email: 'rider1.dera@okrestaurant.com', full_name: 'Ali Rider (Dera Delivery)', phone: '0301-9998877', role: 'RIDER', password: 'okaykarubas12390' },
  { id: 'u-rider2-dera', email: 'rider2.dera@okrestaurant.com', full_name: 'Hamza Rider (Dera Delivery)', phone: '0301-3332211', role: 'RIDER', password: 'okaykarubas12390' },
  { id: 'u-rider-sherifalon', email: 'rider.sherifalon@okrestaurant.com', full_name: 'Zubair Rider (Main Bypass Jampur Delivery)', phone: '0301-6665544', role: 'RIDER', password: 'okaykarubas12390' },
  { id: 'u-rider-kotchuta', email: 'rider.kotchuta@okrestaurant.com', full_name: 'Imran Rider (Kot Chuta Delivery)', phone: '0301-8887766', role: 'RIDER', password: 'okaykarubas12390' },

  // DEMO CUSTOMER
  { id: 'u-customer', email: 'customer.demo@gmail.com', full_name: 'Usman Customer', phone: '0321-5554433', role: 'CUSTOMER', password: 'okaykarubas12390' },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-1001',
    order_number: 'OK-1001',
    branch_id: 'b1000000-0000-0000-0000-000000000001',
    customer_name: 'Usman Customer',
    customer_phone: '0321-5554433',
    order_type: 'DINE_IN',
    table_id: 'T-12',
    subtotal: 1495,
    delivery_fee: 0,
    total_amount: 1495,
    payment_method: 'CASH',
    payment_status: 'PENDING',
    status: 'PREPARING',
    created_at: new Date(Date.now() - 20 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 60000).toISOString(),
    items: [
      {
        id: 'oi-1',
        order_id: 'ord-1001',
        menu_item_id: 'm1',
        item_name: 'June Deal!',
        unit_price: 1495,
        quantity: 1,
        subtotal_price: 1495,
      },
    ],
  },
];

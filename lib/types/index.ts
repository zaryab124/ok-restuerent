export type UserRole = 'OWNER' | 'BRANCH_ADMIN' | 'KITCHEN' | 'RIDER' | 'CUSTOMER';

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'PREPARING'
  | 'READY'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'SAFEPAY' | 'JAZZCASH' | 'EASYPAISA' | 'CARD' | 'ONLINE' | 'TEST_PAYMENT';
export type PaymentStatus =
  | 'PENDING'
  | 'INITIATED'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export interface PaymentTransaction {
  id: string;
  order_id?: string;
  buffet_booking_id?: string;
  provider: string;
  provider_transaction_id?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string;
  checkout_url?: string;
  provider_reference?: string;
  failure_reason?: string;
  raw_response?: any;
  created_at: string;
  updated_at: string;
  paid_at?: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  password?: string;
  created_at?: string;
}

export interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  is_active: boolean;
  capabilities?: BranchCapability;
}

export interface BranchCapability {
  id: string;
  branch_id: string;
  dine_in_enabled: boolean;
  takeaway_enabled: boolean;
  delivery_enabled: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
}

export interface MenuItemVariant {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  is_available?: boolean;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  category_id: string;
  item_code?: number;
  name: string;
  description?: string;
  base_price: number;
  price?: number; // active branch-specific price (defaults to base_price)
  has_variants: boolean;
  image_url?: string;
  is_available: boolean; // active branch availability
  is_visible?: boolean;
  preparation_time?: number; // in minutes
  sort_order: number;
  branch_id?: string;
  variants?: MenuItemVariant[];
}

export interface BranchMenuItem {
  id: string;
  branch_id: string;
  menu_item_id: string;
  price: number;
  is_available: boolean;
  is_visible: boolean;
  preparation_time: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  menu_item?: MenuItem;
}

export interface BranchMenuItemVariant {
  id: string;
  branch_id: string;
  variant_id: string;
  price: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface RestaurantTable {
  id: string;
  branch_id: string;
  table_number: string;
  qr_code_token: string;
  is_active: boolean;
}

export interface CartItem {
  menuItem: MenuItem;
  variant?: MenuItemVariant;
  quantity: number;
  specialInstructions?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id?: string;
  variant_id?: string;
  item_name: string;
  variant_name?: string;
  unit_price: number;
  quantity: number;
  subtotal_price: number;
  special_instructions?: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  from_status?: OrderStatus;
  to_status: OrderStatus;
  changed_by_user_id?: string;
  notes?: string;
  created_at: string;
}

export interface DeliveryZone {
  id: string;
  branch_id: string;
  name: string;
  delivery_fee: number;
  minimum_order_amount: number;
  estimated_delivery_minutes: number;
  is_active: boolean;
  sort_order: number;
  radius_km?: number;
  is_delivery_enabled?: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  tracking_token?: string;
  branch_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  order_type: OrderType;
  table_id?: string;
  delivery_zone_id?: string;
  delivery_address?: string;
  delivery_notes?: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  branch?: Branch;
  table?: RestaurantTable;
  delivery_zone?: DeliveryZone;
  items?: OrderItem[];
  history?: OrderStatusHistory[];
  rider_assignment?: {
    rider_id: string;
    rider_name?: string;
    assigned_at: string;
  };
}

export interface BuffetRegistration {
  id: string;
  branch_id: string;
  title: string;
  description: string;
  dishes_list: string[];
  price_per_head: number;
  event_date: string;
  start_time: string;
  end_time: string;
  banner_image_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface BuffetBooking {
  id: string;
  buffet_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  guests_count: number;
  total_amount: number;
  qr_ticket_token: string;
  status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED';
  created_at: string;
  buffet_registration?: BuffetRegistration;
}

export interface BuffetCheckinLog {
  id: string;
  booking_id: string;
  buffet_id: string;
  branch_id: string;
  checked_in_by_user_id?: string;
  guests_count: number;
  notes?: string;
  checked_in_at: string;
}

export interface BuffetCheckInResult {
  success: boolean;
  booking_id?: string;
  customer_name?: string;
  guests_count?: number;
  buffet_title?: string;
  checked_in_at?: string;
  error?: string;
}

export interface SalesReport {
  total_sales: number;
  order_count: number;
  average_order_value: number;
  sales_by_branch: Record<string, number>;
  orders_by_status: Record<OrderStatus, number>;
  popular_items: Array<{ name: string; count: number; revenue: number }>;
}

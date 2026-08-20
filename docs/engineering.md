# Engineering & Technical Architecture — OK Restaurant

## 1. Tech Stack Overview
- **Framework**: Next.js 14+ (App Router, React 18, TypeScript 5)
- **Styling & UI**: Tailwind CSS v3, Lucide Icons, Shadcn UI patterns, Framer Motion for smooth transitions
- **Backend & Data Access**: Next.js Server Actions & API Routes, Supabase JS Client (`@supabase/supabase-js`, `@supabase/ssr`)
- **Database & Auth**: PostgreSQL (Supabase), Row Level Security (RLS) policies, JWT role claims
- **Realtime Sync**: Supabase Realtime Channels (`postgres_changes` subscriptions on `orders` and `order_status_history`)
- **Testing**: Jest / Vitest unit tests, Playwright / Integration test suits

## 2. Database Architecture & Schema Design
### Core Tables:
- `profiles`: `id (UUID references auth.users)`, `full_name`, `phone`, `role ('OWNER','BRANCH_ADMIN','KITCHEN','RIDER','CUSTOMER')`, `created_at`
- `branches`: `id (UUID)`, `name`, `slug`, `address`, `phone`, `is_active`, `created_at`
- `branch_users`: `id`, `user_id`, `branch_id`, `role`, `created_at`
- `branch_capabilities`: `id`, `branch_id`, `dine_in_enabled`, `takeaway_enabled`, `delivery_enabled`, `updated_at`
- `menu_categories`: `id`, `name`, `slug`, `sort_order`, `is_active`
- `menu_items`: `id`, `category_id`, `name`, `description`, `price`, `has_variants`, `image_url`, `is_available`, `sort_order`
- `menu_item_variants`: `id`, `menu_item_id`, `name` (e.g. Full/Half, Large/Medium/Small), `price`
- `tables`: `id`, `branch_id`, `table_number`, `qr_code_token` (secure random string), `is_active`
- `orders`: `id`, `order_number` (human readable e.g. OK-1001), `branch_id`, `customer_id`, `customer_name`, `customer_phone`, `order_type ('DINE_IN','TAKEAWAY','DELIVERY')`, `table_id`, `delivery_address`, `notes`, `subtotal`, `delivery_fee`, `total_amount`, `payment_method ('CASH','TEST_PAYMENT')`, `payment_status ('PENDING','PAID')`, `status ('PENDING','CONFIRMED','REJECTED','PREPARING','READY','ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','COMPLETED','CANCELLED')`, `created_at`, `updated_at`
- `order_items`: `id`, `order_id`, `menu_item_id`, `variant_id`, `item_name`, `variant_name`, `unit_price`, `quantity`, `subtotal_price`, `special_instructions`
- `order_status_history`: `id`, `order_id`, `from_status`, `to_status`, `changed_by_user_id`, `notes`, `created_at`
- `rider_assignments`: `id`, `order_id`, `rider_id`, `assigned_at`, `status ('ACCEPTED','REJECTED','COMPLETED')`
- `audit_logs`: `id`, `user_id`, `action`, `entity_type`, `entity_id`, `details`, `created_at`

## 3. Concurrency & Security Engineering
- **Rider Assignment Locking**: Rider order acceptance uses database transactions / conditional atomic updates (`UPDATE order_assignments SET ... WHERE status = 'PENDING' AND rider_id IS NULL`) to eliminate race conditions between multiple riders.
- **Server-Side Validation**: All actions (order creation, branch capability checks, role authorization) are validated on the server side prior to DB execution.
- **Branch Data Isolation**: RLS policies enforce `branch_id = auth.jwt() -> branch_id` for Branch Admins and Kitchen Staff.

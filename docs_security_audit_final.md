# Comprehensive Security Audit & Database Consistency Report

**Project**: OK RESTUERENT  
**Supabase Target**: `https://dzdclfqvwlpzehssryfi.supabase.co`  
**Repository**: `zaryab124/ok-restuerent`  
**Audit Date**: 2026-08-23  

---

### Executive Summary

A thorough, multi-layered security audit and database consistency review was conducted across all database migrations (`001_initial_schema.sql`, `002_security_hardening.sql`), seed data (`seed.sql`), client services (`auth-service.ts`, `order-service.ts`, `branch-service.ts`, `menu-service.ts`, `qr-service.ts`, `payment-service.ts`, `merchant-config-service.ts`, `buffet-service.ts`), and frontend application pages.

**Production Deployment Status**: **ZERO PRODUCTION SQL EXECUTED**. All migration files and service layer refactoring are held locally in the repository awaiting manual approval.

---

### 1. Database Schema Verification

Every column referenced by `002_security_hardening.sql` was verified line-by-line against `001_initial_schema.sql`:

| Table Name | Column Name | Type / Constraint | Status | Notes |
|---|---|---|---|---|
| `orders` | `id` | `UUID PRIMARY KEY` | Verified | Default `gen_random_uuid()` |
| `orders` | `order_number` | `TEXT UNIQUE NOT NULL` | Verified | Server-side format `OK-YYYYMMDD-XXXXXX` |
| `orders` | `tracking_token` | `UUID NOT NULL UNIQUE` | Added | Migration 002 adds with `gen_random_uuid()` default |
| `orders` | `branch_id` | `UUID REFERENCES branches(id)` | Verified | FK to `branches` |
| `orders` | `customer_id` | `UUID REFERENCES profiles(id)` | Verified | Nullable for guest orders |
| `orders` | `customer_name` | `TEXT NOT NULL` | Verified | — |
| `orders` | `customer_phone` | `TEXT NOT NULL` | Verified | — |
| `orders` | `order_type` | `TEXT CHECK (...)` | Verified | `DINE_IN`, `TAKEAWAY`, `DELIVERY` |
| `orders` | `table_id` | `UUID REFERENCES tables(id)` | Verified | Nullable |
| `orders` | `delivery_address` | `TEXT` | Verified | Required for `DELIVERY` |
| `orders` | `delivery_notes` | `TEXT` | Verified | — |
| `orders` | `subtotal` | `NUMERIC(10,2) NOT NULL` | Verified | Calculated server-side in RPC |
| `orders` | `delivery_fee` | `NUMERIC(10,2) DEFAULT 0.00` | Verified | Calculated server-side in RPC |
| `orders` | `total_amount` | `NUMERIC(10,2) NOT NULL` | Verified | Calculated server-side in RPC |
| `orders` | `payment_method` | `TEXT CHECK (...)` | Updated | Constraint includes `TEST_PAYMENT`, `JAZZCASH`, `EASYPAISA`, `CARD`, `ONLINE`, `CASH` |
| `orders` | `payment_status` | `TEXT DEFAULT 'PENDING'` | Verified | `PENDING`, `PAID`, `FAILED` |
| `orders` | `status` | `TEXT DEFAULT 'PENDING'` | Verified | Enforced via transition matrix in `update_order_status_secure` |
| `orders` | `created_at` / `updated_at` | `TIMESTAMPTZ` | Verified | — |
| `order_items` | `order_id`, `menu_item_id`, `variant_id`, `unit_price`, `quantity`, `subtotal_price` | Standard FK & NUMERIC | Verified | Handled in RPC insertion |

---

### 2. Row Level Security (RLS) Verification

RLS is enabled on **ALL 16 RELATIONAL TABLES** in `002_security_hardening.sql`:

1. `profiles`: Self-read/update (role escalation blocked), OWNER full access.
2. `branches`: Public read active branches (`is_active = true`); modify restricted to OWNER.
3. `branch_capabilities`: Public read; update restricted to OWNER & assigned Branch Admin.
4. `branch_users`: OWNER management only. Staff self-assignment strictly prevented.
5. `menu_categories`: Public read active categories; modify restricted to OWNER & Branch Admin.
6. `menu_items`: Public read available items (`is_available = true`); modify restricted to OWNER, Branch Admin & Kitchen.
7. `menu_item_variants`: Public read; modify restricted to OWNER & Branch Admin.
8. `tables`: Public direct table SELECT **BLOCKED**. Public access via `validate_qr_token` RPC only.
9. `orders`: Direct client `INSERT` **BLOCKED**. Handled exclusively via `create_order_atomic()` RPC. Read/Update restricted to order owner, assigned branch staff, assigned rider, or OWNER.
10. `order_items`: Direct client `INSERT` **BLOCKED**. Handled via `create_order_atomic()`. Read restricted to order owner, assigned branch staff, or assigned rider.
11. `order_status_history`: Immutable log; insertion restricted to RPCs.
12. `rider_assignments`: Direct `INSERT` **BLOCKED**. Handled via `claim_delivery_order()` RPC.
13. `buffet_registrations` & `buffet_bookings`: Public read active buffets; ticket check-in restricted to branch staff.
14. `merchant_bank_config`: **OWNER ONLY DIRECT ACCESS**. Public checkout info exposed via `get_public_merchant_payment_info()` RPC.
15. `audit_logs`: Immutable log. `UPDATE` and `DELETE` strictly **BLOCKED FOR ALL**.

---

### 3. SECURITY DEFINER & RPC Governance

All `SECURITY DEFINER` helper functions specify `SET search_path = public, pg_temp;` and qualify all table references:

- **Helper Functions**: `get_user_role()`, `is_owner()`, `is_staff_of_branch()`, `is_rider()`
- **Public RPCs**: `validate_qr_token()`, `get_public_merchant_payment_info()`, `get_order_by_tracking_token()`, `create_order_atomic()`
- **Authenticated RPCs**: `update_order_status_secure()`, `claim_delivery_order()`
- **Privilege Governance**: Executed `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` for internal helper functions, granting `EXECUTE` only to `anon` and `authenticated` roles for explicit public/staff RPCs.

---

### 4. Critical Flow & Security Enforcement Highlights

1. **Server-Side Price Calculation**: `create_order_atomic()` computes all item unit prices, subtotal, delivery fees, and total amounts directly from `menu_items` and `menu_item_variants`. Client-supplied price values are completely ignored.
2. **Parent-Child Insertion Order**: `create_order_atomic()` inserts into `orders` FIRST, then `order_items` SECOND (referencing `orders.id`), and `order_status_history` THIRD.
3. **Collision-Resistant Order Numbers**: Format `OK-YYYYMMDD-XXXXXX` combining date timestamp with a 6-character hex substring from `gen_random_uuid()`.
4. **Order Status Transition Matrix**: `update_order_status_secure()` enforces row-level locking (`FOR UPDATE`) and validates allowed transitions:
   - `PENDING` ➔ `CONFIRMED` / `REJECTED` / `CANCELLED`
   - `CONFIRMED` ➔ `PREPARING` / `CANCELLED`
   - `PREPARING` ➔ `READY` / `CANCELLED`
   - `READY` ➔ `ASSIGNED` / `COMPLETED` / `CANCELLED`
   - `ASSIGNED` ➔ `PICKED_UP` / `CANCELLED`
   - `PICKED_UP` ➔ `OUT_FOR_DELIVERY` / `CANCELLED`
   - `OUT_FOR_DELIVERY` ➔ `DELIVERED` / `COMPLETED` / `CANCELLED`
5. **Rider Concurrency Safety**: `claim_delivery_order()` locks the order row, verifies `order_type = 'DELIVERY'`, `status = 'READY'`, checks branch staff assignment, and enforces single-rider claiming via `UNIQUE` constraint on `rider_assignments.order_id`.
6. **Guest Order Tracking Security**: `get_order_by_tracking_token()` queries by 128-bit `tracking_token` UUID and returns only non-sensitive order details. Internal authentication IDs, payment config secrets, and rider notes are withheld.
7. **Auth Profile Creation Trigger**: `handle_new_user()` creates default `CUSTOMER` profile upon signup. Uses `ON CONFLICT (id) DO UPDATE` to preserve user IDs without corrupting primary or foreign keys.

---

### 5. Menu Architecture Discovered

- `menu_categories` and `menu_items` contain **no `branch_id` column** in `001_initial_schema.sql`; they are **Global/Shared across all branches**.
- `OWNER` manages global menu structure.
- `BRANCH_ADMIN` and `KITCHEN` can toggle item availability (`is_available`).

---

### 6. Build and Verification Results

- **TypeScript Checking (`npx tsc --noEmit`)**: **PASS** (0 errors).
- **Next.js Production Build (`npm run build`)**: **PASS** (Compiled successfully, 15/15 static pages generated).
- **Production Database**: **0 Production SQL Queries Executed**.

---

### FINAL SECURITY STATUS

### **PASS WITH WARNINGS**

#### Warnings / Pre-Deployment Action Items:
1. **Apply Migration 002**: Before testing frontend order placement or authentication live in production, run `002_security_hardening.sql` in the Supabase Dashboard SQL Editor or CLI.
2. **Seeded Demo Credentials**: Demo profiles in `seed.sql` exist in PostgreSQL `public.profiles`, but must be registered in Supabase Auth (`auth.users`) via dashboard or application sign-up before password login will function for seeded demo staff.

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

export interface TestUser {
  id: string;
  email: string;
  role: 'OWNER' | 'BRANCH_ADMIN' | 'KITCHEN' | 'RIDER' | 'CUSTOMER';
  branch_id: string | null;
  full_name: string;
  phone: string;
}

export const TEST_BRANCHES = {
  DERA: {
    id: 'b1000000-0000-0000-0000-000000000001',
    name: 'Dera Chungi',
    slug: 'dera-chungi',
  },
  JAMPUR: {
    id: 'b2000000-0000-0000-0000-000000000002',
    name: 'Main Bypass Jampur',
    slug: 'sherifalon-bypass',
  },
  KOT_CHUTTA: {
    id: 'b3000000-0000-0000-0000-000000000003',
    name: 'Kot Chuta',
    slug: 'kot-chuta',
  },
};

export const TEST_USERS: Record<string, TestUser> = {
  OWNER: {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'owner@okrestaurant.com',
    role: 'OWNER',
    branch_id: null,
    full_name: 'Executive Restaurant Owner',
    phone: '0300-0000001',
  },
  ADMIN_BRANCH_A: {
    id: 'a1000000-0000-0000-0000-000000000001',
    email: 'admin.dera@okrestaurant.com',
    role: 'BRANCH_ADMIN',
    branch_id: TEST_BRANCHES.DERA.id,
    full_name: 'Dera Branch Admin',
    phone: '0300-1000001',
  },
  ADMIN_BRANCH_B: {
    id: 'a2000000-0000-0000-0000-000000000002',
    email: 'admin.jampur@okrestaurant.com',
    role: 'BRANCH_ADMIN',
    branch_id: TEST_BRANCHES.JAMPUR.id,
    full_name: 'Jampur Branch Admin',
    phone: '0300-2000001',
  },
  KITCHEN_BRANCH_A: {
    id: 'a1000000-0000-0000-0000-000000000011',
    email: 'kitchen.dera@okrestaurant.com',
    role: 'KITCHEN',
    branch_id: TEST_BRANCHES.DERA.id,
    full_name: 'Dera Head Chef',
    phone: '0300-1000011',
  },
  KITCHEN_BRANCH_B: {
    id: 'a2000000-0000-0000-0000-000000000012',
    email: 'kitchen.jampur@okrestaurant.com',
    role: 'KITCHEN',
    branch_id: TEST_BRANCHES.JAMPUR.id,
    full_name: 'Jampur Head Chef',
    phone: '0300-2000012',
  },
  RIDER_A1: {
    id: 'a1000000-0000-0000-0000-000000000021',
    email: 'rider1.dera@okrestaurant.com',
    role: 'RIDER',
    branch_id: TEST_BRANCHES.DERA.id,
    full_name: 'Dera Rider 1',
    phone: '0300-1000021',
  },
  RIDER_A2: {
    id: 'a1000000-0000-0000-0000-000000000022',
    email: 'rider2.dera@okrestaurant.com',
    role: 'RIDER',
    branch_id: TEST_BRANCHES.DERA.id,
    full_name: 'Dera Rider 2',
    phone: '0300-1000022',
  },
  RIDER_B1: {
    id: 'a2000000-0000-0000-0000-000000000021',
    email: 'rider1.jampur@okrestaurant.com',
    role: 'RIDER',
    branch_id: TEST_BRANCHES.JAMPUR.id,
    full_name: 'Jampur Rider 1',
    phone: '0300-2000021',
  },
  CUSTOMER_1: {
    id: 'a9000000-0000-0000-0000-000000000001',
    email: 'customer1@gmail.com',
    role: 'CUSTOMER',
    branch_id: null,
    full_name: 'Zaryab Customer 1',
    phone: '0300-9000001',
  },
  CUSTOMER_2: {
    id: 'a9000000-0000-0000-0000-000000000002',
    email: 'customer2@gmail.com',
    role: 'CUSTOMER',
    branch_id: null,
    full_name: 'Fatima Customer 2',
    phone: '0300-9000002',
  },
};

export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();

  // 1. Setup Auth mock schema in PostgreSQL
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
    $$ LANGUAGE sql STABLE;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
    END $$;
  `);

  // 2. Load all migrations sequentially
  const rootDir = process.cwd();
  const migrationFiles = [
    path.join(rootDir, 'supabase/migrations/001_initial_schema.sql'),
    path.join(rootDir, 'supabase/migrations/007_production_security_hardening.sql'),
    path.join(rootDir, 'supabase/migrations/008_branch_specific_menu_management.sql'),
    path.join(rootDir, 'supabase/migrations/009_branch_delivery_zones.sql'),
    path.join(rootDir, 'supabase/migrations/010_production_payment_integration.sql'),
    path.join(rootDir, 'supabase/migrations/011_buffet_security_hardening.sql'),
  ];

  for (const file of migrationFiles) {
    let sql = fs.readFileSync(file, 'utf8');

    // Adapt Supabase-specific cloud extensions & publication directives
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/gi, '');
    sql = sql.replace(/ALTER PUBLICATION [^;]+;/gi, '');

    await db.exec(sql);

    // Seed branches immediately after 001_initial_schema
    if (file.includes('001_initial_schema')) {
      await db.exec(`
        INSERT INTO public.branches (id, name, slug, address, phone, is_active)
        VALUES 
          ('${TEST_BRANCHES.DERA.id}', '${TEST_BRANCHES.DERA.name}', '${TEST_BRANCHES.DERA.slug}', 'Opposite Shell Pump, Jampur', '0334-4683344', true),
          ('${TEST_BRANCHES.JAMPUR.id}', '${TEST_BRANCHES.JAMPUR.name}', '${TEST_BRANCHES.JAMPUR.slug}', 'Sherifalon Bypass Road, Jampur', '0336-4683344', true),
          ('${TEST_BRANCHES.KOT_CHUTTA.id}', '${TEST_BRANCHES.KOT_CHUTTA.name}', '${TEST_BRANCHES.KOT_CHUTTA.slug}', 'Main Highway, Kot Chuta', '0333-2225757', true)
        ON CONFLICT (id) DO NOTHING;
      `);
    }
  }

  // 3. Seed test users profiles & branch assignments
  for (const user of Object.values(TEST_USERS)) {
    await db.query(`
      INSERT INTO public.profiles (id, email, full_name, role, phone)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone;
    `, [user.id, user.email, user.full_name, user.role, user.phone]);

    if (user.branch_id && user.role !== 'OWNER' && user.role !== 'CUSTOMER') {
      await db.query(`
        INSERT INTO public.branch_users (user_id, branch_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET
          role = EXCLUDED.role;
      `, [user.id, user.branch_id, user.role]);
    }
  }

  // 4. Seed Branch Capabilities (Dera = delivery enabled)
  await db.exec(`
    INSERT INTO public.branch_capabilities (branch_id, dine_in_enabled, takeaway_enabled, delivery_enabled)
    VALUES 
      ('${TEST_BRANCHES.DERA.id}', TRUE, TRUE, TRUE),
      ('${TEST_BRANCHES.JAMPUR.id}', TRUE, TRUE, FALSE),
      ('${TEST_BRANCHES.KOT_CHUTTA.id}', TRUE, TRUE, FALSE)
    ON CONFLICT (branch_id) DO UPDATE SET
      delivery_enabled = EXCLUDED.delivery_enabled;
  `);

  // 5. Seed Delivery Zones for Dera
  await db.exec(`
    INSERT INTO public.delivery_zones (id, branch_id, name, delivery_fee, minimum_order_amount, estimated_delivery_minutes, is_active, sort_order)
    VALUES 
      ('d1000000-0000-0000-0000-000000000001', '${TEST_BRANCHES.DERA.id}', 'Zone 1 - City Center & Main Bazar', 80.00, 350.00, 25, TRUE, 1),
      ('d1000000-0000-0000-0000-000000000002', '${TEST_BRANCHES.DERA.id}', 'Zone 2 - Model Town & Satellite Area', 120.00, 500.00, 35, TRUE, 2),
      ('d1000000-0000-0000-0000-000000000003', '${TEST_BRANCHES.DERA.id}', 'Zone 3 - Indus Highway & Outer Bypass', 180.00, 700.00, 45, TRUE, 3)
    ON CONFLICT (id) DO NOTHING;
  `);

  // 6. Seed standard Menu Categories and Items
  await db.exec(`
    INSERT INTO public.menu_categories (id, name, slug, sort_order)
    VALUES 
      ('c1000000-0000-0000-0000-000000000001', 'Karahi & Handi', 'karahi-handi', 1),
      ('c2000000-0000-0000-0000-000000000002', 'Rice & Biryani', 'rice-biryani', 2)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.menu_items (id, category_id, name, description, base_price, is_available)
    VALUES 
      ('f1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Chicken Shinwari Karahi Full', 'Tender chicken with fresh tomatoes', 1800.00, TRUE),
      ('f2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'Special Mutton Biryani', 'Aromatic basmati rice with mutton', 650.00, TRUE)
    ON CONFLICT (id) DO NOTHING;
  `);

  // 7. Ensure branch_menu_items are synced
  await db.exec(`
    INSERT INTO public.branch_menu_items (branch_id, menu_item_id, price, is_available, is_visible, preparation_time)
    SELECT b.id, m.id, m.base_price, TRUE, TRUE, 25
    FROM public.branches b
    CROSS JOIN public.menu_items m
    ON CONFLICT (branch_id, menu_item_id) DO NOTHING;
  `);

  // 8. Grant schema usage and table access to authenticated & anon roles
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon;
  `);

  return db;
}

/**
 * Set the execution context for RLS in PostgreSQL
 */
export async function setAuthUser(db: PGlite, user: TestUser | null): Promise<void> {
  if (!user) {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '', false);
      SELECT set_config('request.jwt.claim.role', 'anon', false);
      SET ROLE anon;
    `);
  } else {
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${user.id}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SET ROLE authenticated;
    `);
  }
}

/**
 * Run a database callback under a specific authenticated user's RLS context
 */
export async function runAsUser<T>(
  db: PGlite,
  user: TestUser | null,
  callback: () => Promise<T>
): Promise<T> {
  await setAuthUser(db, user);
  try {
    return await callback();
  } finally {
    await db.exec('RESET ROLE;');
  }
}

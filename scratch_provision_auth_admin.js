global.WebSocket = class {};

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const [key, val] = line.split('=');
    if (key && val) {
      process.env[key.trim()] = val.trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use service role key if available, else anon key
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const demoAccounts = [
  { id: '10000000-0000-0000-0000-000000000001', email: 'owner1@okrestaurant.com', name: 'Muhammad Ibrahim (Owner 1)', phone: '0333-4683344', role: 'OWNER' },
  { id: '20000000-0000-0000-0000-000000000002', email: 'admin.dera@okrestaurant.com', name: 'Tariq Admin (Dera Chungi)', phone: '0334-4683344', role: 'BRANCH_ADMIN' },
  { id: '30000000-0000-0000-0000-000000000001', email: 'kitchen.dera@okrestaurant.com', name: 'Chef Ahmad (Dera Kitchen)', phone: '0300-1112233', role: 'KITCHEN' },
  { id: '40000000-0000-0000-0000-000000000001', email: 'rider1.dera@okrestaurant.com', name: 'Ali Rider (Dera Delivery)', phone: '0301-9998877', role: 'RIDER' },
  { id: '50000000-0000-0000-0000-000000000001', email: 'customer.demo@gmail.com', name: 'Usman Customer', phone: '0321-5554433', role: 'CUSTOMER' },
];

const SHARED_PASSWORD = 'okaykarubas12390';

async function provisionAdminAccounts() {
  console.log('=== PROVISIONING VIA SUPABASE ADMIN API ===');

  for (const acc of demoAccounts) {
    const { data: user, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      id: acc.id,
      email: acc.email,
      password: SHARED_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: acc.name,
        phone: acc.phone
      }
    });

    if (createErr) {
      console.log(`⚠️ ${acc.email} Create User Note: ${createErr.message}`);
      // Attempt password update if user already exists
      const { data: updateData, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        acc.id,
        { password: SHARED_PASSWORD, email_confirm: true }
      );
      if (updateErr) {
        console.error(`❌ ${acc.email} Update Error: ${updateErr.message}`);
      } else {
        console.log(`✅ ${acc.email} Password Updated & Email Confirmed!`);
      }
    } else {
      console.log(`🎉 ${acc.email} Created & Confirmed in Auth! ID: ${user.user?.id}`);
    }

    // Ensure public.profiles is synced with correct role
    await supabaseAdmin
      .from('profiles')
      .upsert({ id: acc.id, email: acc.email, full_name: acc.name, phone: acc.phone, role: acc.role });
  }

  console.log('\n=== TESTING LOGINS NOW ===');
  for (const acc of demoAccounts) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: acc.email,
      password: SHARED_PASSWORD
    });

    if (error) {
      console.error(`❌ FAIL | ${acc.email}: ${error.message}`);
    } else {
      console.log(`✅ PASS | [${acc.role}] ${acc.email} logged in!`);
    }
  }
}

provisionAdminAccounts();

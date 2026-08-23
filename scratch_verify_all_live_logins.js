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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const testAccounts = [
  { role: 'OWNER', email: 'owner1@okrestaurant.com' },
  { role: 'BRANCH_ADMIN', email: 'admin.dera@okrestaurant.com' },
  { role: 'KITCHEN', email: 'kitchen.dera@okrestaurant.com' },
  { role: 'RIDER', email: 'rider1.dera@okrestaurant.com' },
  { role: 'CUSTOMER', email: 'customer.demo@gmail.com' },
];

const PASSWORD = 'okaykarubas12390';

async function verifyAllLiveLogins() {
  console.log('====================================================');
  console.log('   VERIFYING ALL LIVE DEMO LOGINS ON SUPABASE AUTH  ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  for (const acc of testAccounts) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: PASSWORD,
    });

    if (error) {
      console.log(`❌ FAIL | [${acc.role}] ${acc.email} ➔ Error: ${error.message}`);
      failed++;
    } else {
      console.log(`✅ PASS | [${acc.role}] ${acc.email} ➔ Logged in successfully! (User ID: ${data.user?.id})`);
      passed++;
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL LOGINS TESTED: ${testAccounts.length} | SUCCESS: ${passed} | FAILED: ${failed}`);
  console.log('====================================================');
}

verifyAllLiveLogins();

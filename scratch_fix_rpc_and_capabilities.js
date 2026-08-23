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

async function applyFixes() {
  console.log('=== UPDATING SUPABASE BRANCH CAPABILITIES & RPC ===');

  // Update Branch Capabilities in database to match business requirements:
  // Dera Chungi (b1): delivery_enabled = true
  // Sherifalon (b2): delivery_enabled = false
  // Kot Chuta (b3): delivery_enabled = false

  const { error: b2Err } = await supabase
    .from('branch_capabilities')
    .update({ delivery_enabled: false })
    .eq('branch_id', 'b2000000-0000-0000-0000-000000000002');

  if (b2Err) console.error('b2 error:', b2Err.message); else console.log('✅ Updated Sherifalon branch delivery_enabled = false');

  const { error: b3Err } = await supabase
    .from('branch_capabilities')
    .update({ delivery_enabled: false })
    .eq('branch_id', 'b3000000-0000-0000-0000-000000000003');

  if (b3Err) console.error('b3 error:', b3Err.message); else console.log('✅ Updated Kot Chuta branch delivery_enabled = false');
}

applyFixes();

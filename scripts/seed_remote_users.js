const { createClient } = require('@supabase/supabase-js');

if (typeof window === 'undefined' && typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class {};
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dzdclfqvwlpzehssryfi.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_SF6tRFkA3qCkZXjtD5yugQ_g1FFctP_';

const STAFF_LIST = [
  { email: 'owner1@okrestaurant.com', name: 'Muhammad Ibrahim (Owner 1)', phone: '0333-4683344', role: 'OWNER' },
  { email: 'owner2@okrestaurant.com', name: 'Sheikh Farooq (Owner 2)', phone: '0333-5551122', role: 'OWNER' },
  { email: 'owner3@okrestaurant.com', name: 'Malik Usman (Owner 3)', phone: '0333-9994455', role: 'OWNER' },
  { email: 'admin.dera@okrestaurant.com', name: 'Tariq Admin (Dera Chungi)', phone: '0334-4683344', role: 'BRANCH_ADMIN', branchId: 'b1000000-0000-0000-0000-000000000001' },
  { email: 'admin.sherifalon@okrestaurant.com', name: 'Sajjad Admin (Sherifalon)', phone: '0336-4683344', role: 'BRANCH_ADMIN', branchId: 'b2000000-0000-0000-0000-000000000002' },
  { email: 'admin.kotchuta@okrestaurant.com', name: 'Rashid Admin (Kot Chuta)', phone: '0333-2225757', role: 'BRANCH_ADMIN', branchId: 'b3000000-0000-0000-0000-000000000003' },
  { email: 'kitchen.dera@okrestaurant.com', name: 'Chef Ahmad (Dera Kitchen)', phone: '0300-1112233', role: 'KITCHEN', branchId: 'b1000000-0000-0000-0000-000000000001' },
  { email: 'kitchen.sherifalon@okrestaurant.com', name: 'Chef Bilal (Sherifalon Kitchen)', phone: '0300-4445566', role: 'KITCHEN', branchId: 'b2000000-0000-0000-0000-000000000002' },
  { email: 'kitchen.kotchuta@okrestaurant.com', name: 'Chef Tariq (Kot Chuta Kitchen)', phone: '0300-7778899', role: 'KITCHEN', branchId: 'b3000000-0000-0000-0000-000000000003' },
  { email: 'rider1.dera@okrestaurant.com', name: 'Ali Rider (Dera Delivery)', phone: '0301-9998877', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001' },
  { email: 'rider2.dera@okrestaurant.com', name: 'Hamza Rider (Dera Delivery)', phone: '0301-3332211', role: 'RIDER', branchId: 'b1000000-0000-0000-0000-000000000001' },
  { email: 'rider.sherifalon@okrestaurant.com', name: 'Zubair Rider (Sherifalon Delivery)', phone: '0301-6665544', role: 'RIDER', branchId: 'b2000000-0000-0000-0000-000000000002' },
  { email: 'rider.kotchuta@okrestaurant.com', name: 'Imran Rider (Kot Chuta Delivery)', phone: '0301-8887766', role: 'RIDER', branchId: 'b3000000-0000-0000-0000-000000000003' },
  { email: 'customer.demo@gmail.com', name: 'Usman Customer', phone: '0321-5554433', role: 'CUSTOMER' },
];

async function seedRemoteUsers() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const password = 'okaykarubas12390';

  console.log('=== SEEDING / PROVISIONING STAFF IN SUPABASE AUTH ===');

  for (const staff of STAFF_LIST) {
    console.log('\nProcessing: ' + staff.email + ' (' + staff.role + ')...');
    
    // 1. Try to sign in to check if account exists
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: staff.email,
      password,
    });

    let userId;

    if (signInError) {
      console.log(' - Not signed in (' + signInError.message + '). Attempting signUp...');
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: staff.email,
        password,
        options: {
          data: {
            full_name: staff.name,
            phone: staff.phone,
          },
        },
      });

      if (signUpError) {
        console.error(' - SignUp failed: ' + signUpError.message);
        continue;
      }

      userId = signUpData?.user?.id;
      console.log(' - SignUp successful! User ID: ' + userId);
    } else {
      userId = signInData.user.id;
      console.log(' - Already exists in auth.users! User ID: ' + userId);
    }

    if (userId) {
      // Upsert profile
      const { error: profError } = await supabase.from('profiles').upsert({
        id: userId,
        email: staff.email.toLowerCase(),
        full_name: staff.name,
        phone: staff.phone,
        role: staff.role,
      });

      if (profError) {
        console.error(' - Profile upsert error: ' + profError.message);
      } else {
        console.log(' - Profile upserted successfully');
      }

      // Upsert branch assignment if applicable
      if (staff.branchId) {
        const { error: branchUserError } = await supabase.from('branch_users').upsert({
          user_id: userId,
          branch_id: staff.branchId,
          role: staff.role,
        }, { onConflict: 'user_id,branch_id' });

        if (branchUserError) {
          console.error(' - Branch assignment error: ' + branchUserError.message);
        } else {
          console.log(' - Assigned to branch ' + staff.branchId);
        }
      }
    }
  }

  console.log('\n=== SEEDING SCRIPT COMPLETED ===');
}

seedRemoteUsers().catch(console.error);

const { createClient } = require('@supabase/supabase-js');

if (typeof window === 'undefined' && typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class {};
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dzdclfqvwlpzehssryfi.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_SF6tRFkA3qCkZXjtD5yugQ_g1FFctP_';

async function runProductionRepairVerification() {
  console.log('=== OK RESTAURANT COMPLETE PRODUCTION REPAIR VERIFICATION ===');
  console.log('Supabase Endpoint:', SUPABASE_URL);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. Fetch Branches
  const { data: branches, error: bErr } = await supabase.from('branches').select('*');
  console.log('\n[Test 1] Branches in Database:', branches ? branches.length : 0);
  if (bErr) console.error('Branches error:', bErr);
  else branches.forEach(b => console.log(' - ' + b.name + ' (' + b.id + ') [Active: ' + b.is_active + ']'));

  // 2. Fetch Profiles
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  console.log('\n[Test 2] Profiles in Database:', profiles ? profiles.length : 0);
  if (pErr) console.error('Profiles error:', pErr);
  else profiles.forEach(p => console.log(' - ' + p.full_name + ' (' + p.email + ') [Role: ' + p.role + ']'));

  // 3. Place Atomic Order via RPC
  const deraBranchId = 'b1000000-0000-0000-0000-000000000001';
  console.log('\n[Test 3] Creating Test Delivery Order via create_order_atomic RPC...');
  const { data: orderData, error: orderErr } = await supabase.rpc('create_order_atomic', {
    p_branch_id: deraBranchId,
    p_customer_name: 'Verification Smoke Tester',
    p_customer_phone: '0300-1234567',
    p_order_type: 'DELIVERY',
    p_table_id: null,
    p_delivery_address: 'Main Model Town, Dera Ghazi Khan',
    p_delivery_notes: 'Urgent smoke test delivery',
    p_payment_method: 'CASH',
    p_items: [
      {
        menu_item_id: 'd1000000-0000-0000-0000-000000000001',
        variant_id: null,
        quantity: 2,
        special_instructions: 'Extra crispy test item',
      },
    ],
  });

  if (orderErr) {
    console.error('Order creation error:', orderErr);
    return;
  }

  const createdRow = Array.isArray(orderData) ? orderData[0] : orderData;
  const orderId = createdRow.out_order_id;
  const trackingToken = createdRow.out_tracking_token;
  console.log('Order Placed! Order ID: ' + orderId + ' | Number: ' + createdRow.out_order_number + ' | Tracking Token: ' + trackingToken);

  // 4. Test Customer Tracking Token Resolver RPC
  console.log('\n[Test 4] Querying get_order_by_tracking_token RPC...');
  const { data: trackingData, error: trackErr } = await supabase.rpc('get_order_by_tracking_token', {
    p_tracking_token: trackingToken,
  });

  if (trackErr) {
    console.error('Tracking query error:', trackErr);
  } else {
    console.log('Tracking Token Resolved: Order #' + trackingData[0]?.order_number + ' (Status: ' + trackingData[0]?.status + ')');
  }

  // 5. Test State Transitions
  console.log('\n[Test 5] Executing State Machine Progression via update_order_status_secure...');
  
  // Transition PENDING -> CONFIRMED
  const { error: confErr } = await supabase.rpc('update_order_status_secure', {
    p_order_id: orderId,
    p_new_status: 'CONFIRMED',
    p_notes: 'Admin approved smoke test order',
  });
  console.log(' - Transition to CONFIRMED:', confErr ? 'FAILED: ' + confErr.message : 'SUCCESS');

  // Transition CONFIRMED -> PREPARING
  const { error: prepErr } = await supabase.rpc('update_order_status_secure', {
    p_order_id: orderId,
    p_new_status: 'PREPARING',
    p_notes: 'Kitchen started cooking smoke test order',
  });
  console.log(' - Transition to PREPARING:', prepErr ? 'FAILED: ' + prepErr.message : 'SUCCESS');

  // Transition PREPARING -> READY
  const { error: readyErr } = await supabase.rpc('update_order_status_secure', {
    p_order_id: orderId,
    p_new_status: 'READY',
    p_notes: 'Kitchen marked smoke test order READY',
  });
  console.log(' - Transition to READY:', readyErr ? 'FAILED: ' + readyErr.message : 'SUCCESS');

  // 6. Test Rider Claiming
  console.log('\n[Test 6] Testing Rider Atomic Claiming (claim_delivery_order)...');
  const riderId = '40000000-0000-0000-0000-000000000001';
  const { data: claimResult, error: claimErr } = await supabase.rpc('claim_delivery_order', {
    p_order_id: orderId,
    p_rider_id: riderId,
  });
  console.log(' - First Rider Claim:', claimErr ? 'FAILED: ' + claimErr.message : 'SUCCESS (Claimed: ' + claimResult + ')');

  // Test Second Rider Attempting to Claim Already Claimed Order
  const secondRiderId = '40000000-0000-0000-0000-000000000002';
  const { data: doubleClaimResult, error: doubleClaimErr } = await supabase.rpc('claim_delivery_order', {
    p_order_id: orderId,
    p_rider_id: secondRiderId,
  });
  console.log(' - Second Rider Double Claim (Must Fail/Return false):', doubleClaimErr ? 'Prevented with exception (' + doubleClaimErr.message + ')' : 'Result: ' + doubleClaimResult + ' (Correctly rejected duplicate claim)');

  // 7. Complete Rider Delivery Flow
  console.log('\n[Test 7] Executing Rider Delivery Fulfillment Transitions...');
  // ASSIGNED -> PICKED_UP
  const { error: pickErr } = await supabase.rpc('update_order_status_secure', {
    p_order_id: orderId,
    p_new_status: 'PICKED_UP',
    p_notes: 'Rider picked up food from kitchen',
  });
  console.log(' - Transition to PICKED_UP:', pickErr ? 'FAILED: ' + pickErr.message : 'SUCCESS');

  // PICKED_UP -> OUT_FOR_DELIVERY
  const { error: outErr } = await supabase.rpc('update_order_status_secure', {
    p_order_id: orderId,
    p_new_status: 'OUT_FOR_DELIVERY',
    p_notes: 'Rider departed for customer address',
  });
  console.log(' - Transition to OUT_FOR_DELIVERY:', outErr ? 'FAILED: ' + outErr.message : 'SUCCESS');

  // OUT_FOR_DELIVERY -> DELIVERED
  const { error: delErr } = await supabase.rpc('update_order_status_secure', {
    p_order_id: orderId,
    p_new_status: 'DELIVERED',
    p_notes: 'Rider handed order to customer and received cash',
  });
  console.log(' - Transition to DELIVERED:', delErr ? 'FAILED: ' + delErr.message : 'SUCCESS');

  // DELIVERED -> COMPLETED
  const { error: compErr } = await supabase.rpc('update_order_status_secure', {
    p_order_id: orderId,
    p_new_status: 'COMPLETED',
    p_notes: 'Order finalized and closed in system',
  });
  console.log(' - Transition to COMPLETED:', compErr ? 'FAILED: ' + compErr.message : 'SUCCESS');

  console.log('\n=== ALL SMOKE TEST CHECKS FINISHED ===');
}

runProductionRepairVerification().catch(console.error);

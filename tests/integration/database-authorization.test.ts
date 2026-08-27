import { PGlite } from '@electric-sql/pglite';
import { createTestDatabase, TEST_BRANCHES, TEST_USERS, runAsUser } from './postgres-harness';
import { SafepayPaymentProvider } from '../../lib/payment/safepay-provider';
import crypto from 'crypto';

describe('Real PostgreSQL Integration: Database Authorization & Workflow Security', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  // Helper to create a delivery order for a given customer and branch
  async function createOrder(customer: typeof TEST_USERS.CUSTOMER_1, branchId: string, customZoneId?: string) {
    const itemsJson = JSON.stringify([
      {
        menu_item_id: 'f1000000-0000-0000-0000-000000000001', // Rs. 1800
        quantity: 1,
      },
    ]);
    const res = await runAsUser(db, customer, async () => {
      return await db.query(`
        SELECT * FROM public.create_order_atomic(
          p_branch_id => $1::UUID,
          p_customer_name => $2::TEXT,
          p_customer_phone => $3::TEXT,
          p_order_type => 'DELIVERY'::TEXT,
          p_table_id => NULL::TEXT,
          p_delivery_address => 'Sample Street Address, Model Town'::TEXT,
          p_delivery_notes => 'Leave at door'::TEXT,
          p_payment_method => 'CASH'::TEXT,
          p_items => $4::JSONB,
          p_delivery_zone_id => $5::UUID
        );
      `, [branchId, customer.full_name, customer.phone, itemsJson, customZoneId || 'd1000000-0000-0000-0000-000000000001']);
    });
    return res.rows[0];
  }

  // ===========================================================================
  // 1. CUSTOMER CANNOT ACCESS ANOTHER CUSTOMER'S ORDER
  // ===========================================================================
  test('1. Customer cannot access another customer\'s order via RLS', async () => {
    const order1 = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);

    // Customer 1 querying their own order succeeds
    const cust1Result = await runAsUser(db, TEST_USERS.CUSTOMER_1, async () => {
      return await db.query('SELECT id, customer_name FROM public.orders WHERE id = $1', [order1.out_order_id]);
    });
    expect(cust1Result.rows.length).toBe(1);

    // Customer 2 querying Customer 1's order returns 0 rows (blocked by RLS)
    const cust2Result = await runAsUser(db, TEST_USERS.CUSTOMER_2, async () => {
      return await db.query('SELECT id, customer_name FROM public.orders WHERE id = $1', [order1.out_order_id]);
    });
    expect(cust2Result.rows.length).toBe(0);
  });

  // ===========================================================================
  // 2. CUSTOMER CANNOT CHANGE ORDER STATUS
  // ===========================================================================
  test('2. Customer cannot change order status', async () => {
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);

    await expect(
      runAsUser(db, TEST_USERS.CUSTOMER_1, async () => {
        return await db.query(`
          SELECT public.update_order_status_direct(
            p_order_id => $1::UUID,
            p_new_status => 'CONFIRMED'::TEXT,
            p_user_id => $2::UUID,
            p_notes => 'Customer attempting unauthorized confirmation'::TEXT
          );
        `, [order.out_order_id, TEST_USERS.CUSTOMER_1.id]);
      })
    ).rejects.toThrow(/Access Denied/i);

    // Verify order remains PENDING
    const check = await db.query('SELECT status FROM public.orders WHERE id = $1', [order.out_order_id]);
    expect(check.rows[0].status).toBe('PENDING');
  });

  // ===========================================================================
  // 3. CUSTOMER CANNOT CHANGE PRICE
  // ===========================================================================
  test('3. Customer cannot change price (server/database calculates prices)', async () => {
    // Attempting to send manipulated item price or free items
    const manipulatedItemsJson = JSON.stringify([
      {
        menu_item_id: 'f1000000-0000-0000-0000-000000000001', // Real base price is 1800.00
        price: 1.00, // Client tries to override price to Rs. 1
        unit_price: 5.00,
        quantity: 2,
      },
    ]);

    const res = await runAsUser(db, TEST_USERS.CUSTOMER_1, async () => {
      return await db.query(`
        SELECT * FROM public.create_order_atomic(
          p_branch_id => $1::UUID,
          p_customer_name => 'Price Hacker'::TEXT,
          p_customer_phone => '0300-9999999'::TEXT,
          p_order_type => 'DELIVERY'::TEXT,
          p_delivery_address => 'Hacked Street'::TEXT,
          p_items => $2::JSONB,
          p_delivery_zone_id => 'd1000000-0000-0000-0000-000000000001'::UUID
        );
      `, [TEST_BRANCHES.DERA.id, manipulatedItemsJson]);
    });

    const orderId = res.rows[0].out_order_id;
    const dbOrder = await db.query('SELECT subtotal, total_amount, delivery_fee FROM public.orders WHERE id = $1', [orderId]);
    
    // Subtotal MUST be 1800 * 2 = 3600.00 (Client price of 1.00 or 5.00 was completely ignored)
    expect(Number(dbOrder.rows[0].subtotal)).toBe(3600.00);
    expect(Number(dbOrder.rows[0].delivery_fee)).toBe(80.00);
    expect(Number(dbOrder.rows[0].total_amount)).toBe(3680.00);
  });

  // ===========================================================================
  // 4. BRANCH A ADMIN CANNOT ACCESS BRANCH B
  // ===========================================================================
  test('4. Branch A admin cannot access Branch B orders', async () => {
    // Create an order in Branch B (Jampur)
    const branchBOrder = await db.query(`
      INSERT INTO public.orders (
        id, order_number, branch_id, customer_name, customer_phone,
        order_type, subtotal, delivery_fee, total_amount, status, payment_status
      ) VALUES (
        gen_random_uuid(), 'JB-TEST-001', '${TEST_BRANCHES.JAMPUR.id}', 'Jampur Customer', '0300-2222222',
        'TAKEAWAY', 500.00, 0.00, 500.00, 'PENDING', 'PENDING'
      ) RETURNING id;
    `);
    const branchBOrderId = branchBOrder.rows[0].id;

    // Branch A Admin queries Branch B order -> Returns 0 rows
    const queryResult = await runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
      return await db.query('SELECT id FROM public.orders WHERE id = $1', [branchBOrderId]);
    });
    expect(queryResult.rows.length).toBe(0);

    // Branch B Admin queries Branch B order -> Returns 1 row
    const queryBResult = await runAsUser(db, TEST_USERS.ADMIN_BRANCH_B, async () => {
      return await db.query('SELECT id FROM public.orders WHERE id = $1', [branchBOrderId]);
    });
    expect(queryBResult.rows.length).toBe(1);
  });

  // ===========================================================================
  // 5. BRANCH A KITCHEN CANNOT ACCESS BRANCH B
  // ===========================================================================
  test('5. Branch A kitchen cannot access Branch B orders', async () => {
    const branchBOrder = await db.query(`
      INSERT INTO public.orders (
        id, order_number, branch_id, customer_name, customer_phone,
        order_type, subtotal, delivery_fee, total_amount, status, payment_status
      ) VALUES (
        gen_random_uuid(), 'JB-TEST-002', '${TEST_BRANCHES.JAMPUR.id}', 'Jampur Dine-in', '0300-3333333',
        'DINE_IN', 800.00, 0.00, 800.00, 'CONFIRMED', 'PENDING'
      ) RETURNING id;
    `);
    const branchBOrderId = branchBOrder.rows[0].id;

    // Kitchen A attempts to select Branch B order -> 0 rows
    const kitchenASelect = await runAsUser(db, TEST_USERS.KITCHEN_BRANCH_A, async () => {
      return await db.query('SELECT id FROM public.orders WHERE id = $1', [branchBOrderId]);
    });
    expect(kitchenASelect.rows.length).toBe(0);

    // Kitchen A attempts to transition Branch B order -> Fails
    await expect(
      runAsUser(db, TEST_USERS.KITCHEN_BRANCH_A, async () => {
        return await db.query(`
          SELECT public.update_order_status_direct(
            p_order_id => $1::UUID,
            p_new_status => 'PREPARING'::TEXT,
            p_user_id => $2::UUID
          );
        `, [branchBOrderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
      })
    ).rejects.toThrow(/Access Denied.*another branch/i);
  });

  // ===========================================================================
  // 6. BRANCH A RIDER CANNOT CLAIM BRANCH B DELIVERY
  // ===========================================================================
  test('6. Branch A rider cannot claim Branch B delivery', async () => {
    const branchBOrder = await db.query(`
      INSERT INTO public.orders (
        id, order_number, branch_id, customer_name, customer_phone,
        order_type, delivery_address, subtotal, delivery_fee, total_amount, status, payment_status
      ) VALUES (
        gen_random_uuid(), 'JB-DEL-001', '${TEST_BRANCHES.JAMPUR.id}', 'Jampur Delivery', '0300-4444444',
        'DELIVERY', 'Jampur Bypass Road', 1200.00, 100.00, 1300.00, 'READY', 'PENDING'
      ) RETURNING id;
    `);
    const branchBOrderId = branchBOrder.rows[0].id;

    // Rider A1 (assigned to Dera branch) attempts to claim Jampur branch order -> Throws
    await expect(
      runAsUser(db, TEST_USERS.RIDER_A1, async () => {
        return await db.query(`
          SELECT public.claim_delivery_order(
            p_order_id => $1::UUID,
            p_rider_id => $2::UUID
          );
        `, [branchBOrderId, TEST_USERS.RIDER_A1.id]);
      })
    ).rejects.toThrow(/Access Denied.*branch/i);
  });

  // ===========================================================================
  // 7. RIDER CANNOT IMPERSONATE ANOTHER RIDER
  // ===========================================================================
  test('7. Rider cannot impersonate another rider', async () => {
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);
    const orderId = order.out_order_id;

    // Admin confirms
    await runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
      await db.query('SELECT public.update_order_status_direct($1, \'CONFIRMED\', $2)', [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
    });
    // Kitchen starts preparing and sets ready
    await runAsUser(db, TEST_USERS.KITCHEN_BRANCH_A, async () => {
      await db.query('SELECT public.update_order_status_direct($1, \'PREPARING\', $2)', [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
      await db.query('SELECT public.update_order_status_direct($1, \'READY\', $2)', [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
    });

    // Rider A1 attempts to claim under Rider A2's ID -> Throws impersonation error
    await expect(
      runAsUser(db, TEST_USERS.RIDER_A1, async () => {
        return await db.query(`
          SELECT public.claim_delivery_order(
            p_order_id => $1::UUID,
            p_rider_id => $2::UUID
          );
        `, [orderId, TEST_USERS.RIDER_A2.id]);
      })
    ).rejects.toThrow(/Impersonating another rider is strictly prohibited/i);
  });

  // ===========================================================================
  // 8. INVALID ORDER STATUS TRANSITIONS FAIL
  // ===========================================================================
  test('8. Invalid order status transitions fail inside PostgreSQL FSM', async () => {
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);
    const orderId = order.out_order_id; // Status is PENDING

    // PENDING -> DELIVERED (Illegal skip)
    await expect(
      runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
        return await db.query('SELECT public.update_order_status_direct($1, \'DELIVERED\', $2)', [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
      })
    ).rejects.toThrow(/Illegal order status transition/i);

    // PENDING -> READY (Illegal skip)
    await expect(
      runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
        return await db.query('SELECT public.update_order_status_direct($1, \'READY\', $2)', [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
      })
    ).rejects.toThrow(/Illegal order status transition/i);

    // Transition to CONFIRMED
    await runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
      await db.query('SELECT public.update_order_status_direct($1, \'CONFIRMED\', $2)', [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
    });

    // CONFIRMED -> DELIVERED (Illegal skip)
    await expect(
      runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
        return await db.query('SELECT public.update_order_status_direct($1, \'DELIVERED\', $2)', [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
      })
    ).rejects.toThrow(/Illegal order status transition/i);

    // Transition to PREPARING then READY
    await runAsUser(db, TEST_USERS.KITCHEN_BRANCH_A, async () => {
      await db.query('SELECT public.update_order_status_direct($1, \'PREPARING\', $2)', [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
      await db.query('SELECT public.update_order_status_direct($1, \'READY\', $2)', [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
    });

    // READY -> COMPLETED (Illegal skip for DELIVERY order before delivery)
    await expect(
      runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
        return await db.query('SELECT public.update_order_status_direct($1, \'COMPLETED\', $2)', [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
      })
    ).rejects.toThrow(/Illegal order status transition/i);
  });

  // ===========================================================================
  // 9. CONCURRENT RIDER CLAIMING RESULTS IN EXACTLY ONE WINNER
  // ===========================================================================
  test('9. Concurrent rider claiming results in exactly one winner', async () => {
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);
    const orderId = order.out_order_id;

    // Advance to READY via PREPARING
    await runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
      await db.query('SELECT public.update_order_status_direct($1, \'CONFIRMED\', $2)', [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
    });
    await runAsUser(db, TEST_USERS.KITCHEN_BRANCH_A, async () => {
      await db.query('SELECT public.update_order_status_direct($1, \'PREPARING\', $2)', [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
      await db.query('SELECT public.update_order_status_direct($1, \'READY\', $2)', [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
    });

    // Rider 1 claims first
    const rider1Result = await runAsUser(db, TEST_USERS.RIDER_A1, async () => {
      return await db.query('SELECT public.claim_delivery_order($1, $2) as success;', [orderId, TEST_USERS.RIDER_A1.id]);
    });
    expect(rider1Result.rows[0].success).toBe(true);

    // Rider 2 attempts to claim the same order -> returns false (atomic winner protection)
    const rider2Result = await runAsUser(db, TEST_USERS.RIDER_A2, async () => {
      return await db.query('SELECT public.claim_delivery_order($1, $2) as success;', [orderId, TEST_USERS.RIDER_A2.id]);
    });
    expect(rider2Result.rows[0].success).toBe(false);

    // Verify Rider 1 is the sole assigned rider
    const assignments = await db.query('SELECT rider_id, status FROM public.rider_assignments WHERE order_id = $1', [orderId]);
    expect(assignments.rows.length).toBe(1);
    expect(assignments.rows[0].rider_id).toBe(TEST_USERS.RIDER_A1.id);
  });

  // ===========================================================================
  // 10. DUPLICATE PAYMENT WEBHOOK IS IDEMPOTENT
  // ===========================================================================
  test('10. Duplicate payment webhook is idempotent', async () => {
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);
    const orderId = order.out_order_id;
    const amount = 1880.00; // 1800 + 80 delivery fee

    // First Webhook Delivery
    const firstCall = await db.query(`
      SELECT public.record_verified_payment(
        p_order_id => $1::UUID,
        p_provider => 'SAFEPAY'::TEXT,
        p_provider_transaction_id => 'sp_tx_10001'::TEXT,
        p_amount => $2::NUMERIC,
        p_currency => 'PKR'::TEXT,
        p_idempotency_key => 'idem_tx_10001'::TEXT
      ) as result;
    `, [orderId, amount]);

    expect(firstCall.rows[0].result.success).toBe(true);
    expect(firstCall.rows[0].result.payment_status).toBe('PAID');

    // Duplicate Webhook Delivery (exact same transaction / idempotency key)
    const secondCall = await db.query(`
      SELECT public.record_verified_payment(
        p_order_id => $1::UUID,
        p_provider => 'SAFEPAY'::TEXT,
        p_provider_transaction_id => 'sp_tx_10001'::TEXT,
        p_amount => $2::NUMERIC,
        p_currency => 'PKR'::TEXT,
        p_idempotency_key => 'idem_tx_10001'::TEXT
      ) as result;
    `, [orderId, amount]);

    expect(secondCall.rows[0].result.success).toBe(true);
    expect(secondCall.rows[0].result.message).toContain('Idempotent call');

    // Verify order payment status is PAID and exactly 1 transaction record exists
    const orderCheck = await db.query('SELECT payment_status FROM public.orders WHERE id = $1', [orderId]);
    expect(orderCheck.rows[0].payment_status).toBe('PAID');

    const txRecords = await db.query('SELECT * FROM public.payment_transactions WHERE idempotency_key = $1', ['idem_tx_10001']);
    expect(txRecords.rows.length).toBe(1);
  });

  // ===========================================================================
  // 11. INVALID PAYMENT SIGNATURE FAILS
  // ===========================================================================
  test('11. Invalid payment signature fails verification', async () => {
    const provider = new SafepayPaymentProvider({
      webhookSecret: 'test_webhook_secret_key_1234567890abcdef',
    });

    const payload = JSON.stringify({
      data: {
        token: 'track_123',
        amount: 250000,
        currency: 'PKR',
      },
    });

    // Generate real HMAC
    const validSignature = crypto
      .createHmac('sha256', 'test_webhook_secret_key_1234567890abcdef')
      .update(payload)
      .digest('hex');

    // Valid signature passes
    expect(provider.verifySignature(payload, validSignature)).toBe(true);

    // Tampered signature or body fails
    expect(provider.verifySignature(payload, 'deadbeef1234567890abcdef')).toBe(false);
    expect(provider.verifySignature(payload + 'tampered', validSignature)).toBe(false);
  });

  // ===========================================================================
  // 12. WRONG PAYMENT AMOUNT FAILS
  // ===========================================================================
  test('12. Wrong payment amount (underpayment) fails', async () => {
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);
    const orderId = order.out_order_id; // Total is 1880.00

    // Underpayment attempt: sending Rs. 500.00 instead of Rs. 1880.00
    await expect(
      db.query(`
        SELECT public.record_verified_payment(
          p_order_id => $1::UUID,
          p_provider => 'SAFEPAY'::TEXT,
          p_provider_transaction_id => 'sp_tx_underpaid'::TEXT,
          p_amount => 500.00::NUMERIC,
          p_currency => 'PKR'::TEXT
        );
      `, [orderId])
    ).rejects.toThrow(/lower than authoritative order total/i);

    // Verify order remains UNPAID
    const check = await db.query('SELECT payment_status FROM public.orders WHERE id = $1', [orderId]);
    expect(check.rows[0].payment_status).toBe('PENDING');
  });

  // ===========================================================================
  // 13. PUBLIC TRACKING EXPOSES ONLY SAFE FIELDS (PII MASKING)
  // ===========================================================================
  test('13. Public tracking RPC exposes only safe fields with PII masking', async () => {
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id);
    const trackingToken = order.out_tracking_token;

    // Anonymous public user tracking query
    const publicTracking = await runAsUser(db, null, async () => {
      return await db.query('SELECT * FROM public.get_order_by_tracking_token($1)', [trackingToken]);
    });

    expect(publicTracking.rows.length).toBe(1);
    const track = publicTracking.rows[0];

    // Check that phone number is masked: "0300****001"
    expect(track.customer_phone).toContain('****');
    expect(track.customer_phone).not.toBe('0300-9000001');

    // Customer name is present, but internal IDs / sensitive staff fields are not leaked
    expect(track.customer_name).toBe('Zaryab Customer 1');
    expect(track.branch_name).toBe('Dera Chungi');
  });

  // ===========================================================================
  // 14. BUFFET QR CANNOT BE REUSED
  // ===========================================================================
  test('14. Buffet QR cannot be reused (atomic check-in enforcement)', async () => {
    // 1. Create a buffet registration
    const buffetRes = await db.query(`
      INSERT INTO public.buffet_registrations (
        id, branch_id, title, description, dishes_list, price_per_head, event_date, start_time, end_time, is_active
      ) VALUES (
        gen_random_uuid(), '${TEST_BRANCHES.DERA.id}', 'Mega Family Buffet Dinner', 'All you can eat',
        ARRAY['Chicken Biryani', 'Mutton Karahi', 'Kheer'],
        1500.00, '2026-09-01', '19:00', '23:00', TRUE
      ) RETURNING id;
    `);
    const buffetId = buffetRes.rows[0].id;

    // 2. Book buffet ticket (Server computes 1500 * 3 = 4500)
    const bookingRes = await db.query(`
      SELECT * FROM public.book_buffet_ticket_atomic(
        p_buffet_id => $1::UUID,
        p_customer_name => 'Ahmad Buffet Guest'::TEXT,
        p_customer_phone => '0300-7777777'::TEXT,
        p_customer_email => 'ahmad@gmail.com'::TEXT,
        p_guests_count => 3
      );
    `, [buffetId]);

    const qrToken = bookingRes.rows[0].out_qr_token;
    expect(Number(bookingRes.rows[0].out_total_amount)).toBe(4500.00);

    // 3. First Check-in by Branch Admin -> SUCCEEDS
    const firstCheckIn = await db.query(`
      SELECT public.check_in_buffet_ticket_atomic(
        p_qr_token => $1::TEXT,
        p_staff_user_id => $2::UUID,
        p_branch_id => $3::UUID
      ) as result;
    `, [qrToken, TEST_USERS.ADMIN_BRANCH_A.id, TEST_BRANCHES.DERA.id]);

    expect(firstCheckIn.rows[0].result.success).toBe(true);
    expect(firstCheckIn.rows[0].result.customer_name).toBe('Ahmad Buffet Guest');
    expect(firstCheckIn.rows[0].result.guests_count).toBe(3);

    // Verify booking in database transitioned to CHECKED_IN
    const checkBooking = await db.query('SELECT status FROM public.buffet_bookings WHERE id = $1', [bookingRes.rows[0].out_booking_id]);
    expect(checkBooking.rows[0].status).toBe('CHECKED_IN');

    // 4. Duplicate Check-in attempt with the same QR token -> FAILS
    await expect(
      db.query(`
        SELECT public.check_in_buffet_ticket_atomic(
          p_qr_token => $1::TEXT,
          p_staff_user_id => $2::UUID,
          p_branch_id => $3::UUID
        );
      `, [qrToken, TEST_USERS.ADMIN_BRANCH_A.id, TEST_BRANCHES.DERA.id])
    ).rejects.toThrow(/already been checked in/i);

    // 5. Audit Log captured accurately
    const auditLogs = await db.query('SELECT * FROM public.buffet_checkin_logs WHERE booking_id = $1', [bookingRes.rows[0].out_booking_id]);
    expect(auditLogs.rows.length).toBe(1);
    expect(auditLogs.rows[0].checked_in_by_user_id).toBe(TEST_USERS.ADMIN_BRANCH_A.id);
  });

  // ===========================================================================
  // 15. BRANCH MENU ISOLATION WORKS
  // ===========================================================================
  test('15. Branch menu isolation works (price and availability overrides)', async () => {
    // Set custom price and availability for Chicken Shinwari Karahi in Branch B (Jampur)
    await db.query(`
      UPDATE public.branch_menu_items
      SET price = 1950.00, is_available = FALSE
      WHERE branch_id = $1 AND menu_item_id = 'f1000000-0000-0000-0000-000000000001';
    `, [TEST_BRANCHES.JAMPUR.id]);

    // Query Branch A (Dera) menu settings
    const branchAMenu = await db.query(`
      SELECT price, is_available FROM public.branch_menu_items
      WHERE branch_id = $1 AND menu_item_id = 'f1000000-0000-0000-0000-000000000001';
    `, [TEST_BRANCHES.DERA.id]);
    expect(Number(branchAMenu.rows[0].price)).toBe(1800.00);
    expect(branchAMenu.rows[0].is_available).toBe(true);

    // Query Branch B (Jampur) menu settings
    const branchBMenu = await db.query(`
      SELECT price, is_available FROM public.branch_menu_items
      WHERE branch_id = $1 AND menu_item_id = 'f1000000-0000-0000-0000-000000000001';
    `, [TEST_BRANCHES.JAMPUR.id]);
    expect(Number(branchBMenu.rows[0].price)).toBe(1950.00);
    expect(branchBMenu.rows[0].is_available).toBe(false);

    // Customer ordering unavailable item from Branch B gets rejected
    const itemsJson = JSON.stringify([
      {
        menu_item_id: 'f1000000-0000-0000-0000-000000000001',
        quantity: 1,
      },
    ]);
    await expect(
      runAsUser(db, TEST_USERS.CUSTOMER_1, async () => {
        return await db.query(`
          SELECT * FROM public.create_order_atomic(
            p_branch_id => $1::UUID,
            p_customer_name => 'Order Test'::TEXT,
            p_customer_phone => '0300-1111111'::TEXT,
            p_order_type => 'TAKEAWAY'::TEXT,
            p_items => $2::JSONB
          );
        `, [TEST_BRANCHES.JAMPUR.id, itemsJson]);
      })
    ).rejects.toThrow(/currently unavailable at this branch/i);
  });

  // ===========================================================================
  // 16. DELIVERY FEE CANNOT BE MANIPULATED BY CLIENT
  // ===========================================================================
  test('16. Delivery fee cannot be manipulated by client (zone table calculation)', async () => {
    // Zone 2 delivery fee in database is Rs. 120.00
    const zone2Id = 'd1000000-0000-0000-0000-000000000002';
    
    // Order from Zone 2
    const order = await createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id, zone2Id);
    
    const dbOrder = await db.query('SELECT delivery_fee, total_amount, subtotal FROM public.orders WHERE id = $1', [order.out_order_id]);
    
    // Subtotal: 1800.00, Zone 2 Fee: 120.00 -> Total: 1920.00
    expect(Number(dbOrder.rows[0].subtotal)).toBe(1800.00);
    expect(Number(dbOrder.rows[0].delivery_fee)).toBe(120.00);
    expect(Number(dbOrder.rows[0].total_amount)).toBe(1920.00);

    // If client provides nonexistent zone ID -> Fails
    const fakeZoneId = 'd9999999-9999-9999-9999-999999999999';
    await expect(
      createOrder(TEST_USERS.CUSTOMER_1, TEST_BRANCHES.DERA.id, fakeZoneId)
    ).rejects.toThrow(/Selected delivery zone does not exist/i);
  });
});

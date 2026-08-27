import { PGlite } from '@electric-sql/pglite';
import { createTestDatabase, TEST_BRANCHES, TEST_USERS, runAsUser } from './postgres-harness';

describe('Real PostgreSQL Integration: Complete Restaurant Production Workflow', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  test('E2E Complete Production Lifecycle: Customer → PostgreSQL → Kitchen → Rider → Customer Settlement', async () => {
    // =========================================================================
    // STEP 1: CUSTOMER CREATES DELIVERY ORDER (PostgreSQL Atomic RPC)
    // =========================================================================
    const itemsJson = JSON.stringify([
      {
        menu_item_id: 'f1000000-0000-0000-0000-000000000001', // Chicken Shinwari Karahi Full (Rs. 1800)
        quantity: 2,
        notes: 'Extra spicy, less oil',
      },
      {
        menu_item_id: 'f2000000-0000-0000-0000-000000000002', // Special Mutton Biryani (Rs. 650)
        quantity: 1,
        notes: 'With extra raita',
      },
    ]);

    // Subtotal: (1800 * 2) + (650 * 1) = 3600 + 650 = 4250
    // Delivery Fee (Zone 1 Dera Chungi): Rs. 80.00
    // Total Amount: 4250 + 80 = 4330

    const createOrderResult = await runAsUser(db, TEST_USERS.CUSTOMER_1, async () => {
      return await db.query(`
        SELECT * FROM public.create_order_atomic(
          p_branch_id => $1::UUID,
          p_customer_name => 'Zaryab Customer'::TEXT,
          p_customer_phone => '0300-9000001'::TEXT,
          p_order_type => 'DELIVERY'::TEXT,
          p_table_id => NULL::TEXT,
          p_delivery_address => 'House 14, Street 3, Main Model Town, Dera Chungi'::TEXT,
          p_delivery_notes => 'Please call on arrival'::TEXT,
          p_payment_method => 'CASH'::TEXT,
          p_items => $2::JSONB,
          p_delivery_zone_id => 'd1000000-0000-0000-0000-000000000001'::UUID
        );
      `, [TEST_BRANCHES.DERA.id, itemsJson]);
    });

    expect(createOrderResult.rows.length).toBe(1);
    const order = createOrderResult.rows[0];
    const orderId = order.out_order_id;

    expect(orderId).toBeDefined();
    expect(Number(order.out_total_amount)).toBe(4330.00);

    // Verify initial state in Postgres
    const orderInDb = await db.query('SELECT * FROM public.orders WHERE id = $1', [orderId]);
    expect(orderInDb.rows[0].status).toBe('PENDING');
    expect(orderInDb.rows[0].payment_status).toBe('PENDING');
    expect(orderInDb.rows[0].branch_id).toBe(TEST_BRANCHES.DERA.id);
    expect(Number(orderInDb.rows[0].subtotal)).toBe(4250.00);
    expect(Number(orderInDb.rows[0].delivery_fee)).toBe(80.00);

    // Verify order_items stored correctly
    const orderItems = await db.query('SELECT * FROM public.order_items WHERE order_id = $1 ORDER BY unit_price DESC', [orderId]);
    expect(orderItems.rows.length).toBe(2);
    expect(Number(orderItems.rows[0].unit_price)).toBe(1800.00);
    expect(orderItems.rows[0].quantity).toBe(2);

    // =========================================================================
    // STEP 2: REALTIME EVENT BROADCAST CAPTURE (Order Status History & Publication)
    // =========================================================================
    const initialHistory = await db.query('SELECT * FROM public.order_status_history WHERE order_id = $1', [orderId]);
    expect(initialHistory.rows.length).toBe(1);
    expect(initialHistory.rows[0].to_status).toBe('PENDING');

    // =========================================================================
    // STEP 3: KITCHEN WORKFLOW (CONFIRMED → PREPARING → READY)
    // =========================================================================
    // 3.1 Branch Admin confirms the order
    const confirmResult = await runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
      return await db.query(`
        SELECT public.update_order_status_direct(
          p_order_id => $1::UUID,
          p_new_status => 'CONFIRMED'::TEXT,
          p_user_id => $2::UUID,
          p_notes => 'Branch Admin accepted and confirmed order'::TEXT
        ) as success;
      `, [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
    });
    expect(confirmResult.rows[0].success).toBe(true);

    let statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('CONFIRMED');

    // 3.2 Kitchen starts cooking
    const preparingResult = await runAsUser(db, TEST_USERS.KITCHEN_BRANCH_A, async () => {
      return await db.query(`
        SELECT public.update_order_status_direct(
          p_order_id => $1::UUID,
          p_new_status => 'PREPARING'::TEXT,
          p_user_id => $2::UUID,
          p_notes => 'Chef started preparing Karahi and Biryani'::TEXT
        ) as success;
      `, [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
    });
    expect(preparingResult.rows[0].success).toBe(true);

    statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('PREPARING');

    // 3.3 Kitchen marks food READY for dispatch
    const readyResult = await runAsUser(db, TEST_USERS.KITCHEN_BRANCH_A, async () => {
      return await db.query(`
        SELECT public.update_order_status_direct(
          p_order_id => $1::UUID,
          p_new_status => 'READY'::TEXT,
          p_user_id => $2::UUID,
          p_notes => 'Food packed and hot in dispatch area'::TEXT
        ) as success;
      `, [orderId, TEST_USERS.KITCHEN_BRANCH_A.id]);
    });
    expect(readyResult.rows[0].success).toBe(true);

    statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('READY');

    // =========================================================================
    // STEP 4: RIDER CLAIMING & DISPATCH WORKFLOW (ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED)
    // =========================================================================
    // 4.1 Rider claims the delivery order atomically
    const claimResult = await runAsUser(db, TEST_USERS.RIDER_A1, async () => {
      return await db.query(`
        SELECT public.claim_delivery_order(
          p_order_id => $1::UUID,
          p_rider_id => $2::UUID
        ) as success;
      `, [orderId, TEST_USERS.RIDER_A1.id]);
    });
    expect(claimResult.rows[0].success).toBe(true);

    statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('ASSIGNED');

    // Verify rider assignment row
    const riderAssignment = await db.query('SELECT * FROM public.rider_assignments WHERE order_id = $1', [orderId]);
    expect(riderAssignment.rows.length).toBe(1);
    expect(riderAssignment.rows[0].rider_id).toBe(TEST_USERS.RIDER_A1.id);
    expect(riderAssignment.rows[0].status).toBe('ACCEPTED');

    // 4.2 Rider picks up order from branch counter
    const pickedUpResult = await runAsUser(db, TEST_USERS.RIDER_A1, async () => {
      return await db.query(`
        SELECT public.update_order_status_direct(
          p_order_id => $1::UUID,
          p_new_status => 'PICKED_UP'::TEXT,
          p_user_id => $2::UUID,
          p_notes => 'Rider picked up order from counter'::TEXT
        ) as success;
      `, [orderId, TEST_USERS.RIDER_A1.id]);
    });
    expect(pickedUpResult.rows[0].success).toBe(true);

    statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('PICKED_UP');

    // 4.3 Rider marks out for delivery
    const outResult = await runAsUser(db, TEST_USERS.RIDER_A1, async () => {
      return await db.query(`
        SELECT public.update_order_status_direct(
          p_order_id => $1::UUID,
          p_new_status => 'OUT_FOR_DELIVERY'::TEXT,
          p_user_id => $2::UUID,
          p_notes => 'Rider is on the way to customer address'::TEXT
        ) as success;
      `, [orderId, TEST_USERS.RIDER_A1.id]);
    });
    expect(outResult.rows[0].success).toBe(true);

    statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('OUT_FOR_DELIVERY');

    // 4.4 Rider marks order DELIVERED at customer doorstep
    const deliveredResult = await runAsUser(db, TEST_USERS.RIDER_A1, async () => {
      return await db.query(`
        SELECT public.update_order_status_direct(
          p_order_id => $1::UUID,
          p_new_status => 'DELIVERED'::TEXT,
          p_user_id => $2::UUID,
          p_notes => 'Food handed over and payment received'::TEXT
        ) as success;
      `, [orderId, TEST_USERS.RIDER_A1.id]);
    });
    expect(deliveredResult.rows[0].success).toBe(true);

    statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('DELIVERED');

    // =========================================================================
    // STEP 5: FINAL ORDER COMPLETION
    // =========================================================================
    const completedResult = await runAsUser(db, TEST_USERS.ADMIN_BRANCH_A, async () => {
      return await db.query(`
        SELECT public.update_order_status_direct(
          p_order_id => $1::UUID,
          p_new_status => 'COMPLETED'::TEXT,
          p_user_id => $2::UUID,
          p_notes => 'Order completed and settled'::TEXT
        ) as success;
      `, [orderId, TEST_USERS.ADMIN_BRANCH_A.id]);
    });
    expect(completedResult.rows[0].success).toBe(true);

    statusCheck = await db.query('SELECT status FROM public.orders WHERE id = $1', [orderId]);
    expect(statusCheck.rows[0].status).toBe('COMPLETED');

    // Verify complete audit history trail in Postgres
    const fullHistory = await db.query(
      'SELECT from_status, to_status, notes FROM public.order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
      [orderId]
    );
    expect(fullHistory.rows.length).toBe(9);
    expect(fullHistory.rows.map(h => h.to_status)).toEqual([
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'ASSIGNED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
    ]);
  });
});

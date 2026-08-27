import { Order, OrderStatus, OrderType, CartItem, PaymentMethod } from '../types';
import { supabase } from '../supabase/client';
import { BranchService } from './branch-service';

export class OrderService {
  /**
   * Subscribe to live database changes via Supabase Realtime.
   */
  static subscribe(callback: (order: Order) => void): () => void {
    if (!supabase) return () => {};

    const channel = supabase
      .channel('public-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        async (payload) => {
          if (payload.new && (payload.new as any).id) {
            const rawRow = payload.new as any;
            const fullOrder = await this.getOrderById(rawRow.id).catch(() => null);
            if (fullOrder) {
              callback(fullOrder);
            } else {
              callback({
                id: rawRow.id,
                order_number: rawRow.order_number || '',
                tracking_token: rawRow.tracking_token || rawRow.id,
                branch_id: rawRow.branch_id,
                customer_id: rawRow.customer_id || undefined,
                customer_name: rawRow.customer_name || 'Customer',
                customer_phone: rawRow.customer_phone || '',
                order_type: rawRow.order_type || 'DELIVERY',
                table_id: rawRow.table_id || undefined,
                delivery_address: rawRow.delivery_address || undefined,
                delivery_notes: rawRow.delivery_notes || undefined,
                subtotal: Number(rawRow.subtotal || 0),
                delivery_fee: Number(rawRow.delivery_fee || 0),
                total_amount: Number(rawRow.total_amount || 0),
                payment_method: rawRow.payment_method || 'CASH',
                payment_status: rawRow.payment_status || 'PENDING',
                status: rawRow.status || 'PENDING',
                created_at: rawRow.created_at || new Date().toISOString(),
                updated_at: rawRow.updated_at || new Date().toISOString(),
                items: [],
                history: [],
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }

  static getValidTransitions(currentStatus: OrderStatus, orderType: OrderType = 'DELIVERY'): OrderStatus[] {
    switch (currentStatus) {
      case 'PENDING':
        return ['CONFIRMED', 'REJECTED', 'CANCELLED'];
      case 'CONFIRMED':
        return ['PREPARING', 'CANCELLED'];
      case 'PREPARING':
        return ['READY', 'CANCELLED'];
      case 'READY':
        return orderType === 'DELIVERY' ? ['ASSIGNED', 'CANCELLED'] : ['COMPLETED', 'CANCELLED'];
      case 'ASSIGNED':
        return ['PICKED_UP', 'CANCELLED'];
      case 'PICKED_UP':
        return ['OUT_FOR_DELIVERY', 'CANCELLED'];
      case 'OUT_FOR_DELIVERY':
        return ['DELIVERED', 'CANCELLED'];
      case 'DELIVERED':
        return ['COMPLETED'];
      default:
        return [];
    }
  }

  static isValidTransition(from: OrderStatus, to: OrderStatus, orderType: OrderType = 'DELIVERY'): boolean {
    const valid = this.getValidTransitions(from, orderType);
    return valid.includes(to);
  }

  static async createOrder(params: {
    branchId: string;
    customerName: string;
    customerPhone: string;
    orderType: OrderType;
    tableId?: string;
    deliveryZoneId?: string;
    deliveryAddress?: string;
    deliveryNotes?: string;
    items: CartItem[];
    paymentMethod: PaymentMethod;
    customerId?: string;
  }): Promise<Order> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { branchId, customerName, customerPhone, orderType, tableId, deliveryZoneId, deliveryAddress, deliveryNotes, items, paymentMethod } = params;

    if (items.length === 0) {
      throw new Error('Cannot create an order with an empty cart.');
    }

    if (orderType === 'DELIVERY') {
      const isDeliveryAllowed = await BranchService.isDeliveryAllowed(branchId);
      if (!isDeliveryAllowed) {
        throw new Error('Delivery service is currently disabled for this branch.');
      }
    }

    const itemsPayload = items.map((i) => ({
      menu_item_id: i.menuItem.id,
      variant_id: i.variant?.id || null,
      quantity: i.quantity,
      special_instructions: i.specialInstructions || null,
    }));

    const { data, error } = await supabase.rpc('create_order_atomic', {
      p_branch_id: branchId,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_order_type: orderType,
      p_table_id: tableId || null,
      p_delivery_address: deliveryAddress || null,
      p_delivery_notes: deliveryNotes || null,
      p_payment_method: paymentMethod,
      p_items: itemsPayload,
      p_delivery_zone_id: deliveryZoneId || null,
    });

    if (error) {
      throw new Error(`Order placement failed: ${error.message}`);
    }

    const createdRecord = Array.isArray(data) ? data[0] : data;

    const orderId = createdRecord?.out_order_id || createdRecord?.order_id || createdRecord?.id;
    if (!orderId) {
      throw new Error('Order creation failed to return order details.');
    }

    const orderNumber = createdRecord.out_order_number || createdRecord.order_number || `OK-${Date.now()}`;
    const trackingToken = createdRecord.out_tracking_token || createdRecord.tracking_token || orderId;
    const totalAmount = Number(createdRecord.out_total_amount || createdRecord.total_amount || 0);

    // Try to fetch the full order (works for authenticated staff / owner)
    const fullOrder = await this.getOrderById(orderId).catch(() => null);

    if (fullOrder) {
      return fullOrder;
    }

    // Build order from RPC response + original params (for anonymous / customer users blocked by RLS)
    return {
      id: orderId,
      order_number: orderNumber,
      tracking_token: trackingToken,
      branch_id: branchId,
      customer_name: customerName,
      customer_phone: customerPhone,
      order_type: orderType,
      table_id: tableId || undefined,
      delivery_zone_id: deliveryZoneId || undefined,
      delivery_address: deliveryAddress || undefined,
      delivery_notes: deliveryNotes || undefined,
      subtotal: totalAmount,
      delivery_fee: 0,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_status: 'PENDING',
      status: 'PENDING' as OrderStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items.map((i, idx) => ({
        id: `item-${idx}`,
        order_id: orderId,
        menu_item_id: i.menuItem.id,
        variant_id: i.variant?.id || undefined,
        item_name: i.menuItem.name,
        variant_name: i.variant?.name || undefined,
        unit_price: Number(i.variant?.price || i.menuItem.base_price || 0),
        quantity: i.quantity,
        subtotal_price: Number(i.variant?.price || i.menuItem.base_price || 0) * i.quantity,
        special_instructions: i.specialInstructions || undefined,
      })),
      history: [],
    };
  }

  static async getOrders(filter?: { branchId?: string; status?: OrderStatus; riderId?: string; customerPhone?: string }): Promise<Order[]> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    // 1. Try get_branch_orders RPC (Security Definer, reliable for staff portals)
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_branch_orders', {
        p_branch_id: filter?.branchId && filter.branchId !== 'all' ? filter.branchId : null,
        p_status: filter?.status || null,
      });

      if (!rpcErr && rpcData && Array.isArray(rpcData)) {
        let results = rpcData.map((row: any) => this.mapRpcOrderRow(row));
        if (filter?.customerPhone) {
          results = results.filter((o) => o.customer_phone === filter.customerPhone);
        }
        if (filter?.riderId) {
          results = results.filter((o) => o.rider_assignment?.rider_id === filter.riderId);
        }
        return results;
      }
    } catch {}

    let query = supabase
      .from('orders')
      .select('*, items:order_items(*), history:order_status_history(*), rider_assignment:rider_assignments(*)')
      .order('created_at', { ascending: false });

    if (filter?.branchId && filter.branchId !== 'all') {
      query = query.eq('branch_id', filter.branchId);
    }
    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    if (filter?.customerPhone) {
      query = query.eq('customer_phone', filter.customerPhone);
    }
    if (filter?.riderId) {
      query = query.eq('rider_assignments.rider_id', filter.riderId);
    }

    let { data, error } = await query;

    if (error) {
      // Fallback: try simpler query without joins (may fail due to RLS on related tables)
      let fallbackQuery = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter?.branchId && filter.branchId !== 'all') fallbackQuery = fallbackQuery.eq('branch_id', filter.branchId);
      if (filter?.status) fallbackQuery = fallbackQuery.eq('status', filter.status);
      if (filter?.customerPhone) fallbackQuery = fallbackQuery.eq('customer_phone', filter.customerPhone);

      const fallbackResult = await fallbackQuery;
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error || !data) {
      return [];
    }

    return (data || []).map((o: any) => {
      const rawAssignment = Array.isArray(o.rider_assignment) ? o.rider_assignment[0] : o.rider_assignment;
      return {
        id: o.id,
        order_number: o.order_number,
        tracking_token: o.tracking_token,
        branch_id: o.branch_id,
        customer_id: o.customer_id || undefined,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        order_type: o.order_type,
        table_id: o.table_id || undefined,
        delivery_address: o.delivery_address || undefined,
        delivery_notes: o.delivery_notes || undefined,
        subtotal: Number(o.subtotal),
        delivery_fee: Number(o.delivery_fee || 0),
        total_amount: Number(o.total_amount),
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        status: o.status,
        created_at: o.created_at,
        updated_at: o.updated_at,
        items: (o.items || []).map((i: any) => ({
          id: i.id,
          order_id: i.order_id,
          menu_item_id: i.menu_item_id,
          variant_id: i.variant_id || undefined,
          item_name: i.item_name,
          variant_name: i.variant_name || undefined,
          unit_price: Number(i.unit_price),
          quantity: i.quantity,
          subtotal_price: Number(i.subtotal_price),
          special_instructions: i.special_instructions || undefined,
        })),
        history: (o.history || []).map((h: any) => ({
          id: h.id,
          order_id: h.order_id,
          from_status: h.from_status || undefined,
          to_status: h.to_status,
          changed_by_user_id: h.changed_by_user_id || undefined,
          notes: h.notes || undefined,
          created_at: h.created_at,
        })),
        rider_assignment: rawAssignment
          ? {
              rider_id: rawAssignment.rider_id,
              rider_name: 'Rider',
              assigned_at: rawAssignment.assigned_at,
            }
          : undefined,
      };
    });
  }

  static async getOrderById(id: string): Promise<Order | null> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // 1. Try public RPC resolver (handles tracking tokens, order ids, order numbers)
    try {
      const { data: identData } = await supabase.rpc('get_order_by_identifier', { p_identifier: id });
      if (identData && identData.length > 0) {
        return this.mapRpcOrderRow(identData[0]);
      }
    } catch {}

    // 2. Try tracking token RPC if it's a UUID
    if (isUuid) {
      const rpcOrder = await this.getOrderByTrackingToken(id).catch(() => null);
      if (rpcOrder) return rpcOrder;
    }

    // 3. Direct table query for authenticated staff / admin users
    let query = supabase
      .from('orders')
      .select('*, items:order_items(*), history:order_status_history(*), rider_assignment:rider_assignments(*)');

    if (isUuid) {
      query = query.or(`id.eq.${id},tracking_token.eq.${id}`);
    } else {
      query = query.eq('order_number', id);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) return null;

    const rawAssignment = Array.isArray(data.rider_assignment) ? data.rider_assignment[0] : data.rider_assignment;

    return {
      id: data.id,
      order_number: data.order_number,
      tracking_token: data.tracking_token,
      branch_id: data.branch_id,
      customer_id: data.customer_id || undefined,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      order_type: data.order_type,
      table_id: data.table_id || undefined,
      delivery_address: data.delivery_address || undefined,
      delivery_notes: data.delivery_notes || undefined,
      subtotal: Number(data.subtotal),
      delivery_fee: Number(data.delivery_fee || 0),
      total_amount: Number(data.total_amount),
      payment_method: data.payment_method,
      payment_status: data.payment_status,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
      items: (data.items || []).map((i: any) => ({
        id: i.id,
        order_id: i.order_id,
        menu_item_id: i.menu_item_id,
        variant_id: i.variant_id || undefined,
        item_name: i.item_name,
        variant_name: i.variant_name || undefined,
        unit_price: Number(i.unit_price),
        quantity: i.quantity,
        subtotal_price: Number(i.subtotal_price),
        special_instructions: i.special_instructions || undefined,
      })),
      history: (data.history || []).map((h: any) => ({
        id: h.id,
        order_id: h.order_id,
        from_status: h.from_status || undefined,
        to_status: h.to_status,
        changed_by_user_id: h.changed_by_user_id || undefined,
        notes: h.notes || undefined,
        created_at: h.created_at,
      })),
      rider_assignment: rawAssignment
        ? {
            rider_id: rawAssignment.rider_id,
            rider_name: 'Rider',
            assigned_at: rawAssignment.assigned_at,
          }
        : undefined,
    };
  }

  private static mapRpcOrderRow(row: any): Order {
    const rawAssignment = row.rider_assignment || row.rider_info;
    return {
      id: row.order_id || row.id,
      order_number: row.order_number,
      tracking_token: row.tracking_token,
      branch_id: row.branch_id,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      order_type: row.order_type,
      table_id: row.table_id || undefined,
      delivery_address: row.delivery_address || undefined,
      delivery_notes: row.delivery_notes || undefined,
      subtotal: Number(row.subtotal),
      delivery_fee: Number(row.delivery_fee || 0),
      total_amount: Number(row.total_amount),
      payment_method: row.payment_method,
      payment_status: row.payment_status,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at,
      items: (row.items || []).map((i: any) => ({
        id: i.id,
        order_id: i.order_id || row.order_id || row.id,
        menu_item_id: i.menu_item_id,
        variant_id: i.variant_id || undefined,
        item_name: i.item_name,
        variant_name: i.variant_name || undefined,
        unit_price: Number(i.unit_price),
        quantity: i.quantity,
        subtotal_price: Number(i.subtotal_price),
        special_instructions: i.special_instructions || undefined,
      })),
      history: (row.history || []).map((h: any) => ({
        id: h.id,
        order_id: h.order_id || row.order_id || row.id,
        from_status: h.from_status || undefined,
        to_status: h.to_status,
        notes: h.notes || undefined,
        created_at: h.created_at,
      })),
      rider_assignment: rawAssignment
        ? {
            rider_id: rawAssignment.rider_id,
            rider_name: rawAssignment.rider_name || 'Rider',
            assigned_at: rawAssignment.assigned_at,
          }
        : undefined,
    };
  }

  static async getOrderByTrackingToken(trackingToken: string): Promise<Order | null> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trackingToken);
    
    // 1. Try get_order_by_identifier
    try {
      const { data: identData } = await supabase.rpc('get_order_by_identifier', { p_identifier: trackingToken });
      if (identData && identData.length > 0) {
        return this.mapRpcOrderRow(identData[0]);
      }
    } catch {}

    // 2. Try get_order_by_tracking_token if UUID
    if (isUuid) {
      const { data, error } = await supabase.rpc('get_order_by_tracking_token', {
        p_tracking_token: trackingToken,
      });

      if (!error && data && data.length > 0) {
        return this.mapRpcOrderRow(data[0]);
      }
    }

    return null;
  }

  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    userId?: string,
    notes?: string
  ): Promise<Order> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    // 1. Direct status update RPC enforcing PostgreSQL finite state machine rules
    const { data, error } = await supabase.rpc('update_order_status_direct', {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_user_id: userId || null,
      p_notes: notes || null,
    });

    if (error) {
      throw new Error(`Order status update rejected: ${error.message}`);
    }

    const updated = await this.getOrderById(orderId).catch(() => null);
    if (updated) {
      return updated;
    }

    // Return minimal order object when RLS blocks read-back
    return {
      id: orderId,
      order_number: '',
      tracking_token: '',
      branch_id: '',
      customer_name: '',
      customer_phone: '',
      order_type: 'DELIVERY' as OrderType,
      subtotal: 0,
      delivery_fee: 0,
      total_amount: 0,
      payment_method: 'CASH' as PaymentMethod,
      payment_status: 'PENDING',
      status: newStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [],
      history: [],
    };
  }

  static async batchUpdateOrderStatus(
    orderIds: string[],
    newStatus: OrderStatus,
    userId?: string,
    notes?: string
  ): Promise<number> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    try {
      const { data, error } = await supabase.rpc('batch_update_order_status', {
        p_order_ids: orderIds,
        p_new_status: newStatus,
        p_user_id: userId || null,
        p_notes: notes || `Batch update to ${newStatus}`,
      });
      if (!error && typeof data === 'number') {
        return data;
      }
    } catch {}

    // Parallel fallback
    await Promise.all(
      orderIds.map((id) => this.updateOrderStatus(id, newStatus, userId, notes))
    );
    return orderIds.length;
  }

  static async claimOrderForRider(orderId: string, riderId?: string, riderName?: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.rpc('claim_delivery_order', {
      p_order_id: orderId,
      p_rider_id: riderId || null,
    });

    if (error) {
      throw new Error(`Order claim rejected: ${error.message}`);
    }

    return Boolean(data);
  }
}


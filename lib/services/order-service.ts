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
            const fullOrder = await this.getOrderById((payload.new as any).id).catch(() => null);
            if (fullOrder) {
              callback(fullOrder);
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
    deliveryAddress?: string;
    deliveryNotes?: string;
    items: CartItem[];
    paymentMethod: PaymentMethod;
    customerId?: string;
  }): Promise<Order> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { branchId, customerName, customerPhone, orderType, tableId, deliveryAddress, deliveryNotes, items, paymentMethod } = params;

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
    });

    if (error) {
      throw new Error(`Order placement failed: ${error.message}`);
    }

    const createdRecord = Array.isArray(data) ? data[0] : data;

    if (!createdRecord || !createdRecord.out_order_id) {
      throw new Error('Order creation failed to return order details.');
    }

    const orderId = createdRecord.out_order_id;

    // Try to fetch the full order (works for authenticated staff / owner)
    const fullOrder = await this.getOrderById(orderId).catch(() => null);

    if (fullOrder) {
      return fullOrder;
    }

    // Build order from RPC response + original params (for anonymous / customer users blocked by RLS)
    const totalAmount = Number(createdRecord.out_total_amount || 0);
    return {
      id: orderId,
      order_number: createdRecord.out_order_number || `OK-${Date.now()}`,
      tracking_token: createdRecord.out_tracking_token || orderId,
      branch_id: branchId,
      customer_name: customerName,
      customer_phone: customerPhone,
      order_type: orderType,
      table_id: tableId || undefined,
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

    let query = supabase
      .from('orders')
      .select('*, items:order_items(*), history:order_status_history(*), rider_assignment:rider_assignments(*)')
      .order('created_at', { ascending: false });

    if (filter?.branchId) {
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

      if (filter?.branchId) fallbackQuery = fallbackQuery.eq('branch_id', filter.branchId);
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

  static async getOrderByTrackingToken(trackingToken: string): Promise<Order | null> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trackingToken);
    if (!isUuid) return null;

    const { data, error } = await supabase.rpc('get_order_by_tracking_token', {
      p_tracking_token: trackingToken,
    });

    if (error || !data || data.length === 0) return null;

    const row = data[0];

    return {
      id: row.order_id,
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
      updated_at: row.created_at,
      items: (row.items || []).map((i: any) => ({
        id: i.id,
        order_id: row.order_id,
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
        order_id: row.order_id,
        from_status: h.from_status || undefined,
        to_status: h.to_status,
        notes: h.notes || undefined,
        created_at: h.created_at,
      })),
      rider_assignment: row.rider_info
        ? {
            rider_id: row.rider_info.rider_id,
            rider_name: row.rider_info.rider_name || 'Rider',
            assigned_at: row.rider_info.assigned_at,
          }
        : undefined,
    };
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

    const { error: rpcError } = await supabase.rpc('update_order_status_secure', {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_notes: notes || null,
    });

    if (rpcError) {
      // Fallback direct table update if RPC rejected due to unapplied migration
      const { error: directError } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (!directError) {
        try {
          await supabase.from('order_status_history').insert({
            order_id: orderId,
            to_status: newStatus,
            notes: notes || `Order marked ${newStatus}`,
          });
        } catch {}
      }
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

  static async claimOrderForRider(orderId: string, riderId: string, riderName?: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.rpc('claim_delivery_order', {
      p_order_id: orderId,
      p_rider_id: riderId,
    });

    if (error || !data) {
      // Direct table fallback
      const { error: assignError } = await supabase
        .from('rider_assignments')
        .insert({ order_id: orderId, rider_id: riderId, status: 'ACCEPTED' });

      await supabase
        .from('orders')
        .update({ status: 'ASSIGNED', updated_at: new Date().toISOString() })
        .eq('id', orderId);
    }

    return true;
  }
}


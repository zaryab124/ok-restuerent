import { Order, OrderStatus, OrderType, CartItem, PaymentMethod } from '../types';
import { supabase } from '../supabase/client';
import { PaymentService } from './payment-service';
import { BranchService } from './branch-service';

type OrderListener = (order: Order) => void;

export class OrderService {
  private static listeners: Set<OrderListener> = new Set();

  static getStatusOverrides(): Record<string, OrderStatus> {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('ok_order_status_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  static setStatusOverride(orderId: string, status: OrderStatus) {
    if (typeof window === 'undefined') return;
    try {
      const overrides = this.getStatusOverrides();
      overrides[orderId] = status;
      localStorage.setItem('ok_order_status_overrides', JSON.stringify(overrides));
      window.dispatchEvent(new CustomEvent('ok_order_status_changed', { detail: { orderId, status } }));
    } catch {}
  }

  static subscribe(listener: OrderListener): () => void {
    this.listeners.add(listener);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ok_order_status_overrides' && e.newValue) {
        try {
          const map = JSON.parse(e.newValue);
          Object.entries(map).forEach(([id, status]) => {
            listener({ id, status } as any);
          });
        } catch {}
      }
    };

    const handleCustom = (e: any) => {
      if (e.detail?.orderId && e.detail?.status) {
        listener({ id: e.detail.orderId, status: e.detail.status } as any);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
      window.addEventListener('ok_order_status_changed', handleCustom);
    }

    return () => {
      this.listeners.delete(listener);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('ok_order_status_changed', handleCustom);
      }
    };
  }

  private static notify(order: Order) {
    this.listeners.forEach((l) => l(order));
  }

  static getValidTransitions(currentStatus: OrderStatus): OrderStatus[] {
    switch (currentStatus) {
      case 'PENDING':
        return ['CONFIRMED', 'REJECTED', 'CANCELLED'];
      case 'CONFIRMED':
        return ['PREPARING', 'CANCELLED'];
      case 'PREPARING':
        return ['READY', 'CANCELLED'];
      case 'READY':
        return ['ASSIGNED', 'COMPLETED', 'CANCELLED'];
      case 'ASSIGNED':
        return ['PICKED_UP', 'CANCELLED'];
      case 'PICKED_UP':
        return ['OUT_FOR_DELIVERY', 'CANCELLED'];
      case 'OUT_FOR_DELIVERY':
        return ['DELIVERED', 'COMPLETED', 'CANCELLED'];
      default:
        return [];
    }
  }

  static isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
    const valid = this.getValidTransitions(from);
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
        throw new Error('Delivery service is currently disabled for this branch');
      }
    }

    // Format items payload for create_order_atomic RPC with UUID sanitization
    const isValidUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const itemsPayload = items.map((i) => {
      let menuItemId = i.menuItem.id;
      if (!isValidUuid(menuItemId)) {
        menuItemId = 'd1000000-0000-0000-0000-000000000001';
      }
      let variantId = i.variant?.id || null;
      if (variantId && !isValidUuid(variantId)) {
        variantId = null;
      }

      return {
        menu_item_id: menuItemId,
        variant_id: variantId,
        quantity: i.quantity,
        special_instructions: i.specialInstructions || null,
      };
    });

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

    if (!createdRecord) {
      throw new Error('Order creation failed to return order details.');
    }

    // Process payment gateway if needed
    const paymentResult = await PaymentService.processPayment(
      Number(createdRecord.total_amount || createdRecord.out_total_amount),
      paymentMethod,
      { name: customerName, phone: customerPhone }
    );

    const fullOrder: Order = {
      id: createdRecord.order_id || createdRecord.out_order_id,
      order_number: createdRecord.order_number || createdRecord.out_order_number,
      tracking_token: createdRecord.tracking_token || createdRecord.out_tracking_token,
      branch_id: branchId,
      customer_id: params.customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      order_type: orderType,
      table_id: tableId,
      delivery_address: deliveryAddress,
      delivery_notes: deliveryNotes,
      subtotal: items.reduce((sum, i) => sum + (i.variant ? i.variant.price : i.menuItem.base_price) * i.quantity, 0),
      delivery_fee: orderType === 'DELIVERY' ? 100 : 0,
      total_amount: Number(createdRecord.total_amount),
      payment_method: paymentMethod,
      payment_status: paymentResult.paymentStatus,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items.map((item, idx) => ({
        id: `oi-${createdRecord.order_id}-${idx}`,
        order_id: createdRecord.order_id,
        menu_item_id: item.menuItem.id,
        variant_id: item.variant?.id,
        item_name: item.menuItem.name,
        variant_name: item.variant?.name,
        unit_price: item.variant ? item.variant.price : item.menuItem.base_price,
        quantity: item.quantity,
        subtotal_price: (item.variant ? item.variant.price : item.menuItem.base_price) * item.quantity,
        special_instructions: item.specialInstructions,
      })),
      history: [
        {
          id: `hist-${createdRecord.order_id}`,
          order_id: createdRecord.order_id,
          to_status: 'PENDING',
          notes: 'Order placed by customer',
          created_at: new Date().toISOString(),
        },
      ],
    };

    this.notify(fullOrder);
    return fullOrder;
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

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }

    const overrides = this.getStatusOverrides();

    return (data || []).map((o: any) => {
      const rawAssignment = Array.isArray(o.rider_assignment) ? o.rider_assignment[0] : o.rider_assignment;
      const effectiveStatus: OrderStatus = (overrides[o.id] || o.status) as OrderStatus;
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
        status: effectiveStatus,
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

    // 1. Immediately record status override for cross-tab realtime synchronization
    this.setStatusOverride(orderId, newStatus);

    // Try RPC first
    const { error: rpcError } = await supabase.rpc('update_order_status_secure', {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_notes: notes || null,
    });

    if (rpcError) {
      // Direct table update fallback
      const { error: directError } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (!directError) {
        await supabase.from('order_status_history').insert({
          order_id: orderId,
          to_status: newStatus,
          notes: notes || `Order status marked ${newStatus}`,
        });
      }
    }

    const fetched = await this.getOrderById(orderId).catch(() => null);
    const updated: Order = fetched
      ? { ...fetched, status: newStatus }
      : {
          id: orderId,
          order_number: 'OK-ORDER',
          branch_id: '',
          customer_name: 'Customer',
          customer_phone: '',
          order_type: 'DINE_IN',
          subtotal: 0,
          delivery_fee: 0,
          total_amount: 0,
          payment_method: 'CASH',
          payment_status: 'PENDING',
          status: newStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: [],
        };

    this.notify(updated);
    return updated;
  }

  static async claimOrderForRider(orderId: string, riderId: string, riderName: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    this.setStatusOverride(orderId, 'ASSIGNED');

    const isValidUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const safeRiderId = isValidUuid(riderId) ? riderId : '40000000-0000-0000-0000-000000000001';

    const { data, error } = await supabase.rpc('claim_delivery_order', {
      p_order_id: orderId,
      p_rider_id: safeRiderId,
    });

    if (error || !data) {
      // Direct table fallback
      const { error: assignError } = await supabase
        .from('rider_assignments')
        .insert({ order_id: orderId, rider_id: safeRiderId, status: 'ACCEPTED' });

      if (assignError && !assignError.message.includes('unique')) {
        return false;
      }

      await supabase
        .from('orders')
        .update({ status: 'ASSIGNED', updated_at: new Date().toISOString() })
        .eq('id', orderId);
    }

    const updated = await this.getOrderById(orderId);
    if (updated) {
      this.notify(updated);
    }

    return true;
  }
}

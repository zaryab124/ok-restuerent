import { Order, OrderStatus, OrderType, CartItem, PaymentMethod } from '../types';
import { INITIAL_ORDERS } from '../supabase/mock-db';
import { BranchService } from './branch-service';
import { PaymentService } from './payment-service';

type OrderListener = (order: Order) => void;

export class OrderService {
  private static listeners: Set<OrderListener> = new Set();
  private static inMemoryOrders: Order[] = [...INITIAL_ORDERS];

  private static getStoredOrders(): Order[] {
    if (typeof window === 'undefined') return this.inMemoryOrders;
    const stored = localStorage.getItem('ok_orders_history');
    if (!stored) {
      localStorage.setItem('ok_orders_history', JSON.stringify(this.inMemoryOrders));
      return this.inMemoryOrders;
    }
    try {
      const parsed = JSON.parse(stored);
      this.inMemoryOrders = parsed;
      return parsed;
    } catch {
      return this.inMemoryOrders;
    }
  }

  private static saveStoredOrders(orders: Order[]): void {
    this.inMemoryOrders = orders;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ok_orders_history', JSON.stringify(orders));
    }
  }

  static subscribe(listener: OrderListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
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
    const { branchId, customerName, customerPhone, orderType, tableId, deliveryAddress, deliveryNotes, items, paymentMethod, customerId } = params;

    if (items.length === 0) {
      throw new Error('Cannot create an order with an empty cart.');
    }

    if (orderType === 'DELIVERY') {
      const deliveryAllowed = BranchService.isDeliveryAllowed(branchId);
      if (!deliveryAllowed) {
        throw new Error('Delivery is currently unavailable at this branch. Please select takeaway or dining in.');
      }
      if (!deliveryAddress || deliveryAddress.trim() === '') {
        throw new Error('Delivery address is required for delivery orders.');
      }
    }

    if (orderType === 'DINE_IN' && !tableId) {
      throw new Error('Table number is required for Dine-In orders.');
    }

    const subtotal = items.reduce((sum, item) => {
      const unitPrice = item.variant ? item.variant.price : item.menuItem.base_price;
      return sum + unitPrice * item.quantity;
    }, 0);

    const deliveryFee = orderType === 'DELIVERY' ? 100 : 0;
    const totalAmount = subtotal + deliveryFee;

    const paymentResult = await PaymentService.processPayment(totalAmount, paymentMethod, {
      name: customerName,
      phone: customerPhone,
    });

    const orderNumber = `OK-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrderId = `ord-${Date.now()}`;

    const newOrder: Order = {
      id: newOrderId,
      order_number: orderNumber,
      branch_id: branchId,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      order_type: orderType,
      table_id: tableId,
      delivery_address: deliveryAddress,
      delivery_notes: deliveryNotes,
      subtotal,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_status: paymentResult.paymentStatus,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items.map((item, idx) => ({
        id: `oi-${Date.now()}-${idx}`,
        order_id: newOrderId,
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
          id: `hist-${Date.now()}`,
          order_id: newOrderId,
          to_status: 'PENDING',
          notes: 'Order placed by customer',
          created_at: new Date().toISOString(),
        },
      ],
    };

    const orders = this.getStoredOrders();
    orders.unshift(newOrder);
    this.saveStoredOrders(orders);

    this.notify(newOrder);
    return newOrder;
  }

  static async getOrders(filter?: { branchId?: string; status?: OrderStatus; riderId?: string; customerPhone?: string }): Promise<Order[]> {
    let result = this.getStoredOrders();
    if (filter?.branchId) {
      result = result.filter((o) => o.branch_id === filter.branchId);
    }
    if (filter?.status) {
      result = result.filter((o) => o.status === filter.status);
    }
    if (filter?.riderId) {
      result = result.filter((o) => o.rider_assignment?.rider_id === filter.riderId);
    }
    if (filter?.customerPhone) {
      result = result.filter((o) => o.customer_phone === filter.customerPhone);
    }
    return result;
  }

  static async getOrderById(id: string): Promise<Order | null> {
    const orders = this.getStoredOrders();
    const o = orders.find((o) => o.id === id || o.order_number === id);
    return o || null;
  }

  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    userId?: string,
    notes?: string
  ): Promise<Order> {
    const orders = this.getStoredOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (!this.isValidTransition(order.status, newStatus)) {
      throw new Error(`Invalid status transition from ${order.status} to ${newStatus}`);
    }

    const prevStatus = order.status;
    order.status = newStatus;
    order.updated_at = new Date().toISOString();

    if (!order.history) order.history = [];
    order.history.push({
      id: `hist-${Date.now()}`,
      order_id: orderId,
      from_status: prevStatus,
      to_status: newStatus,
      changed_by_user_id: userId,
      notes: notes || `Status updated to ${newStatus}`,
      created_at: new Date().toISOString(),
    });

    this.saveStoredOrders(orders);
    this.notify(order);
    return order;
  }

  static async claimOrderForRider(orderId: string, riderId: string, riderName: string): Promise<boolean> {
    const orders = this.getStoredOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return false;

    if (order.status !== 'READY' || order.rider_assignment) {
      return false;
    }

    order.rider_assignment = {
      rider_id: riderId,
      rider_name: riderName,
      assigned_at: new Date().toISOString(),
    };

    this.saveStoredOrders(orders);
    await this.updateOrderStatus(orderId, 'ASSIGNED', riderId, `Claimed by rider ${riderName}`);
    return true;
  }
}

import {
  getOrders,
  getOrderById,
  createOrderSecure,
  updateOrderStatus,
  assignCourierToOrder,
} from './storage';
import {
  Order,
  OrderStatus,
  CartItem,
  FulfillmentType,
  PaymentMethod,
  OrderAddressSnapshot,
} from '../types';

export const orderService = {
  async getAllOrders(): Promise<Order[]> {
    return getOrders();
  },

  async getOrderById(id: string): Promise<Order | undefined> {
    return getOrderById(id);
  },

  async getCustomerOrders(customerId: string): Promise<Order[]> {
    return getOrders().filter((o) => o.customer_id === customerId);
  },

  async getKitchenOrders(): Promise<Order[]> {
    const activeStatuses: OrderStatus[] = [
      'CONFIRMADO',
      'EM_PREPARACAO',
      'PRONTO',
      'AGUARDANDO_RETIRADA',
    ];
    return getOrders().filter((o) => activeStatuses.includes(o.status));
  },

  async getCourierOrders(courierId: string): Promise<Order[]> {
    return getOrders().filter(
      (o) => o.assigned_courier_id === courierId
    );
  },

  async createOrder(params: {
    customer_name: string;
    customer_phone: string;
    customer_id?: string;
    fulfillment_type: FulfillmentType;
    delivery_address?: OrderAddressSnapshot;
    items: CartItem[];
    customer_notes?: string;
    payment_method: PaymentMethod;
    coupon_code?: string;
    cash_change_for_cents?: number;
  }): Promise<{ success: boolean; order?: Order; error?: string }> {
    return createOrderSecure(params);
  },

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorRole: 'CUSTOMER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY',
    actorName: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    return updateOrderStatus(orderId, newStatus, actorRole, actorName, reason);
  },

  async assignCourier(
    orderId: string,
    courierId: string,
    assignedByName: string
  ): Promise<{ success: boolean; error?: string }> {
    return assignCourierToOrder(orderId, courierId, assignedByName);
  },
};

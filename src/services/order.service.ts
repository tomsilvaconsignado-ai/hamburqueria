import {
  getOrders,
  getOrderById,
  createOrderSecure,
  updateOrderStatus,
  assignCourierToOrder,
} from './storage';
import type { CreateOrderParams, Result } from './remote';
import { Order, OrderStatus, UserRole } from '../types';

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
    const activeStatuses: OrderStatus[] = ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO', 'AGUARDANDO_RETIRADA'];
    return getOrders().filter((o) => activeStatuses.includes(o.status));
  },

  async getCourierOrders(courierId: string): Promise<Order[]> {
    return getOrders().filter((o) => o.assigned_courier_id === courierId);
  },

  createOrder(params: CreateOrderParams): Promise<{ success: boolean; order?: Order; error?: string }> {
    return createOrderSecure(params);
  },

  updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorRole: UserRole,
    actorName: string,
    reason?: string
  ): Promise<Result> {
    return updateOrderStatus(orderId, newStatus, actorRole, actorName, reason);
  },

  assignCourier(orderId: string, courierId: string, assignedByName: string): Promise<Result> {
    return assignCourierToOrder(orderId, courierId, assignedByName);
  },
};

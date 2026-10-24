import {
  getDeliveryZones,
  calculateDeliveryFee,
  updateCourierDeliveryStatus,
  getCouriers,
} from './storage';
import type { Result } from './remote';
import { Courier, DeliveryZone } from '../types';

export const deliveryService = {
  getZones(): DeliveryZone[] {
    return getDeliveryZones();
  },

  calculateFee(neighborhood: string) {
    return calculateDeliveryFee(neighborhood);
  },

  getActiveCouriers(): Courier[] {
    return getCouriers().filter((c) => c.status === 'ATIVO');
  },

  updateDelivery(
    orderId: string,
    courierId: string,
    action: 'PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
    paymentCollected?: boolean
  ): Promise<Result> {
    return updateCourierDeliveryStatus(orderId, courierId, action, paymentCollected);
  },
};

import {
  getDeliveryZones,
  calculateDeliveryFee,
  updateCourierDeliveryStatus,
  getProfiles,
} from './storage';
import { DeliveryZone, UserProfile } from '../types';

export const deliveryService = {
  getZones(): DeliveryZone[] {
    return getDeliveryZones();
  },

  calculateFee(neighborhood: string) {
    return calculateDeliveryFee(neighborhood);
  },

  getActiveCouriers(): UserProfile[] {
    return getProfiles().filter((p) => p.role === 'DELIVERY' && p.is_active);
  },

  updateDelivery(
    orderId: string,
    courierId: string,
    action: 'PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
    paymentCollected?: boolean
  ) {
    return updateCourierDeliveryStatus(orderId, courierId, action, paymentCollected);
  },
};

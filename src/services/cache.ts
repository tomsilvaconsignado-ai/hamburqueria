import { isSupabaseConfigured } from '../lib/supabase/client';

/**
 * Estado compartilhado da aplicação.
 *
 * - Modo demonstração (sem Supabase): persistido no localStorage deste navegador e
 *   sincronizado entre abas pelo evento `storage`.
 * - Modo Supabase: cache em memória, hidratado do banco e atualizado pelo Realtime
 *   (ver remote.ts). Nada de pedidos/catálogo é gravado no navegador.
 */
export const IS_DEMO_MODE = !isSupabaseConfigured;

export const KEYS = {
  CATEGORIES: 'bh_categories_v1',
  PRODUCTS: 'bh_products_v1',
  ORDERS: 'bh_orders_v1',
  ZONES: 'bh_zones_v1',
  SETTINGS: 'bh_settings_v1',
  PROFILES: 'bh_profiles_v1',
  COURIERS: 'bh_couriers_v1',
  DELIVERIES: 'bh_deliveries_v1',
  HISTORY: 'bh_history_v1',
  NOTIFICATIONS: 'bh_notifications_v1',
  AUDIT: 'bh_audit_v1',
  ACTIVE_PROFILE: 'bh_active_profile_v1',
};

type Listener = () => void;
const listeners: Set<Listener> = new Set();
const memory = new Map<string, unknown>();

export function subscribeToRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyRealtime() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Realtime listener error:', e);
    }
  });
}

export function getItem<T>(key: string, defaultValue: T): T {
  if (!IS_DEMO_MODE) {
    return memory.has(key) ? (memory.get(key) as T) : defaultValue;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export function setItem<T>(key: string, value: T, notify = true): void {
  if (!IS_DEMO_MODE) {
    memory.set(key, value);
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage write error:', e);
    }
  }
  if (notify) notifyRealtime();
}

// Sincronização entre abas do mesmo navegador no modo demonstração
if (IS_DEMO_MODE && typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key && event.key.startsWith('bh_')) notifyRealtime();
  });
}

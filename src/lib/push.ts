// Notificações push no celular da equipe (admin, cozinha, entregador).
// O aparelho se inscreve aqui; quem envia é o servidor (trigger no banco → função send-push).
import { supabase } from './supabase/client';
import { BASE_PATH } from './appUrl';

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export type PushState =
  | 'unsupported' // navegador sem push (ou site sem a chave configurada)
  | 'ios-install' // iPhone: precisa "Adicionar à Tela de Início" antes
  | 'denied' // pessoa bloqueou as notificações
  | 'off'
  | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * Registra o service worker (uma vez, ao abrir o app). Com o app aberto, o som da loja é tocado
 * pelas próprias telas (admin, cozinha, entregador) ao ver o pedido chegar pelo Realtime.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch((e) => {
    console.warn('Service worker não registrado:', e);
  });
}

async function registration() {
  return navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` });
}

export async function getPushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY || !supabase) return 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(`${BASE_PATH}/`);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Pede permissão, inscreve este aparelho e salva no servidor. */
export async function enablePush(): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Disponível apenas com o app conectado ao servidor.' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, error: 'As notificações foram bloqueadas. Libere nas configurações do navegador para este site.' };
  }
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
    const keys = sub.toJSON().keys ?? {};
    const { error } = await supabase.rpc('register_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent.slice(0, 300),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Não foi possível ativar as notificações.' };
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(`${BASE_PATH}/`);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase?.rpc('unregister_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}

export async function sendTestPush(): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Indisponível no modo demonstração.' };
  const { error } = await supabase.rpc('send_test_push');
  return error ? { success: false, error: error.message } : { success: true };
}

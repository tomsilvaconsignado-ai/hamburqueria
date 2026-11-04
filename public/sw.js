// Service worker do Burger Hub: recebe as notificações push da equipe (pedido novo,
// pagamento aprovado, entregador acionado) mesmo com o app fechado ou a tela bloqueada.
// Não faz cache de páginas: o site continua sempre na versão publicada.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const scopeUrl = (path) => new URL(String(path || '').replace(/^\//, ''), self.registration.scope).href;

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  // Com o app aberto, a própria tela toca o áudio da loja; a notificação usa o som do celular
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || 'Burger Hub', {
        body: data.body || '',
        icon: scopeUrl('icons/icon-192.png'),
        badge: scopeUrl('icons/badge-96.png'),
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        requireInteraction: true,
        vibrate: [300, 150, 300, 150, 600],
        data: { url: scopeUrl(data.url || '/') },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});

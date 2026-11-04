// Edge Function send-push: envia Web Push para os aparelhos inscritos (push_subscriptions).
// Chamada só pelo banco (trigger → pg_net) com o cabeçalho x-push-secret.
// Arquivo único, sem imports locais: pode ser colado no editor de funções do painel do Supabase.
//
// Segredos (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  par de chaves do Web Push (a pública também vai para o site)
//   PUSH_WEBHOOK_SECRET                  o mesmo valor de private.app_secrets 'push_webhook_secret'
//   VAPID_SUBJECT (opcional)             contato do remetente (URL do site ou mailto:)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetadas pelo Supabase.
// Desligue "Verify JWT" nesta função: quem chama é o banco, autenticado pelo segredo acima.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

interface PushRequest {
  user_ids?: string[];
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  sound?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!sameSecret(req.headers.get('x-push-secret') ?? '', Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '')) {
    return json({ error: 'unauthorized' }, 401);
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return json({ error: 'VAPID keys not configured' }, 500);
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'https://tomsilvaconsignado-ai.github.io/hamburqueria/',
    publicKey,
    privateKey
  );

  const input = (await req.json().catch(() => ({}))) as PushRequest;
  const userIds = (input.user_ids ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (userIds.length === 0) return json({ sent: 0 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error) return json({ error: error.message }, 500);

  const payload = JSON.stringify({
    title: String(input.title ?? 'Burger Hub').slice(0, 120),
    body: String(input.body ?? '').slice(0, 240),
    url: String(input.url ?? '/').slice(0, 200),
    tag: String(input.tag ?? '').slice(0, 80),
    sound: input.sound ? String(input.sound).slice(0, 40) : undefined,
  });

  const expired: string[] = [];
  const delivered: string[] = [];
  let failed = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 600, // 10 min: aviso velho de pedido não serve
          urgency: 'high',
        });
        delivered.push(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Aparelho desinstalou/revogou: a inscrição não vale mais
        if (status === 404 || status === 410) expired.push(s.id);
        else {
          failed++;
          console.error('push falhou', status, (e as Error).message);
        }
      }
    })
  );

  if (expired.length) await db.from('push_subscriptions').delete().in('id', expired);
  if (delivered.length) await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('id', delivered);

  return json({ sent: delivered.length, removed: expired.length, failed });
});

// Edge Function: webhook de notificações do Mercado Pago.
//
// Nunca confia no corpo recebido: valida a assinatura (x-signature) e consulta o
// pagamento direto na API do Mercado Pago antes de marcar o pedido como PAGO.
//
// Variáveis: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy com `--no-verify-jwt` (o Mercado Pago não envia JWT do Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const MP_API = 'https://api.mercadopago.com';

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const STATUS_MAP: Record<string, string> = {
  approved: 'PAGO',
  authorized: 'EM_PROCESSAMENTO',
  in_process: 'EM_PROCESSAMENTO',
  pending: 'EM_PROCESSAMENTO',
  rejected: 'RECUSADO',
  cancelled: 'CANCELADO',
  refunded: 'REEMBOLSADO',
  charged_back: 'REEMBOLSADO',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (!accessToken || !secret) return new Response('not configured', { status: 503 });

  const url = new URL(req.url);
  let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    body = await req.json();
  } catch {
    // Algumas notificações chegam só com query string
  }

  const topic = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  const dataId = String(url.searchParams.get('data.id') ?? body.data?.id ?? '');
  if (topic !== 'payment' || !dataId) return new Response('ignored', { status: 200 });

  // Validação da assinatura conforme documentação do Mercado Pago
  const signature = req.headers.get('x-signature') ?? '';
  const requestId = req.headers.get('x-request-id') ?? '';
  const parts = Object.fromEntries(
    signature.split(',').map((p) => p.trim().split('=') as [string, string])
  );
  if (!parts.ts || !parts.v1) return new Response('invalid signature', { status: 401 });
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  if (!timingSafeEqual(await hmacHex(secret, manifest), parts.v1)) {
    return new Response('invalid signature', { status: 401 });
  }

  const mpRes = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mpRes.ok) return new Response('payment lookup failed', { status: 502 });
  const payment = await mpRes.json();

  const orderId = payment.external_reference as string | undefined;
  const newStatus = STATUS_MAP[payment.status as string];
  if (!orderId || !newStatus) return new Response('ignored', { status: 200 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: order } = await admin
    .from('orders')
    .select('id, total_cents, payment_status, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return new Response('order not found', { status: 200 });

  // Confere o valor pago com o total calculado pelo servidor
  const paidCents = Math.round(Number(payment.transaction_amount) * 100);
  if (newStatus === 'PAGO' && paidCents !== Number(order.total_cents)) {
    console.error(`Valor divergente no pedido ${orderId}: pago ${paidCents}, esperado ${order.total_cents}`);
    return new Response('amount mismatch', { status: 200 });
  }

  const now = new Date().toISOString();
  await admin
    .from('payments')
    .update({
      provider_payment_id: String(payment.id),
      status: newStatus,
      confirmed_at: newStatus === 'PAGO' ? now : null,
      updated_at: now,
    })
    .eq('order_id', orderId);

  // Pedido cancelado que recebeu pagamento vira reembolso pendente
  let orderPaymentStatus = newStatus;
  if (order.status === 'CANCELADO' && newStatus === 'PAGO') orderPaymentStatus = 'REEMBOLSO_PENDENTE';
  if (order.payment_status !== orderPaymentStatus && order.payment_status !== 'REEMBOLSADO') {
    await admin.from('orders').update({ payment_status: orderPaymentStatus }).eq('id', orderId);
  }

  await admin.from('audit_logs').insert({
    action: 'PAYMENT_WEBHOOK',
    entity_type: 'orders',
    entity_id: orderId,
    metadata: { mp_payment_id: payment.id, mp_status: payment.status, amount_cents: paidCents },
  });

  return new Response('ok', { status: 200 });
});

// Edge Function: cria a cobrança online (PIX ou Checkout Pro de cartão) no Mercado Pago.
//
// O valor cobrado é sempre lido do banco (orders.total_cents); o navegador só informa
// qual pedido quer pagar e prova que é dono dele (sessão do cliente ou token de convidado).
//
// Variáveis: MP_ACCESS_TOKEN, SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders, json } from '../_shared/cors.ts';

const MP_API = 'https://api.mercadopago.com';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
  const siteUrl = Deno.env.get('SITE_URL');
  if (!accessToken || !siteUrl) {
    return json({ error: 'Pagamento online não configurado no servidor.' }, 503);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let body: { order_id?: string; guest_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }
  if (!body.order_id) return json({ error: 'order_id obrigatório.' }, 400);

  const { data: order, error } = await admin
    .from('orders')
    .select('id, order_number, customer_id, customer_name, total_cents, payment_method, payment_status, status, guest_token_hash')
    .eq('id', body.order_id)
    .maybeSingle();
  if (error || !order) return json({ error: 'Pedido não encontrado.' }, 404);

  // Prova de posse: usuário logado dono do pedido ou token de convidado
  let authorized = false;
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (jwt && order.customer_id) {
    const { data: userData } = await admin.auth.getUser(jwt);
    authorized = userData.user?.id === order.customer_id;
  }
  if (!authorized && body.guest_token) {
    authorized = (await sha256Hex(body.guest_token)) === order.guest_token_hash;
  }
  if (!authorized) return json({ error: 'Acesso negado a este pedido.' }, 403);

  if (order.status === 'CANCELADO') return json({ error: 'Pedido cancelado.' }, 409);
  if (order.payment_status === 'PAGO') return json({ status: 'PAGO' });
  if (order.payment_method !== 'PIX_ONLINE' && order.payment_method !== 'CARD_ONLINE') {
    return json({ error: 'Este pedido não usa pagamento online.' }, 400);
  }

  // Reaproveita cobrança PIX ainda válida (idempotência em recarregamentos)
  const { data: existing } = await admin
    .from('payments')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const trackUrl = body.guest_token ? `${siteUrl}/acompanhar/${body.guest_token}` : `${siteUrl}/minha-conta`;
  const amount = Number(order.total_cents) / 100;
  const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`;

  if (order.payment_method === 'PIX_ONLINE') {
    if (
      existing?.pix_copy_paste &&
      existing.pix_expires_at &&
      new Date(existing.pix_expires_at).getTime() > Date.now() + 60_000
    ) {
      return json({
        method: 'PIX_ONLINE',
        pix_copy_paste: existing.pix_copy_paste,
        pix_qr_code_base64: existing.pix_qr_code,
        expires_at: existing.pix_expires_at,
      });
    }

    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const mpRes = await fetch(`${MP_API}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pix-${order.id}-${expiresAt.slice(0, 16)}`,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: `Pedido ${order.order_number}`,
        payment_method_id: 'pix',
        external_reference: order.id,
        notification_url: notificationUrl,
        date_of_expiration: expiresAt,
        payer: { email: `pedido-${order.id}@burgerhub.invalid`, first_name: order.customer_name },
      }),
    });
    const mp = await mpRes.json();
    if (!mpRes.ok) {
      console.error('Mercado Pago PIX error', mp);
      return json({ error: 'Não foi possível gerar o PIX agora. Tente novamente.' }, 502);
    }

    const tx = mp.point_of_interaction?.transaction_data ?? {};
    await admin
      .from('payments')
      .update({
        provider: 'MERCADOPAGO',
        provider_payment_id: String(mp.id),
        external_reference: order.id,
        status: 'EM_PROCESSAMENTO',
        pix_qr_code: tx.qr_code_base64 ?? null,
        pix_copy_paste: tx.qr_code ?? null,
        pix_expires_at: expiresAt,
        checkout_url: tx.ticket_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', order.id);

    return json({
      method: 'PIX_ONLINE',
      pix_copy_paste: tx.qr_code,
      pix_qr_code_base64: tx.qr_code_base64,
      expires_at: expiresAt,
    });
  }

  // CARD_ONLINE: Checkout Pro (os dados do cartão nunca passam pelo nosso app)
  const prefRes = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: `Pedido ${order.order_number}`, quantity: 1, unit_price: amount, currency_id: 'BRL' }],
      external_reference: order.id,
      notification_url: notificationUrl,
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }] },
      back_urls: { success: trackUrl, pending: trackUrl, failure: trackUrl },
      auto_return: 'approved',
    }),
  });
  const pref = await prefRes.json();
  if (!prefRes.ok) {
    console.error('Mercado Pago preference error', pref);
    return json({ error: 'Não foi possível iniciar o pagamento com cartão.' }, 502);
  }

  await admin
    .from('payments')
    .update({
      provider: 'MERCADOPAGO',
      external_reference: order.id,
      checkout_url: pref.init_point,
      status: 'EM_PROCESSAMENTO',
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', order.id);

  return json({ method: 'CARD_ONLINE', checkout_url: pref.init_point });
});

// Casos de teste do banco (chamados por db.test.mjs, que monta o cenário).
import { randomUUID } from 'crypto';

export default async function ({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload }) {
  const count = async (sql, params = []) => Number((await one(sql, params)).n);

  console.log('\nPedido sem duplicidade');
  const req = randomUUID();
  let r = await expectOk('cliente logada cria pedido com identificador', ids.ana, `SELECT public.create_order($1::jsonb) AS o`, [payload({ client_request_id: req })]);
  const first = r?.rows[0]?.o;
  r = await expectOk('o mesmo pedido chega de novo (clique duplo)', ids.ana, `SELECT public.create_order($1::jsonb) AS o`, [payload({ client_request_id: req })]);
  const again = r?.rows[0]?.o;
  again?.duplicate && again.order_id === first?.order_id ? ok('devolve o pedido já criado') : bad('duplicou: ' + JSON.stringify(again));
  again?.guest_access_token === first?.guest_access_token ? ok('com o mesmo token de acompanhamento') : bad('token diferente no reenvio');
  (await count(`SELECT count(*) AS n FROM orders WHERE client_request_id = $1`, [req])) === 1 ? ok('só um pedido gravado') : bad('mais de um pedido com o mesmo identificador');
  await expectFail('identificador com outro telefone é recusado', ids.bia, `SELECT public.create_order($1::jsonb)`, [payload({ client_request_id: req, customer_phone: '11977772222' })]);
  const guestReq = randomUUID();
  r = await expectOk('convidado (sem login) cria pedido', null, `SELECT public.create_order($1::jsonb) AS o`,
    [payload({ client_request_id: guestReq, customer_name: 'Carla Convidada', customer_phone: '11 96666-3333' })]);
  const guest = r?.rows[0]?.o;
  r = await expectOk('convidado acompanha pelo token', null, `SELECT public.get_guest_order($1) AS o`, [guest?.guest_access_token]);
  r?.rows[0]?.o ? ok('token devolve o pedido') : bad('token do convidado não funciona');
  r = await expectOk('versão antiga do site (sem identificador) continua funcionando', ids.bia, `SELECT public.create_order($1::jsonb) AS o`,
    [payload({ customer_name: 'Bia Lima', customer_phone: '11977772222' })]);
  const biaOrder = r?.rows[0]?.o;
  await expectFail('a função interna não é chamável direto', null, `SELECT public.create_order_core($1::jsonb)`, [payload()]);

  console.log('\nFluxo completo do pedido');
  const id = first?.order_id;
  for (const s of ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO']) await expectOk(`admin muda para ${s}`, ids.admin, `SELECT public.update_order_status($1, $2)`, [id, s]);
  await expectOk('admin atribui o entregador', ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [id, courierId]);
  await expectOk('entregador retira o pedido', ids.courier, `SELECT public.courier_update_delivery($1, 'PICKUP')`, [id]);
  await expectOk('entregador conclui com pagamento recebido', ids.courier, `SELECT public.courier_update_delivery($1, 'DELIVERED', true)`, [id]);
  await expectOk('admin cancela o pedido da Bia', ids.admin, `SELECT public.update_order_status($1, 'CANCELADO', 'Cliente desistiu')`, [biaOrder?.order_id]);
  const total = Number((await one(`SELECT total_cents FROM orders WHERE id = $1`, [id])).total_cents);
  const fee = Number((await one(`SELECT delivery_fee_cents FROM orders WHERE id = $1`, [id])).delivery_fee_cents);

  console.log('\nRelatório financeiro (no servidor)');
  const today = (await one(`SELECT public.store_date(now())::text AS d`)).d;
  await expectFail('cliente não vê relatório', ids.ana, `SELECT public.admin_report($1, $1)`, [today]);
  await expectFail('cozinha não vê relatório', ids.kitchen, `SELECT public.admin_report($1, $1)`, [today]);
  await expectFail('visitante não vê relatório', null, `SELECT public.admin_report($1, $1)`, [today]);
  r = await expectOk('admin gera o relatório do dia', ids.admin, `SELECT public.admin_report($1, $1) AS rep`, [today]);
  let s = r?.rows[0]?.rep?.summary;
  s?.orders_completed === 1 && Number(s.net_cents) === total ? ok('1 pedido concluído, líquido = total pago') : bad('resumo: ' + JSON.stringify(s));
  Number(s?.gross_cents) === Number(s?.products_cents) + Number(s?.delivery_fees_cents) ? ok('bruto = produtos + taxas de entrega') : bad('bruto incoerente');
  s?.orders_cancelled === 1 ? ok('cancelado contado à parte') : bad('cancelados: ' + s?.orders_cancelled);
  s?.orders_in_progress === 1 ? ok('pedido do convidado aparece como em andamento') : bad('em andamento: ' + s?.orders_in_progress);
  const rep = r?.rows[0]?.rep;
  rep?.by_product?.[0]?.quantity == 2 ? ok('mais vendidos por produto') : bad('por produto: ' + JSON.stringify(rep?.by_product));
  rep?.by_category?.[0]?.name ? ok('vendas por categoria (' + rep.by_category[0].name + ')') : bad('por categoria vazio');
  rep?.by_payment?.[0]?.method === 'CASH_ON_DELIVERY' ? ok('vendas por forma de pagamento') : bad('por pagamento: ' + JSON.stringify(rep?.by_payment));
  rep?.by_day?.length === 1 ? ok('série diária do período') : bad('por dia: ' + rep?.by_day?.length);
  await expectFail('período acima de 2 anos é recusado', ids.admin, `SELECT public.admin_report('2020-01-01', $1)`, [today]);

  console.log('\nDespesas e fechamento de caixa');
  await expectFail('cozinha não lança despesa', ids.kitchen, `INSERT INTO expenses (description, amount_cents) VALUES ('Gás', 10000)`);
  await expectOk('admin lança despesa paga em dinheiro', ids.admin, `INSERT INTO expenses (description, category, amount_cents, payment_method) VALUES ('Gás', 'Insumos', 1500, 'DINHEIRO')`);
  await expectFail('despesa com valor zero é recusada', ids.admin, `INSERT INTO expenses (description, amount_cents) VALUES ('X', 0)`);
  r = await as(ids.admin, `SELECT public.admin_report($1, $1) AS rep`, [today]);
  s = r.rows[0].rep.summary;
  Number(s.balance_cents) === total - 1500 ? ok('saldo = líquido − despesas') : bad('saldo: ' + s.balance_cents);
  await expectFail('cliente não fecha o caixa', ids.ana, `SELECT public.admin_close_cash($1, 5000, 5000)`, [today]);
  await expectFail('não fecha caixa de data futura', ids.admin, `SELECT public.admin_close_cash(($1::date + 1), 0, 0)`, [today]);
  r = await expectOk('admin fecha o caixa', ids.admin, `SELECT public.admin_close_cash($1, 5000, $2, 'conferido') AS c`, [today, 5000 + total - 1500 - 200]);
  const closing = r?.rows[0]?.c;
  Number(closing?.expected_cash_cents) === 5000 + total - 1500 ? ok('esperado = troco + vendas em dinheiro − despesas em dinheiro') : bad('esperado: ' + JSON.stringify(closing));
  Number(closing?.difference_cents) === -200 ? ok('diferença de caixa registrada (−R$ 2,00)') : bad('diferença: ' + closing?.difference_cents);
  await expectOk('refazer o fechamento atualiza o mesmo dia', ids.admin, `SELECT public.admin_close_cash($1, 5000, $2)`, [today, 5000 + total - 1500]);
  (await count(`SELECT count(*) AS n FROM cash_closings`)) === 1 ? ok('um fechamento por dia') : bad('fechamentos duplicados');
  await expectFail('ninguém edita fechamento direto', ids.admin, `UPDATE cash_closings SET counted_cash_cents = 0`);

  console.log('\nClientes (CRM)');
  await expectFail('cliente não lista clientes', ids.ana, `SELECT public.admin_customers()`);
  r = await expectOk('admin lista clientes', ids.admin, `SELECT public.admin_customers() AS c`);
  const list = r?.rows[0]?.c ?? [];
  const ana = list.find(c => c.phone_key === '11988881111');
  ana?.completed_count === 1 && Number(ana.total_spent_cents) === total ? ok('Ana: 1 pedido concluído e total gasto certo') : bad('Ana: ' + JSON.stringify(ana));
  list.some(c => c.phone_key === '11966663333') ? ok('convidado aparece pelo telefone') : bad('convidado fora da lista');
  r = await as(ids.admin, `SELECT public.admin_customers('98888') AS c`);
  r.rows[0].c.length === 1 ? ok('busca por parte do telefone') : bad('busca por telefone: ' + r.rows[0].c.length);
  r = await as(ids.admin, `SELECT public.admin_customers('carla') AS c`);
  r.rows[0].c[0]?.full_name === 'Carla Convidada' ? ok('busca por nome') : bad('busca por nome');
  await expectOk('admin cadastra cliente de balcão com aniversário e VIP', ids.admin,
    `INSERT INTO customer_crm (phone_key, full_name, phone, birthday, is_vip, notes) VALUES ('11955554444', 'Dona Rosa', '(11) 95555-4444', date_trunc('month', now())::date, true, 'Sem cebola')`);
  r = await as(ids.admin, `SELECT public.admin_customers(NULL, 'VIP') AS c`);
  r.rows[0].c.length === 1 && r.rows[0].c[0].notes === 'Sem cebola' ? ok('filtro VIP traz a ficha') : bad('VIP: ' + JSON.stringify(r.rows[0].c));
  r = await as(ids.admin, `SELECT public.admin_customers(NULL, 'BIRTHDAY') AS c`);
  r.rows[0].c.length === 1 ? ok('aniversariantes do mês') : bad('aniversariantes: ' + r.rows[0].c.length);
  await expectFail('telefone inválido na ficha é recusado', ids.admin, `INSERT INTO customer_crm (phone_key) VALUES ('123')`);
  r = await as(ids.kitchen, `SELECT count(*)::int AS n FROM customer_crm`);
  r.rows[0].n === 0 ? ok('cozinha não lê as fichas de clientes') : bad('cozinha leu fichas: ' + r.rows[0].n);
  await expectFail('visitante não lê as fichas', null, `SELECT * FROM customer_crm`);
  r = await expectOk('histórico de pedidos da cliente', ids.admin, `SELECT public.admin_customer_orders('(11) 98888-1111') AS o`);
  r?.rows[0]?.o?.length === 1 && r.rows[0].o[0].items.length === 1 ? ok('pedido com itens no histórico') : bad('histórico: ' + JSON.stringify(r?.rows[0]?.o));
  (await count(`SELECT count(*) AS n FROM audit_logs WHERE entity_type IN ('customer_crm', 'expenses', 'cash_closings')`)) >= 4
    ? ok('alterações de ficha, despesa e caixa ficam na auditoria') : bad('auditoria incompleta');

  console.log('\nEntregadores');
  await expectFail('entregador não vê o relatório de todos', ids.courier, `SELECT public.admin_courier_report($1, $1)`, [today]);
  r = await expectOk('admin vê o relatório de entregas', ids.admin, `SELECT public.admin_courier_report($1, $1) AS c`, [today]);
  const moto = r?.rows[0]?.c?.[0];
  moto?.delivered_count === 1 && Number(moto.fees_cents) === fee ? ok('1 entrega e valor da taxa') : bad('entregador: ' + JSON.stringify(moto));
  const d = moto?.deliveries?.[0];
  d?.assigned_by_name === 'Admin' && d.out_for_delivery_at && d.delivered_at ? ok('quem atribuiu e horários de saída e entrega') : bad('entrega: ' + JSON.stringify(d));

  console.log('\nLinha do tempo do pedido');
  r = await as(ids.admin, `SELECT new_status, changed_by FROM order_status_history WHERE order_id = $1 ORDER BY created_at`, [id]);
  r.rows.length >= 6 && r.rows.some(h => h.new_status === 'CONFIRMADO' && h.changed_by === ids.admin)
    ? ok('cada etapa com horário e responsável') : bad('histórico: ' + JSON.stringify(r.rows));

  await mapboxCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload, count });
  await presentationCases({ db, as, ok, bad, expectOk, expectFail, one, ids, payload });
  await pushCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload });
}

// Notificações push: inscrição da equipe e chamadas à função send-push por evento
async function pushCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload }) {
  console.log('\nNotificações push');
  const sub = (n) => [`https://fcm.googleapis.com/fcm/send/aparelho-${n}`, 'B'.repeat(87), 'a'.repeat(22), 'Chrome Android'];
  const calls = async () => (await db.query(`SELECT body FROM test_net_calls ORDER BY ctid`)).rows.map((r) => r.body);
  const reset = () => db.query(`DELETE FROM test_net_calls`);

  await expectFail('visitante não inscreve aparelho', null, `SELECT public.register_push_subscription($1, $2, $3, $4)`, sub(0));
  await expectFail('cliente não inscreve aparelho', ids.ana, `SELECT public.register_push_subscription($1, $2, $3, $4)`, sub(0));
  await expectFail('endereço que não é https é recusado', ids.admin, `SELECT public.register_push_subscription('http://x', $1, $2)`, [sub(0)[1], sub(0)[2]]);
  await expectOk('admin ativa no celular', ids.admin, `SELECT public.register_push_subscription($1, $2, $3, $4)`, sub(1));
  await expectOk('cozinha ativa no tablet', ids.kitchen, `SELECT public.register_push_subscription($1, $2, $3, $4)`, sub(2));
  await expectOk('entregador ativa no celular', ids.courier, `SELECT public.register_push_subscription($1, $2, $3, $4)`, sub(3));
  await expectOk('ativar de novo no mesmo aparelho não duplica', ids.admin, `SELECT public.register_push_subscription($1, $2, $3, $4)`, sub(1));
  let r = await as(ids.kitchen, `SELECT count(*)::int AS n FROM push_subscriptions`);
  r.rows[0].n === 1 ? ok('cada um vê só os próprios aparelhos') : bad('cozinha viu ' + r.rows[0].n);
  await expectFail('ninguém grava inscrição direto na tabela', ids.admin,
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://x/y', $2, $3)`, [ids.admin, sub(9)[1], sub(9)[2]]);

  await reset();
  await expectOk('pedido criado sem a função configurada', ids.ana, `SELECT public.create_order($1::jsonb)`, [payload({ client_request_id: randomUUID() })]);
  (await calls()).length === 0 ? ok('sem endereço/segredo da função nada é enviado (e o pedido sai)') : bad('enviou sem configuração');
  await expectFail('teste avisa que falta configurar o servidor', ids.admin, `SELECT public.send_test_push()`);

  await db.query(`INSERT INTO private.app_secrets (name, value) VALUES ('push_function_url', 'https://proj.supabase.co/functions/v1/send-push'), ('push_webhook_secret', 'segredo-teste')
    ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`);
  await expectFail('visitante não lê o segredo das notificações', null, `SELECT value FROM private.app_secrets`);

  await reset();
  r = await expectOk('pedido com dinheiro na entrega', ids.ana, `SELECT public.create_order($1::jsonb) AS o`, [payload({ client_request_id: randomUUID() })]);
  const cash = r?.rows[0]?.o;
  let c = await calls();
  const toAdmin = c.find((b) => b.url === '/admin/pedidos');
  const toKitchen = c.find((b) => b.url === '/cozinha');
  toAdmin?.user_ids?.includes(ids.admin) && /Novo pedido #BH-/.test(toAdmin.title) && /Ana Souza · R\$ [\d,]+ · Entrega/.test(toAdmin.body)
    ? ok('admin avisado: ' + toAdmin.title + ' — ' + toAdmin.body) : bad('admin: ' + JSON.stringify(c));
  toKitchen?.user_ids?.includes(ids.kitchen) && toKitchen.sound === 'novo-pedido' ? ok('cozinha avisada com o som de pedido novo') : bad('cozinha: ' + JSON.stringify(c));
  const headers = (await one(`SELECT headers FROM test_net_calls LIMIT 1`)).headers;
  headers['x-push-secret'] === 'segredo-teste' ? ok('chamada leva o segredo compartilhado') : bad('cabeçalhos: ' + JSON.stringify(headers));

  await reset();
  await db.query(`UPDATE store_settings SET payment_demo_mode = TRUE`);
  r = await as(null, `SELECT public.create_order($1::jsonb) AS o`,
    [payload({ client_request_id: randomUUID(), payment_method: 'PIX_ONLINE', customer_name: 'Pix Push', customer_phone: '11 94444-0000' })]);
  const pix = r.rows[0].o;
  c = await calls();
  c.length === 1 && c[0].url === '/admin/pedidos' && /aguardando pagamento/.test(c[0].body)
    ? ok('Pix pendente: só o admin é avisado (cozinha espera o pagamento)') : bad('pix pendente: ' + JSON.stringify(c));
  await reset();
  await as(null, `SELECT public.demo_approve_payment($1, $2)`, [pix.order_id, pix.guest_access_token]);
  c = await calls();
  c.length === 1 && c[0].url === '/cozinha' && /Pagamento aprovado/.test(c[0].title) ? ok('pagamento aprovado avisa a cozinha') : bad('aprovado: ' + JSON.stringify(c));
  await db.query(`UPDATE store_settings SET payment_demo_mode = FALSE`);

  await reset();
  for (const s of ['CONFIRMADO', 'EM_PREPARACAO']) await as(ids.admin, `SELECT public.update_order_status($1, $2)`, [cash.order_id, s]);
  (await calls()).length === 0 ? ok('mudanças de etapa comuns não disparam notificação') : bad('notificou etapa comum');
  await as(ids.admin, `SELECT public.update_order_status($1, 'PRONTO')`, [cash.order_id]);
  c = await calls();
  c.length === 1 && c[0].url === '/admin/pedidos' && /pronto sem entregador/.test(c[0].title)
    ? ok('pronto sem entregador avisa o admin: ' + c[0].title) : bad('pronto sem entregador: ' + JSON.stringify(c));
  await reset();
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [cash.order_id, courierId]);
  c = await calls();
  c.length === 1 && c[0].user_ids.length === 1 && c[0].url === '/entregador' && c[0].sound === 'entregador-acionado'
    && /Nova entrega/.test(c[0].title) && /Rua A, 10 – Centro · já está pronto, pode retirar · cobrar R\$/.test(c[0].body)
    ? ok('entregador acionado: ' + c[0].title + ' — ' + c[0].body) : bad('entregador: ' + JSON.stringify(c));
  c[0]?.user_ids?.[0] === ids.courier ? ok('só o entregador atribuído recebe') : bad('destinatário errado');

  await flowCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload, calls, reset });

  r = await expectOk('teste de notificação com tudo configurado', ids.courier, `SELECT public.send_test_push() AS t`);
  r?.rows[0]?.t?.devices === 1 ? ok('teste enviado para 1 aparelho') : bad('teste: ' + JSON.stringify(r?.rows[0]?.t));
  await expectOk('desativar no aparelho', ids.courier, `SELECT public.unregister_push_subscription($1)`, [sub(3)[0]]);
  await expectFail('sem aparelho inscrito o teste avisa', ids.courier, `SELECT public.send_test_push()`);
  await expectFail('visitante não chama o envio direto', null, `SELECT public.notify_push(ARRAY[$1]::uuid[], 't', 'b', '/', 'x')`, [ids.admin]);
}

// Modo apresentação: pagamento online aprovado sem gateway, só com o modo ligado
async function presentationCases({ db, as, ok, bad, expectOk, expectFail, one, ids, payload }) {
  console.log('\nModo apresentação (pagamento simulado)');
  await db.query(`UPDATE store_settings SET accepted_payment_methods = NULL`);
  let r = await expectOk('convidado cria pedido com Pix online', null, `SELECT public.create_order($1::jsonb) AS o`,
    [payload({ client_request_id: randomUUID(), payment_method: 'PIX_ONLINE', customer_name: 'Visitante Demo', customer_phone: '11 95555-0000' })]);
  const pix = r?.rows[0]?.o;
  await expectFail('com o modo desligado a aprovação simulada é recusada', null,
    `SELECT public.demo_approve_payment($1, $2)`, [pix?.order_id, pix?.guest_access_token]);
  await expectFail('com o pagamento pendente a loja não confirma o pedido', ids.admin,
    `SELECT public.update_order_status($1, 'CONFIRMADO')`, [pix?.order_id]);

  await db.query(`UPDATE store_settings SET payment_demo_mode = TRUE`);
  await expectFail('sem o token do pedido não aprova', null, `SELECT public.demo_approve_payment($1)`, [pix?.order_id]);
  await expectFail('outra cliente não aprova pedido alheio', ids.bia, `SELECT public.demo_approve_payment($1)`, [pix?.order_id]);
  await expectOk('com o modo ligado o convidado aprova pelo link', null,
    `SELECT public.demo_approve_payment($1, $2)`, [pix?.order_id, pix?.guest_access_token]);
  const pay = await one(`SELECT p.status, p.provider, p.external_reference, o.payment_status FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.order_id = $1`, [pix?.order_id]);
  pay?.status === 'PAGO' && pay.payment_status === 'PAGO' && pay.external_reference === 'APRESENTACAO'
    ? ok('pedido e pagamento ficam PAGO, marcados como APRESENTACAO') : bad('pagamento: ' + JSON.stringify(pay));
  await expectOk('a loja confirma o pedido pago', ids.admin, `SELECT public.update_order_status($1, 'CONFIRMADO')`, [pix?.order_id]);
  r = await as(null, `SELECT public.demo_approve_payment($1, $2) AS a`, [pix?.order_id, pix?.guest_access_token]);
  r.rows[0].a?.already_paid ? ok('aprovar de novo não muda nada') : bad('segunda aprovação: ' + JSON.stringify(r.rows[0].a));

  r = await expectOk('pedido com dinheiro na entrega', ids.ana, `SELECT public.create_order($1::jsonb) AS o`, [payload({ client_request_id: randomUUID() })]);
  await expectFail('pagamento na entrega não é aprovado pelo modo apresentação', ids.ana,
    `SELECT public.demo_approve_payment($1)`, [r?.rows[0]?.o?.order_id]);
  (await one(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'DEMO_PAYMENT_APPROVED'`)).n === 1
    ? ok('aprovação simulada fica na auditoria') : bad('auditoria do modo apresentação');
  await db.query(`UPDATE store_settings SET payment_demo_mode = FALSE`);
}

// Taxa por distância (Mapbox simulado em test_http), rota no pedido e rastreio ao vivo
async function mapboxCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload, count }) {
  const addr = (street, neighborhood = 'Centro') => ({ street, number: '10', neighborhood, city: 'São Paulo', state: 'SP', postal_code: '01000-000' });
  const geo = (lng, lat, type = 'address') => JSON.stringify({ features: [{ geometry: { coordinates: [lng, lat] }, properties: { feature_type: type } }] });
  const route = (distance, duration) => JSON.stringify({ routes: [{ distance, duration }] });
  const http = (like, status, body) => db.query(`INSERT INTO test_http VALUES ($1, $2, $3)`, [like, status, body]);
  const calls = () => count(`SELECT count(*) AS n FROM test_http_calls`);
  const quote = async (a) => (await as(null, `SELECT public.quote_delivery($1::jsonb) AS q`, [JSON.stringify(a)])).rows[0].q;

  console.log('\nTaxa por distância (Mapbox)');
  let q = await quote(addr('Rua A'));
  q.ok && q.mode === 'ZONE' ? ok('modo padrão continua por bairro') : bad('modo padrão: ' + JSON.stringify(q));
  (await calls()) === 0 ? ok('no modo por bairro o Mapbox não é consultado') : bad('consultou o Mapbox no modo por bairro');

  await db.query(`UPDATE store_settings SET delivery_pricing_mode = 'DISTANCE', delivery_base_fee_cents = 500,
    delivery_included_km = 2, delivery_fee_per_km_cents = 150, delivery_max_km = 8, default_preparation_minutes = 25`);
  q = await quote(addr('Rua A'));
  q.ok && q.mode === 'ZONE' ? ok('sem token nem local da loja: usa a zona do bairro') : bad('sem configuração: ' + JSON.stringify(q));

  await db.query(`INSERT INTO private.app_secrets (name, value) VALUES ('mapbox_server_token', 'pk.teste')`);
  await db.query(`UPDATE store_settings SET store_latitude = -23.5, store_longitude = -46.6`);
  await http('%geocode%Rua+A+10%', 200, geo(-46.64, -23.55));
  await http('%directions%;-46.64,-23.55?%', 200, route(4200, 600));
  await http('%geocode%Rua+Longe+10%', 200, geo(-46.2, -23.2));
  await http('%directions%;-46.2,-23.2?%', 200, route(15000, 1500));
  await http('%geocode%Rua+Aproximada+10%', 200, geo(-46.7, -23.6, 'street'));
  await http('%directions%;-46.7,-23.6?%', 200, route(1500, 300));
  await http('%geocode%Rua+Inexistente+10%', 200, JSON.stringify({ features: [] }));
  await http('%geocode%Rua+Caiu+10%', 503, '');

  q = await quote(addr('Rua A'));
  q.ok && q.mode === 'DISTANCE' && q.distance_m === 4200 ? ok('4,2 km de rota calculados') : bad('cotação: ' + JSON.stringify(q));
  Number(q.fee_cents) === 830 ? ok('taxa = R$ 5,00 + 2,2 km × R$ 1,50 = R$ 8,30') : bad('taxa: ' + q.fee_cents);
  q.minutes === 35 ? ok('previsão = 25 min de preparo + 10 min de rota') : bad('minutos: ' + q.minutes);
  const before = await calls();
  await quote(addr('Rua A'));
  (await calls()) === before ? ok('mesmo endereço de novo vem do cache (sem gastar cota)') : bad('consultou o Mapbox de novo');
  (await calls()) === 2 ? ok('uma geocodificação + uma rota por endereço') : bad('chamadas: ' + (await calls()));
  (await one(`SELECT url FROM test_http_calls LIMIT 1`)).url.includes('access_token=pk.teste') ? ok('token do servidor usado na consulta') : bad('token ausente');

  q = await quote(addr('Rua Longe'));
  !q.ok && /15,0 km/.test(q.error) && /até 8,0 km/.test(q.error) ? ok('fora do raio: ' + q.error) : bad('fora do raio: ' + JSON.stringify(q));
  q = await quote(addr('Rua Aproximada'));
  q.ok && q.approximate === true && Number(q.fee_cents) === 500 ? ok('só a rua encontrada: marca como aproximado; até 2 km paga a taxa base') : bad('aproximado: ' + JSON.stringify(q));
  q = await quote(addr('Rua Inexistente'));
  !q.ok && /Não encontramos/.test(q.error) ? ok('endereço não encontrado avisa o cliente') : bad('não encontrado: ' + JSON.stringify(q));
  q = await quote(addr('Rua Caiu'));
  q.ok && q.mode === 'ZONE' ? ok('Mapbox fora do ar: cai para a zona do bairro') : bad('Mapbox fora: ' + JSON.stringify(q));
  q = await quote(addr('Rua Caiu', 'Bairro Sem Zona'));
  !q.ok && /Não foi possível calcular/.test(q.error) ? ok('Mapbox fora e bairro sem zona: pede para tentar de novo') : bad('fora sem zona: ' + JSON.stringify(q));
  q = await quote({ street: 'Rua A', number: '', neighborhood: 'Centro' });
  !q.ok ? ok('endereço incompleto não consulta o Mapbox') : bad('incompleto passou');

  await db.query(`INSERT INTO private.mapbox_calls (called_at) SELECT now() FROM generate_series(1, 60)`);
  q = await quote(addr('Rua Nova Qualquer'));
  !q.ok && /Muitas consultas/.test(q.error) ? ok('limite de 60 consultas por minuto protege a cota') : bad('sem limite: ' + JSON.stringify(q));
  q = await quote(addr('Rua A'));
  q.ok && q.mode === 'DISTANCE' ? ok('endereço já em cache continua respondendo no limite') : bad('cache no limite: ' + JSON.stringify(q));
  await db.query(`DELETE FROM private.mapbox_calls`);

  await expectFail('visitante não lê o token', null, `SELECT * FROM private.app_secrets`);
  await expectFail('cliente não lê o token', ids.ana, `SELECT * FROM private.app_secrets`);
  await expectFail('visitante não chama a rota direto', null, `SELECT public.delivery_route($1::jsonb)`, [JSON.stringify(addr('Rua A'))]);
  await expectFail('visitante não chama o Mapbox direto', null, `SELECT public.mapbox_get('https://exemplo.com')`);
  await expectFail('cliente não vê o status do Mapbox', ids.ana, `SELECT public.admin_mapbox_status()`);
  let r = await expectOk('admin vê o status do Mapbox', ids.admin, `SELECT public.admin_mapbox_status() AS s`);
  r?.rows[0]?.s?.server_token && r.rows[0].s.store_location ? ok('token e local da loja configurados') : bad('status: ' + JSON.stringify(r?.rows[0]?.s));

  console.log('\nPedido com taxa por distância');
  r = await expectOk('cliente cria pedido com entrega por distância', ids.ana, `SELECT public.create_order($1::jsonb) AS o`,
    [payload({ client_request_id: randomUUID(), delivery_address: addr('Rua A') })]);
  const order = r?.rows[0]?.o;
  const row = await one(`SELECT delivery_fee_cents, delivery_distance_m, delivery_duration_s, subtotal_cents, total_cents FROM orders WHERE id = $1`, [order?.order_id]);
  Number(row?.delivery_fee_cents) === 830 && row.delivery_distance_m === 4200 && row.delivery_duration_s === 600
    ? ok('taxa, distância e tempo de rota gravados no pedido') : bad('pedido: ' + JSON.stringify(row));
  Number(row?.total_cents) === Number(row?.subtotal_cents) + 830 ? ok('total inclui a taxa por distância') : bad('total: ' + JSON.stringify(row));
  await expectFail('pedido fora do raio é recusado', ids.ana, `SELECT public.create_order($1::jsonb)`,
    [payload({ client_request_id: randomUUID(), delivery_address: addr('Rua Longe') })]);
  await db.query(`UPDATE store_settings SET minimum_order_cents = 999999`);
  await expectFail('pedido abaixo do mínimo é recusado', ids.ana, `SELECT public.create_order($1::jsonb)`,
    [payload({ client_request_id: randomUUID(), delivery_address: addr('Rua A') })]);
  await db.query(`UPDATE store_settings SET minimum_order_cents = 0, delivery_pricing_mode = 'ZONE'`);

  console.log('\nRastreio ao vivo');
  const oid = order?.order_id;
  const token = order?.guest_access_token;
  const report = (uid) => as(uid, `SELECT public.courier_report_location(-23.551, -46.633, 12, 90, 8) AS t`);
  for (const s of ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO']) await as(ids.admin, `SELECT public.update_order_status($1, $2)`, [oid, s]);
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [oid, courierId]);
  r = await expectOk('entregador envia posição antes de sair', ids.courier, `SELECT public.courier_report_location(-23.5, -46.6) AS t`);
  r?.rows[0]?.t?.tracking === false ? ok('fora de rota a posição não é guardada') : bad('guardou fora de rota');
  await expectFail('cliente não envia posição de entregador', ids.ana, `SELECT public.courier_report_location(-23.5, -46.6)`);
  await expectFail('visitante não envia posição', null, `SELECT public.courier_report_location(-23.5, -46.6)`);
  await as(ids.courier, `SELECT public.courier_update_delivery($1, 'PICKUP')`, [oid]);
  r = await report(ids.courier);
  r.rows[0].t.tracking === true ? ok('em rota: posição registrada') : bad('não registrou em rota');
  await expectFail('coordenada inválida é recusada', ids.courier, `SELECT public.courier_report_location(123, -46.6)`);
  await expectFail('ninguém grava posição direto na tabela', ids.courier,
    `INSERT INTO courier_locations (courier_id, latitude, longitude) VALUES ($1, 0, 0)`, [courierId]);

  r = await as(ids.ana, `SELECT public.get_order_tracking($1) AS t`, [oid]);
  const t = r.rows[0].t;
  t?.active && t.has_location && Number(t.latitude) === -23.551 ? ok('cliente vê o entregador no mapa') : bad('cliente: ' + JSON.stringify(t));
  r = await as(null, `SELECT public.get_order_tracking($1, $2) AS t`, [oid, token]);
  r.rows[0].t?.has_location ? ok('convidado vê pelo link de acompanhamento') : bad('convidado sem posição');
  r = await as(null, `SELECT public.get_order_tracking($1, $2) AS t`, [oid, 'gst_' + 'f'.repeat(48)]);
  r.rows[0].t === null ? ok('token errado não vê nada') : bad('token errado viu: ' + JSON.stringify(r.rows[0].t));
  r = await as(ids.bia, `SELECT public.get_order_tracking($1) AS t`, [oid]);
  r.rows[0].t === null ? ok('outra cliente não vê o entregador') : bad('outra cliente viu');
  r = await as(ids.kitchen, `SELECT count(*)::int AS n FROM courier_locations`);
  r.rows[0].n === 0 ? ok('cozinha não lista posições') : bad('cozinha listou posições');
  r = await as(ids.admin, `SELECT count(*)::int AS n FROM courier_locations`);
  r.rows[0].n === 1 ? ok('admin vê os entregadores em rota') : bad('admin: ' + r.rows[0].n);
  r = await as(ids.courier, `SELECT count(*)::int AS n FROM courier_locations`);
  r.rows[0].n === 1 ? ok('entregador vê a própria posição') : bad('entregador: ' + r.rows[0].n);

  await db.query(`UPDATE courier_locations SET updated_at = now() - interval '11 minutes'`);
  r = await as(ids.ana, `SELECT public.get_order_tracking($1) AS t`, [oid]);
  r.rows[0].t?.active && r.rows[0].t.has_location === false ? ok('posição com mais de 10 min não é mostrada') : bad('posição velha: ' + JSON.stringify(r.rows[0].t));
  await report(ids.courier);

  await as(ids.courier, `SELECT public.courier_update_delivery($1, 'DELIVERED', true)`, [oid]);
  (await count(`SELECT count(*) AS n FROM courier_locations`)) === 0 ? ok('entrega concluída apaga a posição do entregador') : bad('posição ficou guardada');
  r = await as(ids.ana, `SELECT public.get_order_tracking($1) AS t`, [oid]);
  r.rows[0].t?.active === false ? ok('pedido concluído não mostra rastreio') : bad('concluído: ' + JSON.stringify(r.rows[0].t));
}

// Fluxo pedido → entrega: entrega/pagamento acompanham o pedido por qualquer caminho e avisos de cada etapa
async function flowCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload, calls, reset }) {
  console.log('\nFluxo pedido → entrega');
  const courier2User = '00000000-0000-0000-0000-00000000000e';
  await db.query(`INSERT INTO auth.users VALUES ($1, 'moto2@x.com', '{"full_name":"Moto Dois","phone":"11900000003"}', now())`, [courier2User]);
  await db.query(`UPDATE profiles SET role = 'DELIVERY' WHERE id = $1`, [courier2User]);
  const courier2 = (await one(`INSERT INTO couriers (user_id, full_name, phone, whatsapp) VALUES ($1, 'Moto Dois', '11900000003', '11900000003') RETURNING id`, [courier2User])).id;
  await as(courier2User, `SELECT public.register_push_subscription($1, $2, $3)`, ['https://fcm.googleapis.com/fcm/send/aparelho-moto2', 'B'.repeat(87), 'a'.repeat(22)]);
  const newOrder = async (extra = {}) => (await as(ids.ana, `SELECT public.create_order($1::jsonb) AS o`, [payload({ client_request_id: randomUUID(), ...extra })])).rows[0].o.order_id;
  const status = (id, s, who = ids.admin, reason = null) => as(who, `SELECT public.update_order_status($1, $2, $3)`, [id, s, reason]);
  const delivery = (id) => one(`SELECT status, picked_up_at, delivered_at, payment_collected FROM deliveries WHERE order_id = $1`, [id]);
  const counter = async (cid) => Number((await one(`SELECT completed_deliveries_count AS n FROM couriers WHERE id = $1`, [cid])).n);
  const to = (c, uid) => c.filter((b) => b.user_ids.includes(uid));

  // Pagamento online pendente não chama entregador
  await db.query(`UPDATE store_settings SET payment_demo_mode = TRUE`);
  const pix = await newOrder({ payment_method: 'PIX_ONLINE' });
  await expectFail('Pix não pago: não atribui entregador', ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [pix, courierId]);
  await as(ids.ana, `SELECT public.demo_approve_payment($1)`, [pix]);
  await expectOk('Pix aprovado: atribui normalmente', ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [pix, courierId]);
  await db.query(`UPDATE store_settings SET payment_demo_mode = FALSE`);

  // Atribuição antecipada, troca de entregador e aviso de pronto
  const a = await newOrder();
  await status(a, 'CONFIRMADO');
  await status(a, 'EM_PREPARACAO');
  await reset();
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [a, courierId]);
  let c = await calls();
  /aguarde: avisamos quando estiver pronto/.test(to(c, ids.courier)[0]?.body) ? ok('atribuído antes de ficar pronto: entregador sabe que deve aguardar') : bad('antecipado: ' + JSON.stringify(c));
  await reset();
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [a, courier2]);
  c = await calls();
  /passada para outro entregador/.test(to(c, ids.courier)[0]?.title) ? ok('troca: o entregador anterior é avisado') : bad('troca anterior: ' + JSON.stringify(c));
  /Nova entrega/.test(to(c, courier2User)[0]?.title) ? ok('troca: o novo entregador é acionado') : bad('troca novo: ' + JSON.stringify(c));
  await reset();
  await status(a, 'PRONTO');
  c = await calls();
  c.length === 1 && to(c, courier2User).length === 1 && /pronto para retirar/.test(c[0].title)
    ? ok('pronto: chama o entregador atribuído para retirar') : bad('pronto: ' + JSON.stringify(c));

  // Admin faz as etapas no lugar do entregador: entrega e pagamento acompanham
  const before2 = await counter(courier2);
  await status(a, 'EM_ENTREGA');
  let d = await delivery(a);
  d?.status === 'EM_ROTA' && d.picked_up_at ? ok('admin despachou: entrega em rota com horário de saída') : bad('despacho admin: ' + JSON.stringify(d));
  await status(a, 'CONCLUIDO');
  d = await delivery(a);
  const pa = await one(`SELECT o.payment_status AS o, p.status AS p FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`, [a]);
  d?.status === 'ENTREGUE' && d.delivered_at && d.payment_collected ? ok('admin concluiu: entrega ENTREGUE, com horário e valor recebido') : bad('conclusão admin: ' + JSON.stringify(d));
  pa?.o === 'PAGO_NA_ENTREGA' && pa.p === 'PAGO_NA_ENTREGA' ? ok('pagamento na entrega fica como recebido no pedido e no pagamento') : bad('pagamento: ' + JSON.stringify(pa));
  (await counter(courier2)) === before2 + 1 ? ok('entrega contada para o entregador (uma vez)') : bad('contador admin: ' + (await counter(courier2)));

  // Caminho do entregador: conta uma vez só
  const b = await newOrder();
  for (const s of ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO']) await status(b, s);
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [b, courierId]);
  const before1 = await counter(courierId);
  await as(ids.courier, `SELECT public.courier_update_delivery($1, 'PICKUP')`, [b]);
  await expectFail('entregador não conclui sem confirmar o recebimento', ids.courier, `SELECT public.courier_update_delivery($1, 'DELIVERED', false)`, [b]);
  await as(ids.courier, `SELECT public.courier_update_delivery($1, 'DELIVERED', true)`, [b]);
  (await counter(courierId)) === before1 + 1 ? ok('pelo app do entregador também conta uma vez só') : bad('contador entregador: ' + (await counter(courierId)));
  d = await delivery(b);
  d?.status === 'ENTREGUE' && d.payment_collected ? ok('entrega do app: ENTREGUE e valor recebido') : bad('entrega app: ' + JSON.stringify(d));

  // Cancelamentos avisam quem estava no pedido
  const cOrder = await newOrder();
  for (const s of ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO']) await status(cOrder, s);
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [cOrder, courierId]);
  await as(ids.courier, `SELECT public.courier_update_delivery($1, 'PICKUP')`, [cOrder]);
  await reset();
  await status(cOrder, 'CANCELADO', ids.admin, 'Cliente não atende');
  c = await calls();
  const cc = to(c, ids.courier)[0];
  /cancelada/.test(cc?.title) && /Cliente não atende · fale com a loja/.test(cc?.body) ? ok('cancelado em rota: entregador avisado com o motivo') : bad('cancelado em rota: ' + JSON.stringify(c));
  (await delivery(cOrder))?.status === 'CANCELADA' ? ok('entrega cancelada junto') : bad('entrega não cancelou');
  const kOrder = await newOrder();
  await status(kOrder, 'CONFIRMADO');
  await status(kOrder, 'EM_PREPARACAO');
  await reset();
  await status(kOrder, 'CANCELADO', ids.admin, 'Sem ingrediente');
  c = await calls();
  to(c, ids.kitchen).some((x) => /cancelado/.test(x.title)) ? ok('cancelado em preparo: cozinha avisada') : bad('cozinha cancel: ' + JSON.stringify(c));

  // Retirada no balcão paga na hora
  const p = await newOrder({ fulfillment_type: 'PICKUP', delivery_address: null });
  for (const s of ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO', 'AGUARDANDO_RETIRADA', 'CONCLUIDO']) await status(p, s, ids.kitchen);
  const pp = await one(`SELECT o.status, o.payment_status AS o_pay, p.status AS p_pay FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`, [p]);
  pp?.status === 'CONCLUIDO' && pp.o_pay === 'PAGO_NA_ENTREGA' && pp.p_pay === 'PAGO_NA_ENTREGA'
    ? ok('retirada concluída pela cozinha: pagamento no balcão fica como recebido') : bad('retirada: ' + JSON.stringify(pp));

  await securityCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload, newOrder, status });
}

// Foto do entregador, código de entrega e cupons
async function securityCases({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, payload, newOrder, status }) {
  console.log('\nFoto do entregador');
  const photo = 'https://proj.supabase.co/storage/v1/object/public/courier-photos/abc.jpg';
  await db.query(`UPDATE couriers SET photo_url = $1 WHERE id = $2`, [photo, courierId]);
  const x = await newOrder();
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [x, courierId]);
  (await one(`SELECT assigned_courier_photo_url AS p FROM orders WHERE id = $1`, [x])).p === photo
    ? ok('foto do entregador gravada no pedido ao atribuir') : bad('foto não gravada');
  let r = await as(ids.ana, `SELECT assigned_courier_photo_url AS p FROM orders WHERE id = $1`, [x]);
  r.rows[0]?.p === photo ? ok('cliente vê a foto de quem vai entregar') : bad('cliente sem foto: ' + JSON.stringify(r.rows));

  console.log('\nCódigo de entrega');
  r = await as(ids.admin, `SELECT public.admin_delivery_code($1) AS c`, [x]);
  r.rows[0].c.exists === false ? ok('sem código até o admin gerar') : bad('código antes de gerar');
  await expectFail('entregador não gera nem vê o código pelo admin', ids.courier, `SELECT public.admin_delivery_code($1, true)`, [x]);
  r = await expectOk('admin gera o código', ids.admin, `SELECT public.admin_delivery_code($1, true) AS c`, [x]);
  const code = r?.rows[0]?.c?.code;
  /^\d{4}$/.test(code) ? ok('código de 4 dígitos: ' + code) : bad('código: ' + code);
  (await one(`SELECT delivery_code_required AS q FROM orders WHERE id = $1`, [x])).q === true ? ok('pedido marcado como "exige código"') : bad('sem marca');
  r = await as(ids.admin, `SELECT public.admin_delivery_code($1, true) AS c`, [x]);
  r.rows[0].c.code === code ? ok('gerar de novo mostra o mesmo código') : bad('código mudou');
  await expectFail('entregador não lê a tabela de códigos', ids.courier, `SELECT * FROM order_delivery_codes`);
  await expectFail('cliente não lê a tabela de códigos direto', ids.ana, `SELECT * FROM order_delivery_codes`);
  r = await as(ids.ana, `SELECT public.get_delivery_code($1) AS c`, [x]);
  r.rows[0].c?.code === code ? ok('cliente dono do pedido vê o código') : bad('cliente: ' + JSON.stringify(r.rows[0].c));
  for (const [who, uid] of [['entregador', ids.courier], ['cozinha', ids.kitchen], ['outra cliente', ids.bia]]) {
    r = await as(uid, `SELECT public.get_delivery_code($1) AS c`, [x]);
    r.rows[0].c === null ? ok(`${who} não vê o código`) : bad(`${who} viu: ` + JSON.stringify(r.rows[0].c));
  }

  for (const s of ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO']) await status(x, s);
  await as(ids.courier, `SELECT public.courier_update_delivery($1, 'PICKUP')`, [x]);
  const deliver = (id, codeArg, note) => as(ids.courier, `SELECT public.courier_update_delivery($1, 'DELIVERED', true, $2, $3) AS r`, [id, codeArg, note]);
  // Conferência só do código (antes do pagamento)
  r = await as(ids.courier, `SELECT public.courier_check_delivery_code($1, $2) AS r`, [x, code === '0000' ? '2222' : '0000']);
  r.rows[0].r.success === false && /tentativa 1 de 5/.test(r.rows[0].r.error) ? ok('conferir código errado antes de receber: avisa e conta a tentativa') : bad('check errado: ' + JSON.stringify(r.rows[0].r));
  r = await as(ids.courier, `SELECT public.courier_check_delivery_code($1, $2) AS r`, [x, code]);
  r.rows[0].r.success && (await one(`SELECT status FROM orders WHERE id = $1`, [x])).status === 'EM_ENTREGA'
    ? ok('conferir código certo não conclui sozinho (falta o pagamento)') : bad('check certo: ' + JSON.stringify(r.rows[0].r));
  await expectFail('outro entregador não confere código de entrega alheia', ids.ana, `SELECT public.courier_check_delivery_code($1, '1234')`, [x]);
  await db.query(`UPDATE order_delivery_codes SET failed_attempts = 0 WHERE order_id = $1`, [x]);
  r = await deliver(x, null, null);
  r.rows[0].r.success === false && /digite o código/.test(r.rows[0].r.error) ? ok('sem código nem observação: não conclui') : bad('concluiu sem código: ' + JSON.stringify(r.rows[0].r));
  const wrong = code === '0000' ? '1111' : '0000';
  r = await deliver(x, wrong, null);
  r.rows[0].r.success === false && /tentativa 1 de 5/.test(r.rows[0].r.error) ? ok('código errado: ' + r.rows[0].r.error) : bad('errado: ' + JSON.stringify(r.rows[0].r));
  (await one(`SELECT status FROM orders WHERE id = $1`, [x])).status === 'EM_ENTREGA' ? ok('pedido continua em rota') : bad('mudou de status com código errado');
  (await one(`SELECT failed_attempts AS n FROM order_delivery_codes WHERE order_id = $1`, [x])).n === 1 ? ok('tentativa errada fica contada') : bad('tentativa não contada');
  r = await deliver(x, code, null);
  r.rows[0].r.success && (await one(`SELECT status FROM orders WHERE id = $1`, [x])).status === 'CONCLUIDO' ? ok('código certo: entrega concluída') : bad('código certo: ' + JSON.stringify(r.rows[0].r));
  (await one(`SELECT verified_at FROM order_delivery_codes WHERE order_id = $1`, [x])).verified_at ? ok('horário da confirmação registrado') : bad('sem horário');
  r = await as(ids.admin, `SELECT reason FROM order_status_history WHERE order_id = $1 AND new_status = 'CONCLUIDO'`, [x]);
  /com o código do cliente/.test(r.rows[0]?.reason) ? ok('linha do tempo: "confirmada com o código do cliente"') : bad('histórico: ' + JSON.stringify(r.rows));

  const y = await newOrder();
  await as(ids.admin, `SELECT public.admin_delivery_code($1, true)`, [y]);
  for (const s of ['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO']) await status(y, s);
  await as(ids.admin, `SELECT public.admin_assign_courier($1, $2)`, [y, courierId]);
  await as(ids.courier, `SELECT public.courier_update_delivery($1, 'PICKUP')`, [y]);
  const codeY = (await one(`SELECT code FROM order_delivery_codes WHERE order_id = $1`, [y])).code;
  const wrongY = codeY === '9999' ? '8888' : '9999';
  for (let i = 0; i < 5; i++) r = await deliver(y, wrongY, null);
  r.rows[0].r.locked ? ok('5 erros: bloqueia novas tentativas') : bad('não bloqueou: ' + JSON.stringify(r.rows[0].r));
  r = await deliver(y, codeY, null);
  r.rows[0].r.success === false && /Muitas tentativas/.test(r.rows[0].r.error) ? ok('bloqueado: nem o código certo passa (evita chute)') : bad('passou bloqueado');
  r = await deliver(y, null, 'ok');
  r.rows[0].r.success === false ? ok('observação curta demais não libera') : bad('liberou com "ok"');
  r = await deliver(y, null, 'Cliente esqueceu o celular, confirmou nome e endereço');
  r.rows[0].r.success ? ok('liberado sem código com observação') : bad('sem código: ' + JSON.stringify(r.rows[0].r));
  const dy = await one(`SELECT d.notes, c.override_note, o.status FROM deliveries d JOIN order_delivery_codes c USING (order_id) JOIN orders o ON o.id = d.order_id WHERE d.order_id = $1`, [y]);
  dy?.status === 'CONCLUIDO' && /Liberado sem código: Cliente esqueceu/.test(dy.notes) && dy.override_note ? ok('observação gravada na entrega') : bad('observação: ' + JSON.stringify(dy));
  (await one(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'DELIVERY_WITHOUT_CODE' AND entity_id = $1`, [y])).n === 1 ? ok('liberação sem código fica na auditoria') : bad('sem auditoria');

  await db.query(`UPDATE store_settings SET delivery_code_auto = TRUE`);
  const z = await newOrder();
  await status(z, 'CONFIRMADO');
  (await one(`SELECT delivery_code_required AS q FROM orders WHERE id = $1`, [z])).q === true && (await one(`SELECT count(*)::int AS n FROM order_delivery_codes WHERE order_id = $1`, [z])).n === 1
    ? ok('automático: código criado ao confirmar o pedido de entrega') : bad('automático não criou');
  const pk = await newOrder({ fulfillment_type: 'PICKUP', delivery_address: null });
  await status(pk, 'CONFIRMADO');
  (await one(`SELECT count(*)::int AS n FROM order_delivery_codes WHERE order_id = $1`, [pk])).n === 0 ? ok('automático: retirada no balcão não ganha código') : bad('retirada ganhou código');
  await db.query(`UPDATE store_settings SET delivery_code_auto = FALSE`);

  console.log('\nCupons');
  const validate = async (code, phone = null, subtotal = null) => (await as(null, `SELECT public.validate_coupon($1, $2, $3) AS v`, [code, phone, subtotal])).rows[0].v;
  let v = await validate('bemvindo20', '(11) 98888-1111');
  !v.ok && /primeiro pedido/.test(v.error) ? ok('BEMVINDO20 recusado para quem já pediu: ' + v.error) : bad('primeiro pedido: ' + JSON.stringify(v));
  v = await validate('BEMVINDO20', '+55 11 98888-1111');
  !v.ok ? ok('mesmo telefone em outro formato também é reconhecido') : bad('formato burlou');
  v = await validate(' bemvindo20 ', '11 91234-0000');
  v.ok && v.percent_off === 20 ? ok('cliente novo: cupom válido (20%), sem diferenciar maiúsculas/espaços') : bad('cliente novo: ' + JSON.stringify(v));
  v = await validate('NAOEXISTE');
  !v.ok ? ok('cupom inexistente: ' + v.error) : bad('inexistente passou');
  await expectFail('o mesmo telefone em outro formato não burla o "primeiro pedido" ao finalizar', null, `SELECT public.create_order($1::jsonb)`,
    [payload({ client_request_id: (await import('crypto')).randomUUID(), coupon_code: 'BEMVINDO20', customer_phone: '+55 (11) 98888-1111' })]);

  await expectFail('cliente não cria cupom', ids.ana, `INSERT INTO coupons (code, percent_off) VALUES ('GRATIS', 100)`);
  r = await as(null, `SELECT count(*)::int AS n FROM coupons`).catch((e) => ({ rows: [{ n: 'erro: ' + e.message.split('\n')[0] }] }));
  r.rows[0].n === 0 || String(r.rows[0].n).startsWith('erro') ? ok('visitante não lista os cupons') : bad('visitante listou cupons');
  await expectOk('admin cria cupom do dia', ids.admin,
    `INSERT INTO coupons (code, description, percent_off, expires_at, max_redemptions, min_order_cents) VALUES ('HOJE10', 'Promo do dia', 10, now() + interval '3 hours', 1, 1000)`);
  v = await validate('HOJE10', null, 500);
  !v.ok && /a partir de R\$ 10,00/.test(v.error) ? ok('pedido mínimo do cupom: ' + v.error) : bad('mínimo: ' + JSON.stringify(v));
  v = await validate('hoje10', null, 5000);
  v.ok && v.percent_off === 10 ? ok('cupom do dia válido acima do mínimo') : bad('cupom do dia: ' + JSON.stringify(v));
  r = await expectOk('pedido com o cupom do dia', ids.bia, `SELECT public.create_order($1::jsonb) AS o`,
    [payload({ client_request_id: (await import('crypto')).randomUUID(), coupon_code: 'hoje10', customer_name: 'Bia Lima', customer_phone: '11977772222' })]);
  const withCoupon = await one(`SELECT coupon_code, discount_cents, subtotal_cents FROM orders WHERE id = $1`, [r?.rows[0]?.o?.order_id]);
  withCoupon?.coupon_code === 'HOJE10' && Number(withCoupon.discount_cents) === Math.round(Number(withCoupon.subtotal_cents) * 0.1)
    ? ok('desconto de 10% aplicado pelo servidor') : bad('desconto: ' + JSON.stringify(withCoupon));
  v = await validate('HOJE10', null, 5000);
  !v.ok && /limite de usos/.test(v.error) ? ok('limite de 1 uso atingido') : bad('limite: ' + JSON.stringify(v));
  await db.query(`INSERT INTO coupons (code, percent_off, expires_at) VALUES ('ONTEM', 15, now() - interval '1 hour')`);
  v = await validate('ONTEM');
  !v.ok && /expirou/.test(v.error) ? ok('cupom vencido: ' + v.error) : bad('vencido: ' + JSON.stringify(v));
  await as(ids.admin, `UPDATE coupons SET is_active = false WHERE code = 'BEMVINDO20'`);
  v = await validate('BEMVINDO20', '11 91234-0000');
  !v.ok ? ok('cupom desativado pelo admin deixa de valer') : bad('desativado passou');
  await as(ids.admin, `UPDATE coupons SET is_active = true WHERE code = 'BEMVINDO20'`);
  (await one(`SELECT count(*)::int AS n FROM audit_logs WHERE entity_type = 'coupons'`)).n >= 3
    ? ok('criação e alteração de cupons ficam na auditoria (uso em pedido não)') : bad('auditoria de cupons');
}

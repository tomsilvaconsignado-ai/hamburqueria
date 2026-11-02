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
}

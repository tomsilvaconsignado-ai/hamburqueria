// Modelos dos documentos impressos. Todo texto variável passa por esc().
import type { Order, StoreSettings } from '../../types';
import type { CashClosing, CustomerRow, Report } from '../../services/admin.service';
import { formatCentsToBRL as brl } from '../formatters/currency';
import { formatDateTimeBR } from '../formatters/date';
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL } from '../labels';
import { esc, printDocument, type PaperFormat } from './print';

type Store = Pick<StoreSettings, 'store_name' | 'phone' | 'address' | 'logo_path'>;

const dateBR = (ymd: string) => ymd.split('-').reverse().join('/');

function header(store: Store, title: string, subtitle = ''): string {
  return `
    <div class="doc-header">
      ${store.logo_path ? `<img src="${esc(store.logo_path)}" alt="">` : ''}
      <div>
        <p class="big">${esc(store.store_name)}</p>
        <p class="muted">${esc(store.address)}${store.phone ? ` · ${esc(store.phone)}` : ''}</p>
      </div>
    </div>
    <hr>
    <p class="bold">${esc(title)}</p>
    ${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}
    <p class="muted">Emitido em ${esc(formatDateTimeBR(new Date().toISOString()))}</p>
    <hr>`;
}

function customerBlock(order: Order): string {
  const a = order.delivery_address_snapshot;
  return `
    <p><span class="bold">Cliente:</span> ${esc(order.customer_name)}</p>
    <p><span class="bold">Telefone:</span> ${esc(order.customer_phone)}</p>
    <p><span class="bold">Tipo:</span> ${esc(FULFILLMENT_LABEL[order.fulfillment_type])}</p>
    ${a ? `<p><span class="bold">Endereço:</span> ${esc(a.street)}, ${esc(a.number)}${a.complement ? ` - ${esc(a.complement)}` : ''} · ${esc(a.neighborhood)}${a.city ? ` · ${esc(a.city)}/${esc(a.state)}` : ''}${a.postal_code ? ` · CEP ${esc(a.postal_code)}` : ''}</p>
         ${a.reference ? `<p><span class="bold">Referência:</span> ${esc(a.reference)}</p>` : ''}` : ''}`;
}

function itemsTable(order: Order, withPrices: boolean): string {
  const rows = order.items.map((i) => `
    <tr>
      <td>${i.quantity}x</td>
      <td>${esc(i.product_name_snapshot)}
        ${i.options.map((o) => `<br><span class="muted">+ ${esc(o.option_name_snapshot)}${o.quantity > 1 ? ` (${o.quantity}x)` : ''}</span>`).join('')}
        ${i.notes ? `<br><span class="bold">Obs: ${esc(i.notes)}</span>` : ''}
      </td>
      ${withPrices ? `<td class="right">${brl(i.unit_price_cents)}</td><td class="right">${brl(i.line_total_cents)}</td>` : ''}
    </tr>`).join('');
  return `<table>
    <thead><tr><th>Qtd</th><th>Item</th>${withPrices ? '<th class="right">Unit.</th><th class="right">Total</th>' : ''}</tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function totals(order: Order): string {
  return `<table>
    <tr><td>Subtotal</td><td class="right">${brl(order.subtotal_cents)}</td></tr>
    ${order.delivery_fee_cents ? `<tr><td>Taxa de entrega</td><td class="right">${brl(order.delivery_fee_cents)}</td></tr>` : ''}
    ${order.discount_cents ? `<tr><td>Desconto${order.coupon_code ? ` (${esc(order.coupon_code)})` : ''}</td><td class="right">-${brl(order.discount_cents)}</td></tr>` : ''}
    <tr><td class="big">Total</td><td class="right big">${brl(order.total_cents)}</td></tr>
  </table>`;
}

function payment(order: Order): string {
  return `
    <p><span class="bold">Pagamento:</span> ${esc(PAYMENT_METHOD_LABEL[order.payment_method])} · ${esc(PAYMENT_STATUS_LABEL[order.payment_status])}</p>
    ${order.cash_change_for_cents ? `<p><span class="bold">Troco para:</span> ${brl(order.cash_change_for_cents)} (levar ${brl(Math.max(0, order.cash_change_for_cents - order.total_cents))})</p>` : ''}`;
}

const orderMeta = (order: Order) =>
  `<p class="huge">${esc(order.order_number)}</p><p>${esc(formatDateTimeBR(order.created_at))} · ${esc(STATUS_LABEL[order.status])}</p>`;

// ---------------- DOCUMENTOS DE PEDIDO ----------------

export function printOrderReceipt(order: Order, store: Store, format: PaperFormat = 'thermal80') {
  return printDocument(`Comprovante ${order.order_number}`, `
    ${header(store, 'Comprovante de pedido')}
    ${orderMeta(order)}<hr>
    ${customerBlock(order)}<hr>
    ${itemsTable(order, true)}<hr>
    ${totals(order)}<hr>
    ${payment(order)}
    ${order.customer_notes ? `<hr><p><span class="bold">Observações:</span> ${esc(order.customer_notes)}</p>` : ''}
    <hr><p class="center muted">Documento sem valor fiscal.</p>`, format);
}

/** Comanda da cozinha: itens grandes, opcionais e observações; sem preços. */
export function printKitchenTicket(order: Order, store: Store, format: PaperFormat = 'thermal80') {
  return printDocument(`Comanda ${order.order_number}`, `
    <p class="center bold">COMANDA DE COZINHA · ${esc(store.store_name)}</p><hr>
    <p class="center huge">${esc(order.order_number)}</p>
    <p class="center">${esc(formatDateTimeBR(order.created_at))} · ${esc(FULFILLMENT_LABEL[order.fulfillment_type]).toUpperCase()}</p>
    <p class="center">Cliente: ${esc(order.customer_name)}</p><hr>
    <table>${order.items.map((i) => `
      <tr><td class="big" style="width:14%">${i.quantity}x</td>
      <td><span class="big">${esc(i.product_name_snapshot)}</span>
        ${i.options.map((o) => `<br>+ ${esc(o.option_name_snapshot)}${o.quantity > 1 ? ` (${o.quantity}x)` : ''}`).join('')}
        ${i.notes ? `<br><span class="bold">⚠ ${esc(i.notes)}</span>` : ''}</td></tr>`).join('')}
    </table>
    ${order.customer_notes ? `<hr><p class="bold">OBS DO PEDIDO: ${esc(order.customer_notes)}</p>` : ''}
    <hr><p class="center">Itens: ${order.items.reduce((s, i) => s + i.quantity, 0)}</p>`, format);
}

/** Recibo de entrega: o que cobrar, troco e linha de assinatura. */
export function printDeliveryReceipt(order: Order, store: Store, format: PaperFormat = 'thermal80') {
  const toCollect = order.payment_status === 'PAGAMENTO_NA_ENTREGA';
  return printDocument(`Recibo de entrega ${order.order_number}`, `
    ${header(store, 'Recibo de entrega')}
    ${orderMeta(order)}<hr>
    ${customerBlock(order)}<hr>
    ${itemsTable(order, false)}<hr>
    ${totals(order)}<hr>
    ${payment(order)}
    <p class="big">${toCollect ? `COBRAR NA ENTREGA: ${brl(order.total_cents)}` : 'PAGO — NÃO COBRAR'}</p>
    ${order.assigned_courier_name ? `<p><span class="bold">Entregador:</span> ${esc(order.assigned_courier_name)}</p>` : ''}
    <p class="sign">Recebi o pedido acima — assinatura do cliente</p>`, format);
}

export function printPaymentReceipt(order: Order, store: Store, format: PaperFormat = 'thermal80') {
  return printDocument(`Comprovante de pagamento ${order.order_number}`, `
    ${header(store, 'Comprovante de pagamento')}
    ${orderMeta(order)}<hr>
    <p><span class="bold">Cliente:</span> ${esc(order.customer_name)}</p>
    <p><span class="bold">Forma de pagamento:</span> ${esc(PAYMENT_METHOD_LABEL[order.payment_method])}</p>
    <p><span class="bold">Situação:</span> ${esc(PAYMENT_STATUS_LABEL[order.payment_status])}</p>
    <hr>${totals(order)}<hr>
    <p class="center muted">Documento sem valor fiscal.</p>`, format);
}

// ---------------- RELATÓRIOS (A4) ----------------

const card = (label: string, value: string) => `<div class="card"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
const table = (head: string[], rows: string[][], alignRight: number[] = []) => `
  <table><thead><tr>${head.map((h, i) => `<th${alignRight.includes(i) ? ' class="right"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td${alignRight.includes(i) ? ' class="right"' : ''}>${c}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${head.length}" class="muted">Nenhum dado no período.</td></tr>`}</tbody></table>`;

export const FINANCE_NOTE =
  'Faturamento considera pedidos concluídos. Bruto = produtos + taxas de entrega; líquido = bruto − descontos. ' +
  'Saldo = líquido − despesas lançadas; não é lucro: não inclui custo de mercadorias, impostos nem taxas de cartão que não foram lançados como despesa.';

export function printSalesReport(report: Report, store: Store, title: string) {
  const s = report.summary;
  const period = report.from === report.to ? dateBR(report.from) : `${dateBR(report.from)} a ${dateBR(report.to)}`;
  return printDocument(`${title} ${period}`, `
    ${header(store, title, `Período: ${period}`)}
    <div class="cards">
      ${card('Pedidos concluídos', String(s.orders_completed))}
      ${card('Faturamento bruto', brl(s.gross_cents))}
      ${card('Faturamento líquido', brl(s.net_cents))}
      ${card('Ticket médio', brl(s.avg_ticket_cents))}
      ${card('Taxas de entrega', brl(s.delivery_fees_cents))}
      ${card('Descontos', brl(s.discounts_cents))}
      ${card('Despesas', brl(s.expenses_cents))}
      ${card('Saldo do período', brl(s.balance_cents))}
      ${card('Cancelados', `${s.orders_cancelled} · ${brl(s.cancelled_cents)}`)}
      ${card('Em andamento', `${s.orders_in_progress} · ${brl(s.in_progress_cents)}`)}
      ${card('Clientes', `${s.unique_customers} (${s.returning_customers} recorrentes)`)}
      ${card('Entrega / retirada', `${s.delivery_count} / ${s.pickup_count}`)}
    </div>
    <h2>Vendas por forma de pagamento</h2>
    ${table(['Forma', 'Pedidos', 'Valor'], report.by_payment.map((p) => [esc(PAYMENT_METHOD_LABEL[p.method] ?? p.method), String(p.orders), brl(p.net_cents)]), [1, 2])}
    <h2>Vendas por categoria</h2>
    ${table(['Categoria', 'Itens', 'Valor'], report.by_category.map((c) => [esc(c.name), String(c.quantity), brl(c.revenue_cents)]), [1, 2])}
    <h2>Produtos mais vendidos</h2>
    ${table(['Produto', 'Qtd', 'Valor'], report.by_product.slice(0, 20).map((p) => [esc(p.name), String(p.quantity), brl(p.revenue_cents)]), [1, 2])}
    ${report.by_day.length > 1 ? `<h2>Vendas por dia</h2>
    ${table(['Dia', 'Pedidos', 'Líquido', 'Cancelados'], report.by_day.map((d) => [dateBR(d.date), String(d.orders), brl(d.net_cents), String(d.cancelled)]), [1, 2, 3])}` : ''}
    <h2>Despesas por categoria</h2>
    ${table(['Categoria', 'Valor'], report.expenses_by_category.map((e) => [esc(e.category), brl(e.amount_cents)]), [1])}
    ${report.cancellations.length ? `<h2>Cancelamentos</h2>
    ${table(['Pedido', 'Data', 'Motivo', 'Valor'], report.cancellations.map((c) => [esc(c.order_number), esc(formatDateTimeBR(c.created_at)), esc(c.reason ?? ''), brl(c.total_cents)]), [3])}` : ''}
    <p class="note">${esc(FINANCE_NOTE)}</p>`, 'a4');
}

export function printOrdersReport(orders: Order[], store: Store, subtitle: string) {
  const total = orders.filter((o) => o.status === 'CONCLUIDO').reduce((s, o) => s + o.total_cents, 0);
  return printDocument('Relatório de pedidos', `
    ${header(store, 'Relatório de pedidos', subtitle)}
    <p>${orders.length} pedido(s) · concluídos: ${brl(total)}</p>
    ${table(['Pedido', 'Data', 'Cliente', 'Tipo', 'Pagamento', 'Status', 'Total'], orders.map((o) => [
      esc(o.order_number), esc(formatDateTimeBR(o.created_at)), esc(o.customer_name), esc(FULFILLMENT_LABEL[o.fulfillment_type]),
      esc(PAYMENT_METHOD_LABEL[o.payment_method]), esc(STATUS_LABEL[o.status]), brl(o.total_cents),
    ]), [6])}`, 'a4');
}

export function printCustomersReport(customers: CustomerRow[], store: Store, subtitle: string) {
  return printDocument('Relatório de clientes', `
    ${header(store, 'Relatório de clientes', subtitle)}
    <p>${customers.length} cliente(s)</p>
    ${table(['Cliente', 'Telefone', 'Pedidos', 'Total gasto', 'Ticket médio', 'Última compra', 'Marcadores'], customers.map((c) => [
      esc(c.full_name || '—'), esc(c.phone), String(c.completed_count), brl(c.total_spent_cents), brl(c.avg_ticket_cents),
      c.last_order_at ? esc(formatDateTimeBR(c.last_order_at)) : '—',
      esc([c.is_vip && 'VIP', c.is_frequent && 'Frequente', c.is_inactive && 'Inativo', c.birthday_this_month && 'Aniversário'].filter(Boolean).join(', ')),
    ]), [2, 3, 4])}
    <p class="note">Dados pessoais de clientes: uso restrito ao atendimento (LGPD). Não compartilhe este documento.</p>`, 'a4');
}

export function printCashClosing(c: CashClosing, store: Store) {
  const s = c.summary.report.summary;
  return printDocument(`Fechamento de caixa ${dateBR(c.business_date)}`, `
    ${header(store, 'Fechamento de caixa', `Dia ${dateBR(c.business_date)} · fechado em ${formatDateTimeBR(c.closed_at)}`)}
    <h2>Dinheiro em caixa</h2>
    ${table(['Item', 'Valor'], [
      ['Troco inicial', brl(c.opening_cash_cents)],
      ['(+) Vendas em dinheiro concluídas', brl(c.summary.cash_sales_cents)],
      ['(−) Despesas pagas em dinheiro', brl(c.summary.cash_expenses_cents)],
      ['<b>(=) Esperado em caixa</b>', `<b>${brl(c.expected_cash_cents)}</b>`],
      ['Contado', brl(c.counted_cash_cents)],
      [`<b>Diferença (${c.difference_cents === 0 ? 'caixa batendo' : c.difference_cents > 0 ? 'sobra' : 'falta'})</b>`, `<b>${brl(c.difference_cents)}</b>`],
    ], [1])}
    <h2>Resumo do dia</h2>
    <div class="cards">
      ${card('Pedidos concluídos', String(s.orders_completed))}
      ${card('Faturamento líquido', brl(s.net_cents))}
      ${card('Ticket médio', brl(s.avg_ticket_cents))}
      ${card('Cancelados', String(s.orders_cancelled))}
    </div>
    ${table(['Forma de pagamento', 'Pedidos', 'Valor'], c.summary.report.by_payment.map((p) => [esc(PAYMENT_METHOD_LABEL[p.method] ?? p.method), String(p.orders), brl(p.net_cents)]), [1, 2])}
    ${c.notes ? `<p><b>Observações:</b> ${esc(c.notes)}</p>` : ''}
    <p class="sign">Responsável pelo fechamento</p>`, 'a4');
}

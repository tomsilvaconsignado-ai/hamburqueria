// Comunicação por WhatsApp.
//
// Hoje: links wa.me (gratuitos). O botão ABRE o WhatsApp com a mensagem pronta e quem
// atende toca em "enviar"; nada é enviado automaticamente, e a interface deixa isso claro.
//
// Futuro (WhatsApp Cloud API da Meta): implemente outro MessageChannel que chame uma
// Edge Function no servidor (o token da Meta nunca vai para o navegador). As telas usam
// apenas buildOrderMessage + o canal, então a troca não muda os componentes.

import type { Order, OrderStatus } from '../types';
import { formatCentsToBRL } from './formatters/currency';

export type OrderMessageKind = 'SUMMARY' | 'CONFIRMED' | 'PREPARING' | 'OUT_FOR_DELIVERY' | 'READY_FOR_PICKUP' | 'COMPLETED';

export const MESSAGE_LABELS: Record<OrderMessageKind, string> = {
  SUMMARY: 'Resumo do pedido',
  CONFIRMED: 'Pedido confirmado',
  PREPARING: 'Em preparação',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  READY_FOR_PICKUP: 'Pronto para retirada',
  COMPLETED: 'Pedido concluído',
};

/** Telefone brasileiro em formato internacional só com dígitos (55 + DDD + número). */
export function toWhatsAppNumber(phone?: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length >= 12 && digits.startsWith('55')) return digits;
  return `55${digits.slice(-11)}`;
}

export function waLink(phone: string | undefined, text?: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

function addressLine(order: Order): string {
  const a = order.delivery_address_snapshot;
  if (!a) return '';
  return [`${a.street}, ${a.number}`, a.complement, a.neighborhood, a.city && `${a.city}/${a.state}`].filter(Boolean).join(' - ');
}

function itemsLines(order: Order): string {
  return order.items.map((i) => `• ${i.quantity}x ${i.product_name_snapshot} (${formatCentsToBRL(i.line_total_cents)})`).join('\n');
}

/** Mensagem pronta para cada etapa, com número, valor e endereço do pedido. */
export function buildOrderMessage(order: Order, kind: OrderMessageKind, storeName = 'Burger Hub'): string {
  const first = order.customer_name.split(' ')[0] || order.customer_name;
  const total = formatCentsToBRL(order.total_cents);
  const address = addressLine(order);
  const head = `Olá, ${first}! Aqui é da *${storeName}*.`;
  switch (kind) {
    case 'SUMMARY':
      return [
        head,
        `Resumo do seu pedido *${order.order_number}*:`,
        itemsLines(order),
        order.discount_cents ? `Desconto: -${formatCentsToBRL(order.discount_cents)}` : '',
        order.delivery_fee_cents ? `Taxa de entrega: ${formatCentsToBRL(order.delivery_fee_cents)}` : '',
        `*Total: ${total}*`,
        order.fulfillment_type === 'DELIVERY' && address ? `Entrega em: ${address}` : 'Retirada no balcão.',
      ].filter(Boolean).join('\n');
    case 'CONFIRMED':
      return `${head}\nSeu pedido *${order.order_number}* foi *confirmado* ✅\nTotal: ${total}.${order.fulfillment_type === 'DELIVERY' && address ? `\nEntrega em: ${address}` : ''}`;
    case 'PREPARING':
      return `${head}\nSeu pedido *${order.order_number}* já está *em preparação* 🍔🔥`;
    case 'OUT_FOR_DELIVERY':
      return `${head}\nSeu pedido *${order.order_number}* *saiu para entrega* 🛵${order.assigned_courier_name ? `\nEntregador: ${order.assigned_courier_name}` : ''}${address ? `\nEndereço: ${address}` : ''}\nTotal: ${total}.`;
    case 'READY_FOR_PICKUP':
      return `${head}\nSeu pedido *${order.order_number}* está *pronto para retirada* no balcão 🛍️\nTotal: ${total}.`;
    case 'COMPLETED':
      return `${head}\nSeu pedido *${order.order_number}* foi *concluído*. Obrigado pela preferência! 💛`;
  }
}

/** Mensagem que combina com o status atual (sugestão padrão no painel). */
export function suggestedMessageFor(status: OrderStatus, fulfillment: Order['fulfillment_type']): OrderMessageKind {
  switch (status) {
    case 'CONFIRMADO':
      return 'CONFIRMED';
    case 'EM_PREPARACAO':
      return 'PREPARING';
    case 'PRONTO':
    case 'AGUARDANDO_RETIRADA':
      return fulfillment === 'PICKUP' ? 'READY_FOR_PICKUP' : 'PREPARING';
    case 'EM_ENTREGA':
      return 'OUT_FOR_DELIVERY';
    case 'CONCLUIDO':
      return 'COMPLETED';
    default:
      return 'SUMMARY';
  }
}

export interface MessageChannel {
  /** true = a mensagem sai sozinha (API); false = só abre o app para a pessoa enviar. */
  readonly automatic: boolean;
  send(phone: string, text: string): Promise<{ opened: boolean; error?: string }>;
}

/** Canal atual: abre o WhatsApp (Web ou app) em nova aba com o texto pronto. */
export const waMeChannel: MessageChannel = {
  automatic: false,
  async send(phone, text) {
    const url = waLink(phone, text);
    if (!url) return { opened: false, error: 'Telefone inválido para WhatsApp.' };
    window.open(url, '_blank', 'noopener,noreferrer');
    return { opened: true };
  },
};

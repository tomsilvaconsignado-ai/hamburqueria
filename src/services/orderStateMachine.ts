import { FulfillmentType, Order, OrderStatus, UserRole } from '../types';

/**
 * Máquina de estados do pedido. Espelha `order_transition_allowed` e
 * `update_order_status` da migração 20261024000000 — o banco é quem decide de fato;
 * aqui serve para o modo demonstração e para a UI exibir apenas ações válidas.
 */
export function isTransitionAllowed(from: OrderStatus, to: OrderStatus, fulfillment: FulfillmentType): boolean {
  if (from === 'CONCLUIDO' || from === 'CANCELADO') return false;
  if (to === 'CANCELADO') return true;
  switch (from) {
    case 'AGUARDANDO_CONFIRMACAO':
      return to === 'CONFIRMADO';
    case 'CONFIRMADO':
      return to === 'EM_PREPARACAO';
    case 'EM_PREPARACAO':
      return to === 'PRONTO';
    case 'PRONTO':
      return fulfillment === 'PICKUP' ? to === 'AGUARDANDO_RETIRADA' : to === 'EM_ENTREGA';
    case 'AGUARDANDO_RETIRADA':
    case 'EM_ENTREGA':
      return to === 'CONCLUIDO';
    default:
      return false;
  }
}

/** Próximo passo "natural" do pedido no fluxo operacional. */
export function getNextStatus(order: Pick<Order, 'status' | 'fulfillment_type'>): OrderStatus | null {
  switch (order.status) {
    case 'AGUARDANDO_CONFIRMACAO':
      return 'CONFIRMADO';
    case 'CONFIRMADO':
      return 'EM_PREPARACAO';
    case 'EM_PREPARACAO':
      return 'PRONTO';
    case 'PRONTO':
      return order.fulfillment_type === 'PICKUP' ? 'AGUARDANDO_RETIRADA' : 'EM_ENTREGA';
    case 'AGUARDANDO_RETIRADA':
    case 'EM_ENTREGA':
      return 'CONCLUIDO';
    default:
      return null;
  }
}

export function isOnlinePayment(order: Pick<Order, 'payment_method'>): boolean {
  return order.payment_method === 'PIX_ONLINE' || order.payment_method === 'CARD_ONLINE';
}

/** Valida transição + regras de negócio. Retorna mensagem de erro ou null. */
export function validateStatusChange(
  order: Order,
  to: OrderStatus,
  actorRole: UserRole,
  reason?: string
): string | null {
  if (!isTransitionAllowed(order.status, to, order.fulfillment_type)) {
    return `Transição de status inválida: ${order.status} → ${to}.`;
  }
  if (to === 'CONFIRMADO' && isOnlinePayment(order) && order.payment_status !== 'PAGO') {
    return 'Pedido com pagamento online só pode ser confirmado após aprovação do pagamento.';
  }
  if (to === 'EM_ENTREGA' && !order.assigned_courier_id) {
    return 'Atribua um entregador antes de despachar o pedido.';
  }

  switch (actorRole) {
    case 'ADMIN':
      if (to === 'CANCELADO' && (!reason || reason.trim().length < 3)) {
        return 'O motivo do cancelamento é obrigatório.';
      }
      return null;
    case 'KITCHEN':
      if (['CONFIRMADO', 'EM_PREPARACAO', 'PRONTO', 'AGUARDANDO_RETIRADA'].includes(to)) return null;
      if (to === 'CONCLUIDO' && order.status === 'AGUARDANDO_RETIRADA') return null;
      return 'A cozinha não tem permissão para esta alteração de status.';
    case 'DELIVERY':
      return to === 'EM_ENTREGA' || to === 'CONCLUIDO' ? null : 'O entregador só pode iniciar ou concluir entregas.';
    case 'CUSTOMER':
      if (to === 'CANCELADO' && (order.status === 'AGUARDANDO_CONFIRMACAO' || order.status === 'CONFIRMADO')) {
        return null;
      }
      return 'O pedido não pode mais ser cancelado pelo cliente. Fale com a loja.';
    default:
      return 'Acesso negado.';
  }
}

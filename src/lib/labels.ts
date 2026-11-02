// Rótulos em português usados na tela e nos documentos impressos (uma fonte só).
import type { FulfillmentType, OrderStatus, PaymentMethod, PaymentStatus } from '../types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  AGUARDANDO_CONFIRMACAO: 'Pedido recebido',
  CONFIRMADO: 'Confirmado',
  EM_PREPARACAO: 'Em preparação',
  PRONTO: 'Pronto',
  AGUARDANDO_RETIRADA: 'Aguardando retirada',
  EM_ENTREGA: 'Saiu para entrega',
  CONCLUIDO: 'Entregue / concluído',
  CANCELADO: 'Cancelado',
};

/** Cores por status (fundo + texto + borda), iguais em lista, quadro e detalhes. */
export const STATUS_STYLE: Record<OrderStatus, string> = {
  AGUARDANDO_CONFIRMACAO: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  CONFIRMADO: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  EM_PREPARACAO: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  PRONTO: 'bg-lime-500/15 text-lime-300 border-lime-500/40',
  AGUARDANDO_RETIRADA: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  EM_ENTREGA: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
  CONCLUIDO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  CANCELADO: 'bg-red-500/15 text-red-300 border-red-500/40',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX_ONLINE: 'PIX online',
  CARD_ONLINE: 'Cartão online',
  CARD_ON_DELIVERY: 'Cartão na entrega',
  CASH_ON_DELIVERY: 'Dinheiro',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDENTE: 'Pendente',
  EM_PROCESSAMENTO: 'Em processamento',
  PAGO: 'Pago',
  RECUSADO: 'Recusado',
  CANCELADO: 'Cancelado',
  REEMBOLSO_PENDENTE: 'Reembolso pendente',
  REEMBOLSADO: 'Reembolsado',
  PAGAMENTO_NA_ENTREGA: 'A receber na entrega',
  PAGO_NA_ENTREGA: 'Pago na entrega',
};

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  DELIVERY: 'Entrega',
  PICKUP: 'Retirada no balcão',
};

export const EXPENSE_METHOD_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO: 'Cartão',
  BOLETO: 'Boleto',
  TRANSFERENCIA: 'Transferência',
  OUTRO: 'Outro',
};

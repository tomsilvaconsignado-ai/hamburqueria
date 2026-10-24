import { describe, expect, it } from 'vitest';
import { getNextStatus, isTransitionAllowed, validateStatusChange } from './orderStateMachine';
import { Order } from '../types';

const baseOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ord-1',
  order_number: '#BH-1',
  customer_name: 'Cliente',
  customer_phone: '11999999999',
  fulfillment_type: 'DELIVERY',
  status: 'AGUARDANDO_CONFIRMACAO',
  payment_status: 'PAGAMENTO_NA_ENTREGA',
  payment_method: 'CASH_ON_DELIVERY',
  subtotal_cents: 1000,
  discount_cents: 0,
  delivery_fee_cents: 0,
  total_cents: 1000,
  items: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('isTransitionAllowed', () => {
  it('segue o fluxo operacional', () => {
    expect(isTransitionAllowed('AGUARDANDO_CONFIRMACAO', 'CONFIRMADO', 'DELIVERY')).toBe(true);
    expect(isTransitionAllowed('CONFIRMADO', 'EM_PREPARACAO', 'DELIVERY')).toBe(true);
    expect(isTransitionAllowed('EM_PREPARACAO', 'PRONTO', 'DELIVERY')).toBe(true);
  });

  it('impede pular etapas', () => {
    expect(isTransitionAllowed('AGUARDANDO_CONFIRMACAO', 'CONCLUIDO', 'DELIVERY')).toBe(false);
    expect(isTransitionAllowed('CONFIRMADO', 'PRONTO', 'PICKUP')).toBe(false);
  });

  it('diferencia retirada e entrega após PRONTO', () => {
    expect(isTransitionAllowed('PRONTO', 'AGUARDANDO_RETIRADA', 'PICKUP')).toBe(true);
    expect(isTransitionAllowed('PRONTO', 'AGUARDANDO_RETIRADA', 'DELIVERY')).toBe(false);
    expect(isTransitionAllowed('PRONTO', 'EM_ENTREGA', 'DELIVERY')).toBe(true);
    expect(isTransitionAllowed('PRONTO', 'EM_ENTREGA', 'PICKUP')).toBe(false);
  });

  it('não altera pedidos finalizados', () => {
    expect(isTransitionAllowed('CONCLUIDO', 'CANCELADO', 'DELIVERY')).toBe(false);
    expect(isTransitionAllowed('CANCELADO', 'CONFIRMADO', 'DELIVERY')).toBe(false);
  });
});

describe('getNextStatus', () => {
  it('retorna o próximo passo de acordo com o tipo de atendimento', () => {
    expect(getNextStatus({ status: 'PRONTO', fulfillment_type: 'PICKUP' })).toBe('AGUARDANDO_RETIRADA');
    expect(getNextStatus({ status: 'PRONTO', fulfillment_type: 'DELIVERY' })).toBe('EM_ENTREGA');
    expect(getNextStatus({ status: 'CONCLUIDO', fulfillment_type: 'DELIVERY' })).toBeNull();
  });
});

describe('validateStatusChange', () => {
  it('bloqueia confirmação de pagamento online não aprovado', () => {
    const order = baseOrder({ payment_method: 'PIX_ONLINE', payment_status: 'PENDENTE' });
    expect(validateStatusChange(order, 'CONFIRMADO', 'ADMIN')).toMatch(/pagamento online/);
    expect(validateStatusChange({ ...order, payment_status: 'PAGO' }, 'CONFIRMADO', 'ADMIN')).toBeNull();
  });

  it('exige entregador para despachar', () => {
    const order = baseOrder({ status: 'PRONTO' });
    expect(validateStatusChange(order, 'EM_ENTREGA', 'ADMIN')).toMatch(/entregador/);
    expect(validateStatusChange({ ...order, assigned_courier_id: 'c1' }, 'EM_ENTREGA', 'ADMIN')).toBeNull();
  });

  it('exige motivo no cancelamento pelo admin', () => {
    expect(validateStatusChange(baseOrder(), 'CANCELADO', 'ADMIN')).toMatch(/motivo/);
    expect(validateStatusChange(baseOrder(), 'CANCELADO', 'ADMIN', 'Cliente desistiu')).toBeNull();
  });

  it('cliente só cancela antes do preparo', () => {
    expect(validateStatusChange(baseOrder(), 'CANCELADO', 'CUSTOMER')).toBeNull();
    expect(validateStatusChange(baseOrder({ status: 'EM_PREPARACAO' }), 'CANCELADO', 'CUSTOMER')).not.toBeNull();
    expect(validateStatusChange(baseOrder(), 'CONFIRMADO', 'CUSTOMER')).not.toBeNull();
  });

  it('cozinha não despacha nem cancela', () => {
    const ready = baseOrder({ status: 'PRONTO', assigned_courier_id: 'c1' });
    expect(validateStatusChange(ready, 'EM_ENTREGA', 'KITCHEN')).not.toBeNull();
    expect(validateStatusChange(baseOrder(), 'CANCELADO', 'KITCHEN', 'motivo')).not.toBeNull();
  });
});

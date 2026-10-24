import { beforeEach, describe, expect, it } from 'vitest';
import {
  IS_DEMO_MODE,
  assignCourierToOrder,
  createOrderSecure,
  getMyOrders,
  getOrderById,
  getProducts,
  initializeStorageIfEmpty,
  updateCourierDeliveryStatus,
  updateOrderStatus,
} from './storage';
import { CartItem, Product } from '../types';

const cartItem = (product: Product, overrides: Partial<CartItem> = {}): CartItem => ({
  id: `cart-${product.id}`,
  product,
  quantity: 1,
  selected_options: [],
  unit_price_cents: product.price_cents,
  total_price_cents: product.price_cents,
  ...overrides,
});

const address = {
  recipient_name: 'Ana',
  recipient_phone: '11988887777',
  postal_code: '01310-100',
  street: 'Rua Augusta',
  number: '100',
  neighborhood: 'Consolação',
  city: 'São Paulo',
  state: 'SP',
};

describe('backend de demonstração', () => {
  beforeEach(() => {
    localStorage.clear();
    initializeStorageIfEmpty();
  });

  it('roda em modo demonstração nos testes', () => {
    expect(IS_DEMO_MODE).toBe(true);
  });

  it('recalcula o preço dos opcionais pelo catálogo, ignorando o carrinho', async () => {
    const burger = getProducts().find((p) => p.id === 'prod-spioszek')!;
    const res = await createOrderSecure({
      customer_name: 'Ana',
      customer_phone: '11988887777',
      fulfillment_type: 'PICKUP',
      payment_method: 'CASH_ON_DELIVERY',
      items: [
        cartItem(burger, {
          selected_options: [
            // preço adulterado no navegador: deve ser ignorado
            { option_id: 'opt-extra-bacon', option_name_snapshot: 'Bacon', unit_price_delta_cents: 0, quantity: 1, line_total_cents: 0 },
          ],
        }),
      ],
    });
    expect(res.success).toBe(true);
    expect(res.order!.subtotal_cents).toBe(burger.price_cents + 650);
  });

  it('rejeita bairro fora das zonas de entrega', async () => {
    const burger = getProducts()[0];
    const res = await createOrderSecure({
      customer_name: 'Ana',
      customer_phone: '11988887777',
      fulfillment_type: 'DELIVERY',
      payment_method: 'CASH_ON_DELIVERY',
      delivery_address: { ...address, neighborhood: 'Bairro Inexistente' },
      items: [cartItem(burger, { quantity: 3 })],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/bairro/i);
  });

  it('pedido com PIX nasce pendente e não pode ser confirmado sem pagamento', async () => {
    const burger = getProducts()[0];
    const res = await createOrderSecure({
      customer_name: 'Ana',
      customer_phone: '11988887777',
      fulfillment_type: 'PICKUP',
      payment_method: 'PIX_ONLINE',
      items: [cartItem(burger)],
    });
    expect(res.order!.payment_status).toBe('PENDENTE');
    const confirm = await updateOrderStatus(res.order!.id, 'CONFIRMADO', 'ADMIN', 'Admin');
    expect(confirm.success).toBe(false);
  });

  it('fluxo completo de entrega com cobrança na porta', async () => {
    const burger = getProducts()[0];
    const { order } = await createOrderSecure({
      customer_name: 'Ana',
      customer_phone: '11988887777',
      fulfillment_type: 'DELIVERY',
      payment_method: 'CASH_ON_DELIVERY',
      delivery_address: address,
      items: [cartItem(burger, { quantity: 2 })],
    });
    const id = order!.id;

    expect((await updateOrderStatus(id, 'CONFIRMADO', 'KITCHEN', 'Chef')).success).toBe(true);
    expect((await updateOrderStatus(id, 'EM_PREPARACAO', 'KITCHEN', 'Chef')).success).toBe(true);
    expect((await updateOrderStatus(id, 'PRONTO', 'KITCHEN', 'Chef')).success).toBe(true);

    // Sem entregador atribuído não sai para entrega
    expect((await updateCourierDeliveryStatus(id, 'cour-1', 'PICKUP')).success).toBe(false);

    expect((await assignCourierToOrder(id, 'cour-1', 'Admin')).success).toBe(true);
    expect((await updateCourierDeliveryStatus(id, 'cour-2', 'PICKUP')).success).toBe(false);
    expect((await updateCourierDeliveryStatus(id, 'cour-1', 'PICKUP')).success).toBe(true);

    // Exige confirmação do recebimento do pagamento
    expect((await updateCourierDeliveryStatus(id, 'cour-1', 'DELIVERED', false)).success).toBe(false);
    expect((await updateCourierDeliveryStatus(id, 'cour-1', 'DELIVERED', true)).success).toBe(true);

    const done = getOrderById(id)!;
    expect(done.status).toBe('CONCLUIDO');
    expect(done.payment_status).toBe('PAGO_NA_ENTREGA');
  });

  it('lista apenas pedidos do próprio cliente ou criados neste navegador', async () => {
    const burger = getProducts()[0];
    const { order } = await createOrderSecure({
      customer_name: 'Ana',
      customer_phone: '11988887777',
      fulfillment_type: 'PICKUP',
      payment_method: 'CASH_ON_DELIVERY',
      items: [cartItem(burger)],
    });
    const mine = getMyOrders(undefined).map((o) => o.id);
    expect(mine).toEqual([order!.id]);
  });
});

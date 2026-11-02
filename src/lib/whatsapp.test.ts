import { describe, expect, it } from 'vitest';
import { buildOrderMessage, suggestedMessageFor, toWhatsAppNumber, waLink } from './whatsapp';
import { formatCep, onlyDigits } from './viacep';
import { esc } from './documents/print';
import type { Order } from '../types';

const order: Order = {
  id: 'o1',
  order_number: '#BH-1050',
  customer_name: 'Ana Souza',
  customer_phone: '(11) 98888-1111',
  fulfillment_type: 'DELIVERY',
  status: 'EM_ENTREGA',
  payment_status: 'PAGAMENTO_NA_ENTREGA',
  payment_method: 'CASH_ON_DELIVERY',
  delivery_address_snapshot: {
    recipient_name: 'Ana', recipient_phone: '', postal_code: '01310-100', street: 'Av. Paulista', number: '1000',
    neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP',
  },
  subtotal_cents: 5980,
  discount_cents: 0,
  delivery_fee_cents: 790,
  total_cents: 6770,
  items: [{ id: 'i1', order_id: 'o1', product_name_snapshot: 'Classic Cheese Burger', unit_price_cents: 2990, quantity: 2, line_total_cents: 5980, options: [], created_at: '' }],
  assigned_courier_name: 'Moto Boy',
  created_at: '2026-11-01T22:00:00Z',
  updated_at: '2026-11-01T22:00:00Z',
};

describe('WhatsApp', () => {
  it('normaliza telefone brasileiro para o formato internacional', () => {
    expect(toWhatsAppNumber('(11) 98888-1111')).toBe('5511988881111');
    expect(toWhatsAppNumber('+55 11 98888-1111')).toBe('5511988881111');
    expect(toWhatsAppNumber('1133334444')).toBe('551133334444');
    expect(toWhatsAppNumber('123')).toBeNull();
  });

  it('monta link wa.me com o texto codificado', () => {
    expect(waLink('11988881111', 'Olá & tchau')).toBe('https://wa.me/5511988881111?text=Ol%C3%A1%20%26%20tchau');
    expect(waLink('')).toBeNull();
  });

  it('mensagem de saída para entrega traz número, total, endereço e entregador', () => {
    const text = buildOrderMessage(order, 'OUT_FOR_DELIVERY', 'Burger Hub');
    expect(text).toContain('#BH-1050');
    // Intl separa "R$" do valor com espaço não separável
    expect(text).toMatch(/R\$\s67,70/);
    expect(text).toContain('Av. Paulista, 1000');
    expect(text).toContain('Moto Boy');
    expect(text.startsWith('Olá, Ana!')).toBe(true);
  });

  it('resumo lista itens e taxa de entrega', () => {
    const text = buildOrderMessage(order, 'SUMMARY');
    expect(text).toContain('2x Classic Cheese Burger');
    expect(text).toMatch(/Taxa de entrega: R\$\s7,90/);
  });

  it('sugere a mensagem certa para cada status', () => {
    expect(suggestedMessageFor('CONFIRMADO', 'DELIVERY')).toBe('CONFIRMED');
    expect(suggestedMessageFor('PRONTO', 'PICKUP')).toBe('READY_FOR_PICKUP');
    expect(suggestedMessageFor('EM_ENTREGA', 'DELIVERY')).toBe('OUT_FOR_DELIVERY');
    expect(suggestedMessageFor('CONCLUIDO', 'DELIVERY')).toBe('COMPLETED');
  });
});

describe('CEP e documentos', () => {
  it('formata CEP durante a digitação', () => {
    expect(formatCep('01310100')).toBe('01310-100');
    expect(formatCep('0131')).toBe('0131');
    expect(formatCep('01310-1009999')).toBe('01310-100');
    expect(onlyDigits('01.310-100')).toBe('01310100');
  });

  it('escapa texto do cliente antes de ir para o documento impresso', () => {
    expect(esc('<img src=x onerror=alert(1)> & "aspas"')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;aspas&quot;');
    expect(esc(undefined)).toBe('');
  });
});

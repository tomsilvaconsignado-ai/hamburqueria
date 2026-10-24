import { describe, expect, it } from 'vitest';
import { getEffectivePriceCents, parseBRLToCents } from './currency';

describe('parseBRLToCents', () => {
  it('interpreta valores com centavos', () => {
    expect(parseBRLToCents('34,90')).toBe(3490);
    expect(parseBRLToCents('R$ 1.234,50')).toBe(123450);
    expect(parseBRLToCents('12.5')).toBe(1250);
  });

  it('interpreta reais inteiros (troco digitado como "100")', () => {
    expect(parseBRLToCents('100')).toBe(10000);
    expect(parseBRLToCents('R$ 50')).toBe(5000);
  });

  it('retorna zero para entrada vazia', () => {
    expect(parseBRLToCents('')).toBe(0);
    expect(parseBRLToCents('abc')).toBe(0);
  });
});

describe('getEffectivePriceCents', () => {
  it('usa o preço promocional quando existir', () => {
    expect(getEffectivePriceCents({ price_cents: 3000, promotional_price_cents: 2500 })).toBe(2500);
    expect(getEffectivePriceCents({ price_cents: 3000 })).toBe(3000);
  });
});

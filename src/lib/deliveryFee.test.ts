import { describe, expect, it } from 'vitest';
import { distanceFeeCents } from './deliveryFee';

const rule = { base_fee_cents: 500, included_km: 2, fee_per_km_cents: 150 };

describe('distanceFeeCents', () => {
  it('cobra só a taxa base dentro dos km incluídos', () => {
    expect(distanceFeeCents(1.5, rule)).toBe(500);
    expect(distanceFeeCents(2, rule)).toBe(500);
  });

  it('soma os km excedentes (igual ao teste do servidor: 4,2 km = R$ 8,30)', () => {
    expect(distanceFeeCents(4.2, rule)).toBe(830);
  });

  it('arredonda para os 10 centavos de cima', () => {
    // 500 + ceil(1,01 × 150 = 151,5) = 652 → 660
    expect(distanceFeeCents(3.01, rule)).toBe(660);
  });
});

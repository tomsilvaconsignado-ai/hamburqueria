// Mesma conta de public.compute_delivery (servidor), usada só para mostrar exemplos no painel.

export interface DistanceFeeRule {
  base_fee_cents: number;
  included_km: number;
  fee_per_km_cents: number;
}

/** Taxa base + km excedentes × valor por km, arredondada para os 10 centavos de cima. */
export function distanceFeeCents(km: number, rule: DistanceFeeRule): number {
  const raw = rule.base_fee_cents + Math.ceil(Math.max(0, km - rule.included_km) * rule.fee_per_km_cents);
  return Math.ceil(raw / 10) * 10;
}

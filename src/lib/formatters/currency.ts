// Utilitários de formatação e manipulação monetária em centavos (sem float errors)

/**
 * Converte valor em centavos (inteiro) para representação brasileira BRL.
 * Ex: 3490 -> "R$ 34,90"
 */
export function formatCentsToBRL(cents: number): string {
  if (isNaN(cents)) return 'R$ 0,00';
  const realValue = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(realValue);
}

/**
 * Converte valor float em centavos inteiro de forma segura.
 * Ex: 34.90 -> 3490
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Converte string digitada ou formatada para centavos.
 * Ex: "34,90" -> 3490 · "R$ 1.234,50" -> 123450 · "100" -> 10000 (reais inteiros)
 */
export function parseBRLToCents(str: string): number {
  const clean = str.replace(/[^\d.,]/g, '');
  if (!clean) return 0;
  const decimalMatch = clean.match(/^(.*)[.,](\d{1,2})$/);
  if (decimalMatch) {
    const reais = parseInt(decimalMatch[1].replace(/[.,]/g, '') || '0', 10);
    const cents = parseInt(decimalMatch[2].padEnd(2, '0'), 10);
    return reais * 100 + cents;
  }
  return parseInt(clean.replace(/[.,]/g, ''), 10) * 100;
}

/** Preço cobrado pelo produto: promocional quando houver (mesma regra do servidor). */
export function getEffectivePriceCents(product: { price_cents: number; promotional_price_cents?: number }): number {
  return product.promotional_price_cents ?? product.price_cents;
}

/** Preço "de" exibido riscado, quando há promoção ativa. */
export function getStrikethroughPriceCents(product: {
  price_cents: number;
  promotional_price_cents?: number;
  original_price_cents?: number;
}): number | undefined {
  if (product.promotional_price_cents) return product.price_cents;
  return product.original_price_cents;
}

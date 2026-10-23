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
 * Ex: "34,90" -> 3490
 */
export function parseBRLToCents(str: string): number {
  const clean = str.replace(/[^\d]/g, '');
  if (!clean) return 0;
  return parseInt(clean, 10);
}

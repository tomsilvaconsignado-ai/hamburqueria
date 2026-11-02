// Consulta de CEP pelo ViaCEP (gratuito, sem chave): https://viacep.com.br/
// O endereço continua editável depois do preenchimento automático.

export interface CepAddress {
  postal_code: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** "01310100" → "01310-100" (aceita digitação parcial) */
export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Busca o CEP. Devolve null quando não existe; lança erro só em falha de rede. */
export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepAddress | null> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal });
  if (!res.ok) throw new Error('Não foi possível consultar o CEP agora.');
  const data = (await res.json()) as {
    erro?: boolean | string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (data.erro) return null;
  return {
    postal_code: formatCep(digits),
    street: data.logradouro ?? '',
    neighborhood: data.bairro ?? '',
    city: data.localidade ?? '',
    state: data.uf ?? '',
  };
}

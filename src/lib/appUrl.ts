/**
 * Caminho base onde o app está publicado (ex.: "/hamburqueria" no GitHub Pages, "" na raiz).
 * Vem do `base` do Vite (VITE_BASE_PATH no build).
 */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');

/** URL absoluta de uma rota do app, respeitando o subcaminho de publicação. */
export function appUrl(path: string): string {
  return `${window.location.origin}${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

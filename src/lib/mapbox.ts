// Mapbox no navegador: geocodificação e rota para os mapas (entregador, painel e cliente).
// O token é público (pk.) e deve estar restrito às URLs do site no painel do Mapbox.
// A taxa de entrega NÃO usa isto: ela é calculada no servidor (quote_delivery).

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
export const isMapboxEnabled = Boolean(MAPBOX_TOKEN);

/** [longitude, latitude] — a ordem que o Mapbox usa */
export type LngLat = [number, number];

export interface LineString {
  type: 'LineString';
  coordinates: LngLat[];
}

export interface RouteResult {
  geometry: LineString;
  distance_m: number;
  duration_s: number;
}

interface AddressLike {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

const join = (sep: string, parts: (string | undefined)[]) =>
  parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);

/** "Rua X 10, Bairro, Cidade - UF, 01000-000" (mesmo formato do servidor) */
export function addressQuery(addr: AddressLike): string {
  return join(', ', [
    join(' ', [addr.street, addr.number]),
    addr.neighborhood,
    join(' - ', [addr.city, addr.state]),
    addr.postal_code,
  ]);
}

// Um endereço é consultado uma vez por sessão (cota gratuita e mapas mais rápidos)
const geocodeCache = new Map<string, Promise<LngLat | null>>();

/** Coordenadas de um endereço; null se não encontrar ou se o Mapbox falhar. */
export function geocodeAddress(addr: AddressLike | string, proximity?: LngLat): Promise<LngLat | null> {
  const query = typeof addr === 'string' ? addr.trim() : addressQuery(addr);
  if (!isMapboxEnabled || !query) return Promise.resolve(null);
  const cached = geocodeCache.get(query);
  if (cached) return cached;

  const params = new URLSearchParams({ q: query, country: 'br', language: 'pt', limit: '1', access_token: MAPBOX_TOKEN });
  if (proximity) params.set('proximity', proximity.join(','));
  const request = fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { features?: { geometry?: { coordinates?: number[] } }[] } | null) => {
      const c = data?.features?.[0]?.geometry?.coordinates;
      return c && c.length >= 2 ? ([c[0], c[1]] as LngLat) : null;
    })
    .catch(() => null);
  geocodeCache.set(query, request);
  // Falha não fica em cache: tenta de novo na próxima vez
  request.then((r) => r === null && geocodeCache.delete(query));
  return request;
}

/** Rota de moto/carro entre dois pontos (traçado + distância + tempo). */
export async function fetchRoute(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<RouteResult | null> {
  if (!isMapboxEnabled) return null;
  const coords = `${from.join(',')};${to.join(',')}`;
  const params = new URLSearchParams({ geometries: 'geojson', overview: 'full', access_token: MAPBOX_TOKEN });
  try {
    const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?${params}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: { geometry: LineString; distance: number; duration: number }[] };
    const route = data.routes?.[0];
    return route ? { geometry: route.geometry, distance_m: route.distance, duration_s: route.duration } : null;
  } catch {
    return null;
  }
}

/** 850 → "850 m"; 4230 → "4,2 km" */
export function formatDistance(meters?: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** 540 → "9 min"; 3900 → "1 h 05 min" */
export function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const total = Math.max(1, Math.round(seconds / 60));
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`;
}

/** "agora", "há 3 min" */
export function formatAgo(iso?: string, now = Date.now()): string {
  if (!iso) return '';
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  return minutes < 1 ? 'agora' : `há ${minutes} min`;
}

/** Distância em linha reta entre dois pontos, em metros */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Ponto da loja (configurações) ou null se ainda não foi marcado no mapa */
export function storeLngLat(settings: { store_latitude?: number; store_longitude?: number }): LngLat | null {
  return settings.store_latitude != null && settings.store_longitude != null
    ? [Number(settings.store_longitude), Number(settings.store_latitude)]
    : null;
}

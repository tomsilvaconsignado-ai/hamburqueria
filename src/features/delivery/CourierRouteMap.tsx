import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Navigation, Phone, Route } from 'lucide-react';
import { DeliveryMap, type MapMarker } from '../../components/map';
import {
  fetchRoute,
  formatDistance,
  formatDuration,
  geocodeAddress,
  haversineMeters,
  type LngLat,
  type RouteResult,
} from '../../lib/mapbox';
import type { OrderAddressSnapshot } from '../../types';

interface CourierRouteMapProps {
  address: OrderAddressSnapshot;
  store: LngLat | null;
  /** Posição atual do entregador (GPS); sem ela a rota sai da loja */
  courier: LngLat | null;
  label: string;
  /** Links e telefone mostrados no painel do mapa em tela cheia */
  googleMapsUrl?: string;
  wazeUrl?: string;
  phone?: string;
}

// Recalcula a rota quando o entregador se afasta 300 m do ponto de onde ela foi traçada
const REROUTE_METERS = 300;

export const CourierRouteMap: React.FC<CourierRouteMapProps> = ({
  address,
  store,
  courier,
  label,
  googleMapsUrl,
  wazeUrl,
  phone,
}) => {
  const [destination, setDestination] = useState<LngLat | null | undefined>(undefined);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const routedFrom = useRef<LngLat | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDestination(undefined);
    geocodeAddress(address, store ?? undefined).then((p) => !cancelled && setDestination(p));
    return () => {
      cancelled = true;
    };
  }, [address.street, address.number, address.neighborhood, address.city, store?.[0], store?.[1]]);

  const origin = courier ?? store;
  useEffect(() => {
    if (!origin || !destination) return;
    if (routedFrom.current && haversineMeters(routedFrom.current, origin) < REROUTE_METERS) return;
    routedFrom.current = origin;
    const controller = new AbortController();
    fetchRoute(origin, destination, controller.signal).then((r) => r && setRoute(r));
    return () => controller.abort();
  }, [origin?.[0], origin?.[1], destination]);

  const markers = useMemo(() => {
    const list: MapMarker[] = [];
    if (store) list.push({ id: 'store', lngLat: store, kind: 'store', label: 'Hamburgueria' });
    if (destination) list.push({ id: 'destination', lngLat: destination, kind: 'destination', label });
    if (courier) list.push({ id: 'courier', lngLat: courier, kind: 'courier', label: 'Você' });
    return list;
  }, [store?.[0], store?.[1], destination, courier?.[0], courier?.[1], label]);

  if (destination === null) {
    return <p className="text-[11px] text-zinc-500">Endereço não localizado no mapa. Use o Google Maps ou o Waze.</p>;
  }

  const navButton =
    'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-wide transition';
  const fullscreenInfo = (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <MapPin className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">{label}</p>
          <p className="font-bold text-sm leading-snug">
            {address.street}, {address.number}
            {address.complement ? ` · ${address.complement}` : ''}
          </p>
          <p className="text-xs text-zinc-400">
            {address.neighborhood} – {address.city}
            {address.reference ? ` · Ref.: ${address.reference}` : ''}
          </p>
        </div>
      </div>
      {route && (
        <p className="flex items-center gap-1.5 text-sm">
          <Route className="w-4 h-4 text-amber-400" />
          <strong className="font-['Bebas_Neue',sans-serif] text-xl tracking-wide text-amber-400">
            {formatDistance(route.distance_m)} · ~{formatDuration(route.duration_s)}
          </strong>
          <span className="text-xs text-zinc-400">{courier ? 'daqui até o cliente' : 'da loja até o cliente'}</span>
        </p>
      )}
      <div className="flex gap-2">
        {googleMapsUrl && (
          <a href={googleMapsUrl} target="_blank" rel="noreferrer" className={`${navButton} bg-blue-600 hover:bg-blue-500 text-white`}>
            <Navigation className="w-4 h-4" /> Maps
          </a>
        )}
        {wazeUrl && (
          <a href={wazeUrl} target="_blank" rel="noreferrer" className={`${navButton} bg-sky-500 hover:bg-sky-400 text-white`}>
            <Navigation className="w-4 h-4" /> Waze
          </a>
        )}
        {phone && (
          <a href={`tel:${phone.replace(/\D/g, '')}`} className={`${navButton} bg-emerald-600 hover:bg-emerald-500 text-white`}>
            <Phone className="w-4 h-4" /> Ligar
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <DeliveryMap markers={markers} route={route?.geometry} className="h-56" fullscreenInfo={fullscreenInfo} />
      {route && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-300">
          <Route className="w-3.5 h-3.5 text-amber-400" />
          {courier ? 'Daqui até o cliente' : 'Da loja até o cliente'}:{' '}
          <strong className="text-white">{formatDistance(route.distance_m)}</strong> ·{' '}
          <strong className="text-white">~{formatDuration(route.duration_s)}</strong>
        </p>
      )}
    </div>
  );
};

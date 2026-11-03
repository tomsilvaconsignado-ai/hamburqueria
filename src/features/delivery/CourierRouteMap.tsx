import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Route } from 'lucide-react';
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
}

// Recalcula a rota quando o entregador se afasta 300 m do ponto de onde ela foi traçada
const REROUTE_METERS = 300;

export const CourierRouteMap: React.FC<CourierRouteMapProps> = ({ address, store, courier, label }) => {
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

  return (
    <div className="space-y-2">
      <DeliveryMap markers={markers} route={route?.geometry} className="h-56" />
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

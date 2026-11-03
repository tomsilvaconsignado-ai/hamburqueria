import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Radio } from 'lucide-react';
import { DeliveryMap, type MapMarker } from '../../components/map';
import {
  fetchRoute,
  formatAgo,
  formatDistance,
  formatDuration,
  geocodeAddress,
  haversineMeters,
  isMapboxEnabled,
  storeLngLat,
  type LngLat,
  type RouteResult,
} from '../../lib/mapbox';
import { getOrderTracking, getStoreSettings } from '../../services/storage';
import type { Order, OrderTracking } from '../../types';

const POLL_MS = 10000;
const REROUTE_METERS = 250;

/** Mapa ao vivo do entregador para o cliente (só com o pedido em rota). */
export const LiveTrackingMap: React.FC<{ order: Order }> = ({ order }) => {
  const active = isMapboxEnabled && order.status === 'EM_ENTREGA' && Boolean(order.delivery_address_snapshot);
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [destination, setDestination] = useState<LngLat | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [, setTick] = useState(0);
  const routedFrom = useRef<LngLat | null>(null);
  const store = storeLngLat(getStoreSettings());
  const addr = order.delivery_address_snapshot;

  // Posição do entregador a cada 10 s (convidados não recebem Realtime)
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = () =>
      getOrderTracking(order.id, order.guest_access_token).then((t) => {
        if (!cancelled) setTracking(t);
      });
    load();
    const timer = setInterval(() => {
      load();
      setTick((n) => n + 1); // atualiza o "há X min"
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, order.id, order.guest_access_token]);

  useEffect(() => {
    if (!active || !addr) return;
    let cancelled = false;
    geocodeAddress(addr, store ?? undefined).then((p) => !cancelled && setDestination(p));
    return () => {
      cancelled = true;
    };
  }, [active, addr?.street, addr?.number, addr?.neighborhood, addr?.city]);

  const courier: LngLat | null =
    tracking?.has_location && tracking.longitude != null && tracking.latitude != null
      ? [Number(tracking.longitude), Number(tracking.latitude)]
      : null;

  // Rota do entregador até a casa do cliente (refeita quando ele avança)
  useEffect(() => {
    if (!courier || !destination) return;
    if (routedFrom.current && haversineMeters(routedFrom.current, courier) < REROUTE_METERS) return;
    routedFrom.current = courier;
    const controller = new AbortController();
    fetchRoute(courier, destination, controller.signal).then((r) => r && setRoute(r));
    return () => controller.abort();
  }, [courier?.[0], courier?.[1], destination]);

  const markers = useMemo(() => {
    const list: MapMarker[] = [];
    if (destination) list.push({ id: 'destination', lngLat: destination, kind: 'destination', label: 'Seu endereço' });
    if (courier) list.push({ id: 'courier', lngLat: courier, kind: 'courier', label: tracking?.courier_name ?? 'Entregador' });
    else if (store) list.push({ id: 'store', lngLat: store, kind: 'store', label: 'Hamburgueria' });
    return list;
  }, [destination, courier?.[0], courier?.[1], store?.[0], store?.[1], tracking?.courier_name]);

  if (!active) return null;

  return (
    <div className="p-4 rounded-2xl bg-zinc-900/80 border border-emerald-500/30 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
          <Radio className="w-4 h-4" /> Entrega ao vivo
        </h4>
        {tracking?.updated_at && <span className="text-[10px] text-zinc-500">Atualizado {formatAgo(tracking.updated_at)}</span>}
      </div>

      {markers.length > 0 && <DeliveryMap markers={markers} route={courier ? route?.geometry : null} followMarkers className="h-60" />}

      <p className="text-xs text-zinc-300 flex items-center gap-1.5">
        <Bike className="w-4 h-4 text-emerald-400 shrink-0" />
        {courier && route ? (
          <span>
            {tracking?.courier_name ?? 'O entregador'} está a <strong className="text-white">{formatDistance(route.distance_m)}</strong>
            {' '}· chega em <strong className="text-white">~{formatDuration(route.duration_s)}</strong>
          </span>
        ) : courier ? (
          <span>{tracking?.courier_name ?? 'O entregador'} está a caminho.</span>
        ) : (
          <span>O pedido saiu para entrega. A posição do entregador aparece aqui assim que o GPS dele atualizar.</span>
        )}
      </p>
    </div>
  );
};

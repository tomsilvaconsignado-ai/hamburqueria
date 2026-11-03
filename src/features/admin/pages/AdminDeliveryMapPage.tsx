import React, { useEffect, useMemo, useState } from 'react';
import { Bike, MapPin, Map as MapIcon, AlertTriangle } from 'lucide-react';
import { Courier, CourierLocation, Order, OrderStatus, StoreSettings } from '../../../types';
import { DeliveryMap, type MapMarker } from '../../../components/map';
import { formatAgo, formatDistance, geocodeAddress, isMapboxEnabled, storeLngLat, type LngLat } from '../../../lib/mapbox';
import { getCourierLocations, subscribeToCourierLocations } from '../../../services/storage';

interface AdminDeliveryMapPageProps {
  orders: Order[];
  couriers: Courier[];
  settings: StoreSettings;
}

const ACTIVE: OrderStatus[] = ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADO', 'EM_PREPARACAO', 'PRONTO', 'EM_ENTREGA'];
const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  CONFIRMADO: 'Confirmado',
  EM_PREPARACAO: 'Em preparo',
  PRONTO: 'Pronto p/ retirada',
  EM_ENTREGA: 'Em rota',
};
const REFRESH_MS = 20000;

export const AdminDeliveryMapPage: React.FC<AdminDeliveryMapPageProps> = ({ orders, couriers, settings }) => {
  const store = storeLngLat(settings);
  const deliveries = useMemo(
    () => orders.filter((o) => o.fulfillment_type === 'DELIVERY' && ACTIVE.includes(o.status) && o.delivery_address_snapshot),
    [orders]
  );
  const [points, setPoints] = useState<Record<string, LngLat | null>>({});
  const [locations, setLocations] = useState<CourierLocation[]>([]);
  const [, setTick] = useState(0);

  // Endereços dos pedidos ativos no mapa (cada um é consultado uma vez por sessão)
  const addressKey = deliveries.map((o) => o.id).join('|');
  useEffect(() => {
    if (!isMapboxEnabled) return;
    let cancelled = false;
    Promise.all(
      deliveries.map(async (o) => [o.id, await geocodeAddress(o.delivery_address_snapshot!, store ?? undefined)] as const)
    ).then((list) => !cancelled && setPoints(Object.fromEntries(list)));
    return () => {
      cancelled = true;
    };
  }, [addressKey]);

  // Entregadores em rota: Realtime + consulta periódica (garante o "há X min")
  useEffect(() => {
    const load = () => getCourierLocations().then(setLocations);
    load();
    const unsubscribe = subscribeToCourierLocations(load);
    const timer = setInterval(() => {
      load();
      setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const courierName = (id: string) => couriers.find((c) => c.id === id)?.full_name ?? 'Entregador';

  const markers = useMemo(() => {
    const list: MapMarker[] = [];
    if (store) list.push({ id: 'store', lngLat: store, kind: 'store', label: settings.store_name });
    for (const o of deliveries) {
      const p = points[o.id];
      if (p) list.push({ id: `order-${o.id}`, lngLat: p, kind: 'destination', label: `${o.order_number} · ${o.customer_name} · ${STATUS_LABEL[o.status] ?? o.status}` });
    }
    for (const l of locations) {
      list.push({
        id: `courier-${l.courier_id}`,
        lngLat: [Number(l.longitude), Number(l.latitude)],
        kind: 'courier',
        label: `${courierName(l.courier_id)} · ${formatAgo(l.updated_at)}`,
      });
    }
    return list;
  }, [store?.[0], store?.[1], deliveries, points, locations, couriers]);

  if (!isMapboxEnabled) {
    return (
      <div className="p-6 rounded-3xl bg-[#141620] border border-amber-500/40 text-sm text-amber-200 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p>
          O mapa precisa do token público do Mapbox no site (<code>VITE_MAPBOX_TOKEN</code> no arquivo{' '}
          <code>.env.production</code>). Assim que ele for configurado e o site publicado de novo, o mapa aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!store && (
        <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
          Marque a localização da loja em Configurações → Taxa de entrega e localização para ver as rotas a partir dela.
        </div>
      )}

      <DeliveryMap markers={markers} className="h-[28rem]" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        <div className="p-4 rounded-2xl bg-[#141620] border border-zinc-800 space-y-2">
          <h3 className="font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-red-400" /> Entregas abertas ({deliveries.length})
          </h3>
          {deliveries.length === 0 && <p className="text-zinc-500">Nenhuma entrega em aberto agora.</p>}
          {deliveries.map((o) => (
            <div key={o.id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <p className="font-bold text-white">
                  {o.order_number} · {o.customer_name}
                </p>
                <p className="text-zinc-400">
                  {o.delivery_address_snapshot?.street}, {o.delivery_address_snapshot?.number} — {o.delivery_address_snapshot?.neighborhood}
                </p>
                <p className="text-zinc-500">
                  {o.assigned_courier_name ? `Entregador: ${o.assigned_courier_name}` : 'Sem entregador'}
                  {o.delivery_distance_m != null ? ` · ${formatDistance(o.delivery_distance_m)}` : ''}
                  {points[o.id] === null ? ' · endereço não localizado no mapa' : ''}
                </p>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                  o.status === 'EM_ENTREGA' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-2xl bg-[#141620] border border-zinc-800 space-y-2">
          <h3 className="font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <Bike className="w-4 h-4 text-emerald-400" /> Entregadores em rota ({locations.length})
          </h3>
          {locations.length === 0 && (
            <p className="text-zinc-500">
              A posição aparece quando o entregador sai para a entrega com o painel aberto no celular e a localização liberada.
            </p>
          )}
          {locations.map((l) => (
            <div key={l.courier_id} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="font-bold text-white">{courierName(l.courier_id)}</span>
              <span className="text-zinc-400">
                {l.speed_mps != null ? `${Math.round(Number(l.speed_mps) * 3.6)} km/h · ` : ''}
                {formatAgo(l.updated_at)}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-zinc-500 flex items-center gap-1 pt-1">
            <MapIcon className="w-3 h-3" /> Só a última posição de cada entregador em rota é guardada; ela some ao concluir a entrega.
          </p>
        </div>
      </div>
    </div>
  );
};

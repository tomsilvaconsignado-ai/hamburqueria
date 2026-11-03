import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, LocateFixed, Navigation, XCircle } from 'lucide-react';
import type { DeliveryPricingMode, StoreSettings } from '../../../types';
import { DeliveryMap, type MapMarker } from '../../../components/map';
import { geocodeAddress, isMapboxEnabled, type LngLat } from '../../../lib/mapbox';
import { distanceFeeCents } from '../../../lib/deliveryFee';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { getMapboxStatus } from '../../../services/storage';

export interface DeliveryPricingForm {
  mode: DeliveryPricingMode;
  location: LngLat | null;
  baseFee: string;
  includedKm: string;
  perKm: string;
  maxKm: string;
}

const decimal = (n: number | undefined, fallback: number) => String(n ?? fallback).replace('.', ',');
const money = (cents: number | undefined, fallback: number) => ((cents ?? fallback) / 100).toFixed(2).replace('.', ',');

export function deliveryPricingFormFrom(settings: StoreSettings): DeliveryPricingForm {
  return {
    mode: settings.delivery_pricing_mode ?? 'ZONE',
    location:
      settings.store_latitude != null && settings.store_longitude != null
        ? [Number(settings.store_longitude), Number(settings.store_latitude)]
        : null,
    baseFee: money(settings.delivery_base_fee_cents, 500),
    includedKm: decimal(settings.delivery_included_km, 2),
    perKm: money(settings.delivery_fee_per_km_cents, 150),
    maxKm: decimal(settings.delivery_max_km, 8),
  };
}

export const parseDecimal = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'));
const toCents = (value: string) => Math.round(parseDecimal(value) * 100);

/** Converte o formulário nas colunas de store_settings; devolve um erro se algo estiver inválido. */
export function deliveryPricingChanges(form: DeliveryPricingForm): { changes?: Partial<StoreSettings>; error?: string } {
  const base = toCents(form.baseFee);
  const perKm = toCents(form.perKm);
  const included = parseDecimal(form.includedKm);
  const max = parseDecimal(form.maxKm);
  if ([base, perKm, included].some((n) => !Number.isFinite(n) || n < 0) || !Number.isFinite(max) || max <= 0) {
    return { error: 'Confira os valores da taxa por distância (use números, ex.: 5,00 e 2,5).' };
  }
  if (form.mode === 'DISTANCE' && !form.location) {
    return { error: 'Marque a localização da loja no mapa antes de cobrar a entrega por distância.' };
  }
  return {
    changes: {
      delivery_pricing_mode: form.mode,
      store_longitude: form.location?.[0],
      store_latitude: form.location?.[1],
      delivery_base_fee_cents: base,
      delivery_fee_per_km_cents: perKm,
      delivery_included_km: included,
      delivery_max_km: max,
    },
  };
}

interface Props {
  value: DeliveryPricingForm;
  onChange: (value: DeliveryPricingForm) => void;
  storeAddress: string;
}

const Check: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <li className={`flex items-start gap-1.5 ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>
    {ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />}
    <span>{children}</span>
  </li>
);

export const DeliveryPricingSettings: React.FC<Props> = ({ value, onChange, storeAddress }) => {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getMapboxStatus>>>(null);
  const [locating, setLocating] = useState<string | null>(null);
  const set = (patch: Partial<DeliveryPricingForm>) => onChange({ ...value, ...patch });

  useEffect(() => {
    getMapboxStatus().then(setStatus);
  }, []);

  const locateFromAddress = async () => {
    setLocating('Procurando o endereço da loja…');
    const found = await geocodeAddress(storeAddress);
    if (found) {
      set({ location: found });
      setLocating('Endereço encontrado. Arraste o marcador 🍔 para a porta da loja, se precisar.');
    } else {
      setLocating('Endereço não encontrado. Clique no mapa no ponto da loja.');
    }
  };

  const markers = useMemo<MapMarker[]>(
    () => (value.location ? [{ id: 'store', lngLat: value.location, kind: 'store', label: 'Loja (arraste para ajustar)' }] : []),
    [value.location?.[0], value.location?.[1]]
  );

  const rule = { base_fee_cents: toCents(value.baseFee), included_km: parseDecimal(value.includedKm), fee_per_km_cents: toCents(value.perKm) };
  const ruleValid = Object.values(rule).every((n) => Number.isFinite(n) && n >= 0);
  const examples = [1, 3, 5, 8].filter((km) => km <= (parseDecimal(value.maxKm) || 8));

  const field = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white';

  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(
          [
            { id: 'ZONE', title: 'Por bairro', desc: 'Usa as zonas e taxas cadastradas abaixo.' },
            { id: 'DISTANCE', title: 'Por distância (Mapbox)', desc: 'Calcula os km de rota da loja até o cliente.' },
          ] as const
        ).map((opt) => (
          <label
            key={opt.id}
            className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition ${
              value.mode === opt.id ? 'bg-amber-500/10 border-amber-500/40 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            <input
              type="radio"
              name="delivery_pricing_mode"
              checked={value.mode === opt.id}
              onChange={() => set({ mode: opt.id })}
              className="mt-0.5 accent-amber-500"
            />
            <span>
              <span className="font-bold block">{opt.title}</span>
              <span className="text-[11px] text-zinc-400">{opt.desc}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-zinc-400 block mb-1">Taxa base (R$)</label>
          <input type="text" inputMode="decimal" value={value.baseFee} onChange={(e) => set({ baseFee: e.target.value })} className={field} />
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Km incluídos na base</label>
          <input type="text" inputMode="decimal" value={value.includedKm} onChange={(e) => set({ includedKm: e.target.value })} className={field} />
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Valor por km extra (R$)</label>
          <input type="text" inputMode="decimal" value={value.perKm} onChange={(e) => set({ perKm: e.target.value })} className={field} />
        </div>
        <div>
          <label className="text-zinc-400 block mb-1">Raio máximo (km)</label>
          <input type="text" inputMode="decimal" value={value.maxKm} onChange={(e) => set({ maxKm: e.target.value })} className={field} />
        </div>
      </div>

      {ruleValid && (
        <p className="text-zinc-400">
          Exemplos:{' '}
          {examples.map((km, i) => (
            <span key={km}>
              {i > 0 && ' · '}
              {km} km = <strong className="text-amber-300">{formatCentsToBRL(distanceFeeCents(km, rule))}</strong>
            </span>
          ))}
          . A distância é a rota de carro, não a linha reta.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-zinc-300 font-bold">Localização da loja (ponto de saída das entregas)</span>
          {isMapboxEnabled && (
            <button
              type="button"
              onClick={locateFromAddress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5" /> Localizar pelo endereço da loja
            </button>
          )}
        </div>
        {locating && <p className="text-zinc-400">{locating}</p>}
        {isMapboxEnabled ? (
          <>
            <DeliveryMap
              markers={markers}
              className="h-64"
              draggableId="store"
              onMarkerDragEnd={(_, p) => set({ location: p })}
              onMapClick={(p) => set({ location: p })}
            />
            <p className="text-[11px] text-zinc-500 flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              {value.location
                ? `Ponto marcado: ${value.location[1].toFixed(5)}, ${value.location[0].toFixed(5)}. Clique no mapa ou arraste o marcador para mudar.`
                : 'Clique no mapa no ponto da loja (ou use o botão acima).'}
            </p>
          </>
        ) : (
          <p className="text-amber-300">O mapa precisa do token público do Mapbox no site (VITE_MAPBOX_TOKEN).</p>
        )}
      </div>

      <ul className="space-y-1 p-3 rounded-2xl bg-zinc-950 border border-zinc-800">
        <Check ok={isMapboxEnabled}>Token público do site (mapas do entregador, do painel e do cliente)</Check>
        {status ? (
          <>
            <Check ok={status.server_token}>
              Token do servidor (cálculo da taxa){!status.server_token && ' — cadastre com o SQL do README (private.app_secrets)'}
            </Check>
            <Check ok={Boolean(value.location)}>Localização da loja marcada</Check>
            <li className="text-zinc-500">Consultas ao Mapbox nas últimas 24 h: {status.calls_today}</li>
          </>
        ) : (
          <li className="text-zinc-500">Status do servidor indisponível (banco ainda sem a atualização de mapas?).</li>
        )}
      </ul>
      {value.mode === 'DISTANCE' && (
        <p className="text-[11px] text-zinc-500">
          Se o Mapbox falhar, a taxa volta a ser a da zona do bairro; sem zona para o bairro, o cliente é avisado para tentar de novo.
        </p>
      )}
    </div>
  );
};

import React, { Suspense, lazy } from 'react';
import { MapPin } from 'lucide-react';
import { isMapboxEnabled } from '../../lib/mapbox';
import type { DeliveryMapProps } from './types';

export type { DeliveryMapProps, MapMarker, MapMarkerKind } from './types';

const DeliveryMapImpl = lazy(() => import('./DeliveryMap'));

/** Mapa do Mapbox. Sem VITE_MAPBOX_TOKEN não mostra nada (o app segue com os links do Google Maps/Waze). */
export const DeliveryMap: React.FC<DeliveryMapProps> = (props) => {
  if (!isMapboxEnabled) return null;
  return (
    <Suspense
      fallback={
        <div
          className={`w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 flex items-center justify-center text-xs text-zinc-500 ${props.className ?? 'h-64'}`}
        >
          <MapPin className="w-4 h-4 mr-1.5" /> Carregando mapa…
        </div>
      }
    >
      <DeliveryMapImpl {...props} />
    </Suspense>
  );
};

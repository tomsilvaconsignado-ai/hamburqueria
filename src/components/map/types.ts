import type { ReactNode } from 'react';
import type { LineString, LngLat } from '../../lib/mapbox';

export type MapMarkerKind = 'store' | 'destination' | 'courier';

export interface MapMarker {
  id: string;
  lngLat: LngLat;
  kind: MapMarkerKind;
  /** Texto curto exibido ao passar o mouse / tocar */
  label?: string;
}

export interface DeliveryMapProps {
  markers: MapMarker[];
  route?: LineString | null;
  className?: string;
  /** Reenquadra o mapa sempre que os pontos mudam (rastreio). Padrão: só quando entram/saem pontos. */
  followMarkers?: boolean;
  /** Marcador que pode ser arrastado (ex.: posição da loja nas configurações) */
  draggableId?: string;
  onMarkerDragEnd?: (id: string, lngLat: LngLat) => void;
  onMapClick?: (lngLat: LngLat) => void;
  /** Botão "Tela cheia" (padrão: ligado) */
  allowFullscreen?: boolean;
  /** Painel exibido embaixo do mapa em tela cheia (ex.: distância e botões de navegação) */
  fullscreenInfo?: ReactNode;
}

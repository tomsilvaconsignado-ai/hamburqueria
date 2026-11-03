// Mapa do Mapbox GL. Carregado sob demanda (ver ./index.tsx): a loja não baixa a biblioteca.
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, type LngLat } from '../../lib/mapbox';
import type { DeliveryMapProps, MapMarker, MapMarkerKind } from './types';

const SAO_PAULO: LngLat = [-46.6333, -23.5505];
const ROUTE_SOURCE = 'delivery-route';

const MARKER_STYLE: Record<MapMarkerKind, { emoji: string; bg: string }> = {
  store: { emoji: '🍔', bg: '#f59e0b' },
  destination: { emoji: '🏠', bg: '#ef4444' },
  courier: { emoji: '🛵', bg: '#10b981' },
};

function markerElement(m: MapMarker): HTMLElement {
  const style = MARKER_STYLE[m.kind];
  const el = document.createElement('div');
  el.style.cssText = `width:34px;height:34px;border-radius:9999px;background:${style.bg};display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid #0d0f15;box-shadow:0 4px 12px rgba(0,0,0,.45);cursor:pointer`;
  el.textContent = style.emoji;
  if (m.label) {
    el.title = m.label;
    el.setAttribute('aria-label', m.label);
  }
  return el;
}

const DeliveryMap: React.FC<DeliveryMapProps> = ({
  markers,
  route,
  className = 'h-64',
  followMarkers = false,
  draggableId,
  onMarkerDragEnd,
  onMapClick,
}) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const loaded = useRef(false);
  const placed = useRef(new Map<string, mapboxgl.Marker>());
  const framedKey = useRef('');
  const callbacks = useRef({ onMarkerDragEnd, onMapClick });
  callbacks.current = { onMarkerDragEnd, onMapClick };
  const routeRef = useRef(route);
  routeRef.current = route;

  const drawRoute = (instance: mapboxgl.Map) => {
    const source = instance.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    const line = routeRef.current;
    source?.setData({
      type: 'FeatureCollection',
      features: line ? [{ type: 'Feature', properties: {}, geometry: line }] : [],
    });
  };

  // Cria o mapa uma vez
  useEffect(() => {
    if (!container.current) return;
    const instance = new mapboxgl.Map({
      container: container.current,
      accessToken: MAPBOX_TOKEN,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: markers[0]?.lngLat ?? SAO_PAULO,
      zoom: 13,
      attributionControl: true,
      cooperativeGestures: false,
    });
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    instance.on('click', (e) => callbacks.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]));
    instance.on('load', () => {
      loaded.current = true;
      instance.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      instance.addLayer({
        id: ROUTE_SOURCE,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f59e0b', 'line-width': 5, 'line-opacity': 0.9 },
      });
      drawRoute(instance);
    });
    map.current = instance;
    const markersRef = placed.current;
    return () => {
      markersRef.forEach((m) => m.remove());
      markersRef.clear();
      instance.remove();
      map.current = null;
      loaded.current = false;
    };
  }, []);

  // Marcadores: cria, move e remove conforme a lista
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const current = placed.current;
    const ids = new Set(markers.map((m) => m.id));
    current.forEach((marker, id) => {
      if (!ids.has(id)) {
        marker.remove();
        current.delete(id);
      }
    });
    for (const m of markers) {
      const existing = current.get(m.id);
      if (existing) {
        existing.setLngLat(m.lngLat);
        continue;
      }
      const marker = new mapboxgl.Marker({ element: markerElement(m), draggable: m.id === draggableId })
        .setLngLat(m.lngLat)
        .addTo(instance);
      if (m.label) marker.setPopup(new mapboxgl.Popup({ offset: 20, closeButton: false }).setText(m.label));
      if (m.id === draggableId) {
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          callbacks.current.onMarkerDragEnd?.(m.id, [p.lng, p.lat]);
        });
      }
      current.set(m.id, marker);
    }

    // Enquadra todos os pontos (e a rota): ao entrar/sair ponto, ou sempre se followMarkers
    const key = markers.map((m) => m.id).sort().join('|');
    if (!followMarkers && key === framedKey.current) return;
    const animate = Boolean(framedKey.current);
    framedKey.current = key;
    const points: LngLat[] = [...markers.map((m) => m.lngLat), ...(route?.coordinates ?? [])];
    if (points.length === 1) {
      instance.easeTo({ center: points[0], zoom: Math.max(instance.getZoom(), 14), duration: animate ? 600 : 0 });
    } else if (points.length > 1) {
      const bounds = points.reduce((b, p) => b.extend(p), new mapboxgl.LngLatBounds(points[0], points[0]));
      instance.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: animate ? 600 : 0 });
    }
  }, [markers, followMarkers, draggableId, route]);

  // Traçado da rota (se o mapa ainda carrega, o 'load' desenha)
  useEffect(() => {
    if (map.current && loaded.current) drawRoute(map.current);
  }, [route]);

  return <div ref={container} className={`w-full rounded-2xl overflow-hidden border border-zinc-800 ${className}`} />;
};

export default DeliveryMap;

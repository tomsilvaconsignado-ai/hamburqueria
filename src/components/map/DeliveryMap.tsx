// Mapa do Mapbox GL. Carregado sob demanda (ver ./index.tsx): a loja não baixa a biblioteca.
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Maximize2, X, LocateFixed } from 'lucide-react';
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

const mapButton =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141622]/95 border border-zinc-700 text-white text-xs font-bold shadow-lg shadow-black/40 backdrop-blur hover:bg-zinc-800 transition cursor-pointer';

const DeliveryMap: React.FC<DeliveryMapProps> = ({
  markers,
  route,
  className = 'h-64',
  followMarkers = false,
  draggableId,
  onMarkerDragEnd,
  onMapClick,
  allowFullscreen = true,
  fullscreenInfo,
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
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;
  const hasInfo = Boolean(fullscreenInfo);
  // Altura do painel de baixo (tela cheia): o logo e os créditos do Mapbox sobem para ficar visíveis
  const panel = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  useEffect(() => {
    if (!fullscreen || !panel.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setPanelHeight(Math.round(entry.target.getBoundingClientRect().height)));
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [fullscreen, hasInfo]);

  const drawRoute = (instance: mapboxgl.Map) => {
    const source = instance.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    const line = routeRef.current;
    source?.setData({
      type: 'FeatureCollection',
      features: line ? [{ type: 'Feature', properties: {}, geometry: line }] : [],
    });
  };

  // Enquadra todos os pontos e a rota (em tela cheia, deixa espaço para o painel de baixo)
  const frameAll = (instance: mapboxgl.Map, animate: boolean) => {
    const points: LngLat[] = [...markersRef.current.map((m) => m.lngLat), ...(routeRef.current?.coordinates ?? [])];
    const duration = animate ? 600 : 0;
    if (points.length === 1) {
      instance.easeTo({ center: points[0], zoom: Math.max(instance.getZoom(), 15), duration });
    } else if (points.length > 1) {
      const bounds = points.reduce((b, p) => b.extend(p), new mapboxgl.LngLatBounds(points[0], points[0]));
      const padding = fullscreenRef.current
        ? { top: 90, left: 40, right: 40, bottom: hasInfo ? 230 : 60 }
        : 48;
      instance.fitBounds(bounds, { padding, maxZoom: 16, duration });
    }
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
    const markersPlaced = placed.current;
    return () => {
      markersPlaced.forEach((m) => m.remove());
      markersPlaced.clear();
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

    // Reenquadra ao entrar/sair ponto, ou sempre se followMarkers
    const key = markers.map((m) => m.id).sort().join('|');
    if (!followMarkers && key === framedKey.current) return;
    const animate = Boolean(framedKey.current);
    framedKey.current = key;
    frameAll(instance, animate);
  }, [markers, followMarkers, draggableId, route]);

  // Traçado da rota (se o mapa ainda carrega, o 'load' desenha)
  useEffect(() => {
    if (map.current && loaded.current) drawRoute(map.current);
  }, [route]);

  // Tela cheia: redimensiona o mapa, trava a rolagem da página e fecha com Esc ou com o "voltar" do celular
  useEffect(() => {
    const instance = map.current;
    const raf = requestAnimationFrame(() => {
      if (!instance) return;
      instance.resize();
      frameAll(instance, true);
    });
    if (!fullscreen) return () => cancelAnimationFrame(raf);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ ...(window.history.state ?? {}), bhMapFullscreen: true }, '');
    const onPop = () => setFullscreen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFullscreen();
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const closeFullscreen = () => {
    if (window.history.state?.bhMapFullscreen) window.history.back();
    else setFullscreen(false);
  };

  return (
    <div
      className={
        fullscreen
          ? 'bh-map-fullscreen fixed left-0 top-0 w-full h-[100dvh] z-[80] bg-[#0d0f15]'
          : `relative w-full rounded-2xl overflow-hidden border border-zinc-800 ${className}`
      }
      style={fullscreen ? ({ '--bh-map-panel': `${panelHeight}px` } as React.CSSProperties) : undefined}
      role={fullscreen ? 'dialog' : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? 'Mapa em tela cheia' : undefined}
    >
      {/* O CSS do Mapbox força position: relative neste elemento: o tamanho vem de 100% da moldura */}
      <div ref={container} className="w-full h-full" />

      {allowFullscreen && (
        <div className="absolute left-3 top-[max(env(safe-area-inset-top),0.75rem)] z-10 flex gap-2">
          {fullscreen ? (
            <>
              <button type="button" onClick={closeFullscreen} className={mapButton} aria-label="Fechar tela cheia">
                <X className="w-4 h-4" /> Fechar
              </button>
              <button
                type="button"
                onClick={() => map.current && frameAll(map.current, true)}
                className={mapButton}
                aria-label="Centralizar o mapa"
              >
                <LocateFixed className="w-4 h-4" /> Centralizar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setFullscreen(true)} className={mapButton} aria-label="Abrir o mapa em tela cheia">
              <Maximize2 className="w-4 h-4" /> Tela cheia
            </button>
          )}
        </div>
      )}

      {fullscreen && fullscreenInfo && (
        <div ref={panel} className="absolute inset-x-0 bottom-0 z-10 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="max-w-xl mx-auto rounded-3xl bg-[#141622]/95 border border-amber-500/30 shadow-2xl shadow-black/60 backdrop-blur p-4 text-white">
            {fullscreenInfo}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryMap;

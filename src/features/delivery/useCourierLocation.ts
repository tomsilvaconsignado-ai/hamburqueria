import { useEffect, useRef, useState } from 'react';
import { reportCourierLocation } from '../../services/storage';
import type { LngLat } from '../../lib/mapbox';

export type LocationStatus = 'off' | 'waiting' | 'sharing' | 'denied' | 'unsupported' | 'error';

const SEND_EVERY_MS = 15000;

/**
 * GPS do entregador. Com `share` ligado (há entrega em rota), envia a posição ao servidor
 * no máximo a cada 15 s; o servidor só guarda enquanto houver pedido EM_ENTREGA.
 * Funciona com o app aberto na tela (o navegador pausa o GPS em segundo plano).
 */
export function useCourierLocation(watch: boolean, share: boolean) {
  const [position, setPosition] = useState<LngLat | null>(null);
  const [status, setStatus] = useState<LocationStatus>('off');
  const lastSent = useRef(0);
  const latest = useRef<GeolocationPosition | null>(null);
  const shareRef = useRef(share);
  shareRef.current = share;

  const send = (pos: GeolocationPosition) => {
    lastSent.current = Date.now();
    reportCourierLocation({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
      speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
    }).then((res) => {
      if (shareRef.current) setStatus(res.success ? 'sharing' : 'error');
    });
  };

  useEffect(() => {
    if (!watch) {
      setStatus('off');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('waiting');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        setPosition([pos.coords.longitude, pos.coords.latitude]);
        if (!shareRef.current) {
          setStatus('off');
        } else if (Date.now() - lastSent.current >= SEND_EVERY_MS) {
          send(pos);
        }
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
    // Parado no trânsito o GPS não dispara: reenvia a última posição para o cliente não ver "sem sinal"
    const heartbeat = setInterval(() => {
      if (shareRef.current && latest.current && Date.now() - lastSent.current >= SEND_EVERY_MS * 2) send(latest.current);
    }, SEND_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(heartbeat);
    };
  }, [watch]);

  // Ao sair para a entrega, envia na hora
  useEffect(() => {
    if (share && latest.current) send(latest.current);
  }, [share]);

  // Mantém a tela acesa durante a rota (quando o navegador permite)
  useEffect(() => {
    if (!share || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (released) l.release();
          else lock = l;
        })
        .catch(() => {});
    acquire();
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      lock?.release().catch(() => {});
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [share]);

  return { position, status };
}

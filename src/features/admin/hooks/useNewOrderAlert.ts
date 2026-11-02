import { useEffect, useRef, useState } from 'react';
import type { Order } from '../../../types';

const PREF_KEY = 'bh_admin_order_alert_v1';

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

let audioCtx: AudioContext | null = null;

/** Dois bipes curtos (Web Audio: sem arquivo de som para baixar). */
export function playAlertSound() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t = audioCtx.currentTime;
    [0, 0.28].forEach((offset) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, t + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.22);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.24);
    });
  } catch {
    // navegador sem Web Audio: o aviso visual continua
  }
}

/**
 * Avisa quando chega pedido novo (status "Pedido recebido"): som, notificação do sistema
 * (se a pessoa permitir) e contador. Pedidos que já existiam ao abrir o painel não tocam.
 */
export function useNewOrderAlert(orders: Order[]) {
  const [enabled, setEnabled] = useState(readPref);
  const [unseen, setUnseen] = useState<Order[]>([]);
  const known = useRef(new Set<string>());
  // Só avisa pedidos criados depois que o painel abriu (com folga para relógio do aparelho)
  const openedAt = useRef(Date.now() - 2 * 60_000);

  useEffect(() => {
    const fresh = orders.filter(
      (o) => o.status === 'AGUARDANDO_CONFIRMACAO' && !known.current.has(o.id) && Date.parse(o.created_at) > openedAt.current
    );
    orders.forEach((o) => known.current.add(o.id));
    if (fresh.length === 0) return;

    setUnseen((prev) => [...fresh, ...prev].slice(0, 20));
    if (!enabled) return;
    playAlertSound();
    if ('Notification' in window && Notification.permission === 'granted') {
      fresh.forEach((o) => {
        try {
          new Notification(`Novo pedido ${o.order_number}`, { body: `${o.customer_name} · ${(o.total_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, tag: o.id });
        } catch {
          // alguns celulares só permitem notificação via service worker
        }
      });
    }
  }, [orders, enabled]);

  // Quem já foi confirmado sai do contador
  useEffect(() => {
    setUnseen((prev) => prev.filter((u) => orders.find((o) => o.id === u.id)?.status === 'AGUARDANDO_CONFIRMACAO'));
  }, [orders]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(PREF_KEY, next ? 'on' : 'off');
    } catch {
      // preferência só desta sessão
    }
    if (next) {
      playAlertSound(); // o clique libera o áudio no navegador e serve de teste
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    }
  };

  return { enabled, toggle, unseen, clear: () => setUnseen([]) };
}

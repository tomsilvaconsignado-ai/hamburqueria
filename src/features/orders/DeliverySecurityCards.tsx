import React, { useEffect, useState } from 'react';
import { Bike, KeyRound, Phone, ShieldCheck } from 'lucide-react';
import type { DeliveryCodeInfo, Order } from '../../types';
import { getDeliveryCode } from '../../services/storage';

/** Quem vai entregar: foto e nome, para o cliente conferir na porta. */
export const CourierCard: React.FC<{ order: Order }> = ({ order }) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  if (!order.assigned_courier_name || order.fulfillment_type !== 'DELIVERY') return null;
  const photo = !photoFailed ? order.assigned_courier_photo_url : undefined;
  return (
    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {photo ? (
          <img
            src={photo}
            alt={`Foto de ${order.assigned_courier_name}`}
            onError={() => setPhotoFailed(true)}
            className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-500 shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center shrink-0">
            <Bike className="w-7 h-7" />
          </div>
        )}
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Seu entregador</span>
          <h4 className="text-sm font-bold text-white truncate">{order.assigned_courier_name}</h4>
          {photo && <p className="text-[11px] text-zinc-400">Confira se é ele quem chegou.</p>}
        </div>
      </div>
      {order.assigned_courier_phone && (
        <a
          href={`tel:${order.assigned_courier_phone.replace(/\D/g, '')}`}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-amber-300 hover:text-white shrink-0"
        >
          <Phone className="w-3.5 h-3.5" /> Ligar
        </a>
      )}
    </div>
  );
};

/** Código de entrega: só o cliente vê; passa ao entregador ao receber o pedido. */
export const DeliveryCodeCard: React.FC<{ order: Order }> = ({ order }) => {
  const [info, setInfo] = useState<DeliveryCodeInfo | null>(null);
  const open = order.status !== 'CANCELADO';

  useEffect(() => {
    if (!order.delivery_code_required || !open) return;
    let cancelled = false;
    getDeliveryCode(order.id, order.guest_access_token).then((r) => !cancelled && setInfo(r));
    return () => {
      cancelled = true;
    };
  }, [order.id, order.delivery_code_required, order.status, order.guest_access_token]);

  if (!order.delivery_code_required || !open || !info?.exists || !info.code) return null;

  if (order.status === 'CONCLUIDO' || info.used) {
    return (
      <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0" /> Entrega concluída com segurança.
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-zinc-950 border-2 border-amber-500/60 text-center space-y-2">
      <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1.5">
        <KeyRound className="w-4 h-4" /> Código de entrega
      </p>
      <div className="flex justify-center gap-2" aria-label={`Código de entrega ${info.code.split('').join(' ')}`}>
        {info.code.split('').map((d, i) => (
          <span
            key={i}
            className="w-12 h-14 rounded-xl bg-amber-500 text-zinc-950 text-3xl font-black font-['Bebas_Neue',sans-serif] flex items-center justify-center"
          >
            {d}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-zinc-300">
        Diga este código ao entregador <strong>só quando o pedido estiver nas suas mãos</strong>. A loja nunca pede este
        código por telefone ou mensagem.
      </p>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { DeliveryCodeInfo, Order } from '../../../types';
import { adminDeliveryCode } from '../../../services/storage';

/** Código de entrega no painel: gerar para o pedido, ver o código (para ditar ao cliente) e o resultado. */
export const AdminDeliveryCode: React.FC<{ order: Order }> = ({ order }) => {
  const [info, setInfo] = useState<(DeliveryCodeInfo & { error?: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order.fulfillment_type !== 'DELIVERY') return;
    let alive = true;
    adminDeliveryCode(order.id).then((r) => alive && setInfo(r));
    return () => {
      alive = false;
    };
  }, [order.id, order.status, order.delivery_code_required]);

  if (order.fulfillment_type !== 'DELIVERY') return null;
  const closed = order.status === 'CONCLUIDO' || order.status === 'CANCELADO';

  const generate = async () => {
    setBusy(true);
    const r = await adminDeliveryCode(order.id, true);
    setBusy(false);
    setInfo(r);
  };

  return (
    <section className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs space-y-2">
      <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
        <KeyRound className="w-4 h-4 text-amber-400" /> Código de entrega
      </h4>
      {info?.error && <p className="text-rose-300">{info.error}</p>}
      {!info ? (
        <p className="text-zinc-500">Carregando…</p>
      ) : info.exists && info.code ? (
        <>
          <p className="flex items-center gap-2">
            <span className="font-mono text-2xl font-black tracking-[0.3em] text-amber-400">{info.code}</span>
            <span className="text-zinc-400">o cliente vê este código no acompanhamento</span>
          </p>
          {info.verified_at ? (
            <p className="text-emerald-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Entregue com o código do cliente.
            </p>
          ) : info.override_note ? (
            <p className="text-amber-300 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> Liberado sem código: “{info.override_note}”
            </p>
          ) : (
            <p className="text-zinc-400">
              O entregador vai pedir este código na entrega.
              {info.failed_attempts ? ` Tentativas erradas: ${info.failed_attempts} de 5.` : ''}
            </p>
          )}
        </>
      ) : closed ? (
        <p className="text-zinc-500">Pedido entregue sem código de entrega.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-zinc-400">Proteja a entrega: o entregador só conclui com os 4 números que o cliente recebe.</p>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 font-black cursor-pointer"
          >
            {busy ? 'Gerando…' : 'Gerar código'}
          </button>
        </div>
      )}
    </section>
  );
};

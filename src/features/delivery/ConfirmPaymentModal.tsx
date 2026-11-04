import React, { useEffect, useRef } from 'react';
import { Banknote, CheckCircle2, CreditCard, X } from 'lucide-react';
import type { Order } from '../../types';
import { formatCentsToBRL } from '../../lib/formatters/currency';

interface ConfirmPaymentModalProps {
  order: Order;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmação de que o entregador recebeu o pagamento na entrega (dinheiro ou maquininha). */
export const ConfirmPaymentModal: React.FC<ConfirmPaymentModalProps> = ({ order, busy = false, onConfirm, onCancel }) => {
  const confirmButton = useRef<HTMLButtonElement>(null);
  const isCash = order.payment_method === 'CASH_ON_DELIVERY';
  const changeFor = isCash ? order.cash_change_for_cents ?? 0 : 0;
  const change = changeFor > order.total_cents ? changeFor - order.total_cents : 0;
  const doneText = order.fulfillment_type === 'PICKUP' ? 'O pedido será entregue ao cliente no balcão' : 'A entrega será concluída';

  useEffect(() => {
    confirmButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-payment-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-[#141622] border border-amber-500/40 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl shadow-black/70 overflow-hidden text-white pb-[env(safe-area-inset-bottom)]"
      >
        {/* Faixa com o gradiente da marca */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-red-600" />

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Fechar"
          className="absolute right-4 top-5 w-9 h-9 rounded-full bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pt-7 space-y-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/30">
            {isCash ? <Banknote className="w-8 h-8" /> : <CreditCard className="w-8 h-8" />}
          </div>

          <div className="space-y-1">
            <h2 id="confirm-payment-title" className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide">
              Confirmar recebimento
            </h2>
            <p className="text-xs text-zinc-400">
              {order.order_number} · {order.customer_name}
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Valor a receber</span>
            <p className="text-5xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-amber-400 leading-none">
              {formatCentsToBRL(order.total_cents)}
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
              {isCash ? <Banknote className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
              {isCash ? 'Dinheiro' : 'Cartão na maquininha'}
            </span>
          </div>

          {change > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-left">
              <div>
                <p className="text-[11px] text-emerald-300/80">Cliente paga com {formatCentsToBRL(changeFor)}</p>
                <p className="text-sm font-bold text-emerald-200">Troco a devolver</p>
              </div>
              <span className="text-3xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-emerald-300">
                {formatCentsToBRL(change)}
              </span>
            </div>
          )}

          <p className="text-xs text-zinc-400">
            {isCash
              ? `Confira o dinheiro antes de confirmar. ${doneText} e o valor entra no fechamento do caixa.`
              : `Confirme só depois que a maquininha aprovar o pagamento. ${doneText}.`}
          </p>

          <div className="grid grid-cols-1 gap-2.5">
            <button
              ref={confirmButton}
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-60 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" />
              {busy ? 'Concluindo…' : `Recebi ${formatCentsToBRL(order.total_cents)}`}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs uppercase tracking-wider transition cursor-pointer disabled:opacity-60"
            >
              Ainda não recebi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

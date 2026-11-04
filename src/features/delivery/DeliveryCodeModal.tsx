import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, X, ShieldAlert } from 'lucide-react';
import type { Order } from '../../types';

export interface DeliveryAuth {
  code?: string;
  overrideNote?: string;
}

interface Props {
  order: Order;
  busy?: boolean;
  /** Mensagem do servidor (código errado, bloqueado por tentativas...) */
  error?: string | null;
  locked?: boolean;
  onSubmit: (auth: DeliveryAuth) => void;
  onCancel: () => void;
}

/** Entregador digita o código que o cliente recebeu; sem código, só liberando com uma observação. */
export const DeliveryCodeModal: React.FC<Props> = ({ order, busy = false, error, locked = false, onSubmit, onCancel }) => {
  const [code, setCode] = useState('');
  const [withoutCode, setWithoutCode] = useState(locked);
  const [note, setNote] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (locked) setWithoutCode(true);
  }, [locked]);

  useEffect(() => {
    if (!withoutCode) codeInput.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [withoutCode, busy, onCancel]);

  // Errou o código: limpa para digitar de novo
  useEffect(() => {
    if (error) setCode('');
  }, [error]);

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 4) onSubmit({ code });
  };
  const submitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim().length >= 5) onSubmit({ overrideNote: note.trim() });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-code-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-[#141622] border border-amber-500/40 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl shadow-black/70 overflow-hidden text-white pb-[env(safe-area-inset-bottom)]"
      >
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
            <KeyRound className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 id="delivery-code-title" className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide">
              Código de entrega
            </h2>
            <p className="text-xs text-zinc-400">
              {order.order_number} · {order.customer_name}
            </p>
          </div>

          {error && (
            <p role="alert" className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </p>
          )}

          {!withoutCode ? (
            <form onSubmit={submitCode} className="space-y-4">
              <p className="text-xs text-zinc-300">Peça ao cliente os 4 números que aparecem no acompanhamento do pedido.</p>
              <input
                ref={codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{4}"
                maxLength={4}
                aria-label="Código de 4 dígitos"
                placeholder="••••"
                className="w-48 mx-auto block text-center text-4xl font-black tracking-[0.5em] pl-[0.5em] py-3 rounded-2xl bg-zinc-950 border-2 border-amber-500/60 text-amber-400 placeholder-zinc-700 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 4}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider cursor-pointer"
              >
                {busy ? 'Conferindo…' : 'Confirmar código'}
              </button>
              <button
                type="button"
                onClick={() => setWithoutCode(true)}
                className="text-xs text-zinc-400 underline hover:text-white cursor-pointer"
              >
                Cliente não tem o código? Liberar sem código
              </button>
            </form>
          ) : (
            <form onSubmit={submitNote} className="space-y-3 text-left">
              <p className="text-xs text-amber-200 flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
                <span>Use só se tiver certeza de que é o cliente. A liberação fica registrada com o seu nome e o motivo.</span>
              </p>
              <label htmlFor="override-note" className="text-xs font-bold text-zinc-300 block">
                O que aconteceu?
              </label>
              <textarea
                id="override-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                rows={3}
                placeholder="Ex.: cliente sem celular, confirmou nome e endereço"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={busy || note.trim().length < 5}
                className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-black text-sm uppercase tracking-wider cursor-pointer"
              >
                {busy ? 'Registrando…' : 'Liberar e registrar'}
              </button>
              {!locked && (
                <button
                  type="button"
                  onClick={() => setWithoutCode(false)}
                  className="w-full text-xs text-zinc-400 underline hover:text-white cursor-pointer"
                >
                  Voltar e digitar o código
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

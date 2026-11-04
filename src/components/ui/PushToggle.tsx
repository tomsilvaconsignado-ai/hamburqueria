import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Send, Smartphone } from 'lucide-react';
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../../lib/push';
import { playSound, type SoundName } from '../../lib/sounds';

interface PushToggleProps {
  /** Som da loja tocado ao ativar (teste rápido do áudio deste aparelho) */
  sound?: SoundName;
  className?: string;
}

/** Ativa/desativa as notificações push neste aparelho (equipe da loja). */
export const PushToggle: React.FC<PushToggleProps> = ({ sound = 'novo-pedido', className = '' }) => {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  if (state === 'loading' || state === 'unsupported') return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    run(async () => {
      playSound(sound); // o toque libera o áudio e serve de teste do som
      const res = await enablePush();
      setState(await getPushState());
      setMessage(res.success ? 'Notificações ativadas neste aparelho.' : res.error ?? null);
    });

  const disable = () =>
    run(async () => {
      await disablePush();
      setState(await getPushState());
      setMessage('Notificações desativadas neste aparelho.');
    });

  const test = () =>
    run(async () => {
      const res = await sendTestPush();
      setMessage(res.success ? 'Teste enviado: a notificação deve chegar em alguns segundos.' : res.error ?? null);
    });

  const box = `p-3 rounded-2xl border text-xs space-y-2 ${className}`;

  if (state === 'ios-install') {
    return (
      <div className={`${box} bg-sky-950/40 border-sky-500/40 text-sky-100`}>
        <p className="flex items-start gap-2">
          <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Para receber notificações no iPhone: toque em <strong>Compartilhar</strong> →{' '}
            <strong>Adicionar à Tela de Início</strong>, abra o app pelo ícone e ative aqui.
          </span>
        </p>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className={`${box} bg-rose-950/40 border-rose-500/40 text-rose-200`}>
        <p className="flex items-start gap-2">
          <BellOff className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Notificações bloqueadas neste aparelho. Libere nas configurações do navegador (cadeado ao lado do endereço → Notificações).</span>
        </p>
      </div>
    );
  }

  return (
    <div className={`${box} ${state === 'on' ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-100' : 'bg-amber-950/30 border-amber-500/40 text-amber-100'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold">
          {state === 'on' ? <BellRing className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          {state === 'on' ? 'Notificações no celular ativadas' : 'Receba os avisos no celular, mesmo com o app fechado'}
        </span>
        <div className="flex gap-2">
          {state === 'on' ? (
            <>
              <button type="button" disabled={busy} onClick={test} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold cursor-pointer disabled:opacity-60">
                <Send className="w-3.5 h-3.5" /> Testar
              </button>
              <button type="button" disabled={busy} onClick={disable} className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold cursor-pointer disabled:opacity-60">
                Desativar
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={enable} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black cursor-pointer disabled:opacity-60">
              <BellRing className="w-3.5 h-3.5" /> {busy ? 'Ativando…' : 'Ativar notificações'}
            </button>
          )}
        </div>
      </div>
      {message && <p className="text-[11px] opacity-90">{message}</p>}
    </div>
  );
};

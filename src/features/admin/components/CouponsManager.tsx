import React, { useEffect, useState } from 'react';
import { Copy, Dices, Plus, Tag, Trash2, CheckCircle } from 'lucide-react';
import type { Coupon } from '../../../types';
import { deleteCoupon, listCoupons, saveCoupon } from '../../../services/storage';
import { formatCentsToBRL } from '../../../lib/formatters/currency';

// Sem letras/números que se confundem (O/0, I/1) para ditar o código por telefone
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCouponCode(prefix = '', length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return prefix + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

type Validity = 'TODAY' | 'DAYS' | 'NONE';

/** Fim do dia de hoje no horário do aparelho (23:59:59) */
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d;
};

function couponState(c: Coupon): { label: string; tone: string } {
  if (!c.is_active) return { label: 'Desativado', tone: 'bg-zinc-800 text-zinc-400' };
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { label: 'Vencido', tone: 'bg-rose-500/20 text-rose-300' };
  if (c.max_redemptions != null && c.redemptions_count >= c.max_redemptions) return { label: 'Esgotado', tone: 'bg-amber-500/20 text-amber-300' };
  return { label: 'Ativo', tone: 'bg-emerald-500/20 text-emerald-300' };
}

const field = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white';

/** Cupons de desconto: o admin cria o código do dia (aleatório ou escolhido) e acompanha os usos. */
export const CouponsManager: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [code, setCode] = useState(() => randomCouponCode());
  const [percent, setPercent] = useState('10');
  const [validity, setValidity] = useState<Validity>('TODAY');
  const [days, setDays] = useState('7');
  const [maxUses, setMaxUses] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = () => listCoupons().then((list) => {
    setCoupons(list);
    setLoading(false);
  });
  useEffect(() => {
    reload();
  }, []);

  const flash = (ok: boolean, text: string) => {
    setMessage({ ok, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const create = async () => {
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
    const pct = Number(percent);
    if (!/^[A-Z0-9_-]{3,30}$/.test(cleanCode)) return flash(false, 'O código precisa ter de 3 a 30 letras ou números, sem espaços.');
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return flash(false, 'O desconto precisa ser de 1% a 100%.');
    const uses = maxUses.trim() ? Number(maxUses) : undefined;
    if (uses != null && (!Number.isInteger(uses) || uses < 1)) return flash(false, 'Limite de usos inválido.');
    const min = minOrder.trim() ? Math.round(Number(minOrder.replace(/\./g, '').replace(',', '.')) * 100) : undefined;
    if (min != null && (!Number.isFinite(min) || min < 0)) return flash(false, 'Pedido mínimo inválido.');
    const expires =
      validity === 'TODAY'
        ? endOfToday()
        : validity === 'DAYS'
        ? new Date(endOfToday().getTime() + (Math.max(1, Number(days) || 1) - 1) * 86400000)
        : undefined;

    setSaving(true);
    const res = await saveCoupon(
      {
        code: cleanCode,
        percent_off: pct,
        description: description.trim() || `${pct}% de desconto`,
        is_active: true,
        first_order_only: firstOrderOnly,
        max_redemptions: uses,
        min_order_cents: min,
        expires_at: expires?.toISOString(),
      },
      true
    );
    setSaving(false);
    if (!res.success) return flash(false, res.error || 'Não foi possível criar o cupom.');
    flash(true, `Cupom ${cleanCode} criado: ${pct}% de desconto${expires ? ` até ${expires.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.`);
    setCode(randomCouponCode());
    setDescription('');
    reload();
  };

  const toggle = async (c: Coupon) => {
    const res = await saveCoupon({ code: c.code, is_active: !c.is_active }, false);
    if (!res.success) flash(false, res.error || 'Falha ao atualizar.');
    reload();
  };

  const remove = async (c: Coupon) => {
    if (!window.confirm(`Apagar o cupom ${c.code}? Pedidos que já usaram continuam registrados.`)) return;
    const res = await deleteCoupon(c.code);
    if (!res.success) flash(false, res.error || 'Falha ao apagar.');
    reload();
  };

  const copy = (c: Coupon) => {
    navigator.clipboard.writeText(c.code);
    setCopied(c.code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
        <p className="font-bold text-white flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-amber-400" /> Novo cupom
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-zinc-400 block mb-1">Código</label>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={30}
                className={`${field} font-mono tracking-widest uppercase`}
                aria-label="Código do cupom"
              />
              <button
                type="button"
                onClick={() => setCode(randomCouponCode())}
                title="Gerar outro código aleatório"
                className="px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Dices className="w-4 h-4" /> Sortear
              </button>
            </div>
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Desconto (%)</label>
            <input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-zinc-400 block mb-1">Validade</label>
            <select value={validity} onChange={(e) => setValidity(e.target.value as Validity)} className={field}>
              <option value="TODAY">Só hoje (até 23:59)</option>
              <option value="DAYS">Por alguns dias</option>
              <option value="NONE">Sem data para acabar</option>
            </select>
          </div>
          {validity === 'DAYS' && (
            <div>
              <label className="text-zinc-400 block mb-1">Quantos dias (contando hoje)</label>
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className={field} />
            </div>
          )}
          <div>
            <label className="text-zinc-400 block mb-1">Limite de usos (vazio = sem limite)</label>
            <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Ex.: 50" className={field} />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Pedido mínimo em R$ (opcional)</label>
            <input type="text" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="Ex.: 40,00" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-zinc-400 block mb-1">Descrição (aparece só para você)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Promoção de terça" maxLength={120} className={field} />
          </div>
          <label className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer">
            <input type="checkbox" checked={firstOrderOnly} onChange={(e) => setFirstOrderOnly(e.target.checked)} className="accent-amber-500" />
            <span className="text-zinc-200">Só para o primeiro pedido do cliente (pelo telefone)</span>
          </label>
        </div>

        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 font-black uppercase tracking-wide cursor-pointer"
        >
          {saving ? 'Criando…' : 'Criar cupom'}
        </button>
        {message && <p className={message.ok ? 'text-emerald-300' : 'text-rose-300'}>{message.text}</p>}
      </div>

      <div className="space-y-2">
        {loading && <p className="text-zinc-500">Carregando cupons…</p>}
        {!loading && coupons.length === 0 && <p className="text-zinc-500">Nenhum cupom criado ainda.</p>}
        {coupons.map((c) => {
          const state = couponState(c);
          return (
            <div key={c.code} className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-amber-400" />
                  <span className="font-mono font-black text-sm text-white tracking-widest">{c.code}</span>
                  <span className="font-black text-amber-400">-{c.percent_off}%</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${state.tone}`}>{state.label}</span>
                </div>
                <p className="text-zinc-400 mt-1">
                  {c.description ? `${c.description} · ` : ''}
                  {c.redemptions_count} uso(s){c.max_redemptions != null ? ` de ${c.max_redemptions}` : ''}
                  {c.expires_at ? ` · até ${new Date(c.expires_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ' · sem validade'}
                  {c.min_order_cents ? ` · mínimo ${formatCentsToBRL(c.min_order_cents)}` : ''}
                  {c.first_order_only ? ' · só primeiro pedido' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => copy(c)} title="Copiar código" className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 cursor-pointer">
                  {copied === c.code ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${c.is_active ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
                >
                  {c.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button type="button" onClick={() => remove(c)} title="Apagar cupom" className="p-2 rounded-lg bg-zinc-900 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

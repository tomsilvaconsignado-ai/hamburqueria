import React, { useEffect, useState } from 'react';
import { Wallet, Printer, Plus, Trash2, Loader2, Lock, Info, TrendingUp, TrendingDown } from 'lucide-react';
import type { StoreSettings } from '../../../types';
import { formatCentsToBRL, parseBRLToCents } from '../../../lib/formatters/currency';
import { formatDateTimeBR } from '../../../lib/formatters/date';
import { EXPENSE_METHOD_LABEL, PAYMENT_METHOD_LABEL } from '../../../lib/labels';
import { FINANCE_NOTE, printCashClosing, printSalesReport } from '../../../lib/documents/templates';
import {
  ADMIN_DATA_AVAILABLE,
  addExpense,
  CashClosing,
  closeCash,
  deleteExpense,
  Expense,
  ExpenseMethod,
  fetchCashClosings,
  fetchExpenses,
  fetchReport,
  localDate,
  Report,
} from '../../../services/admin.service';
import { PeriodPicker, Period, periodFor, previousPeriod, formatPeriod } from '../components/PeriodPicker';

const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500';
const EXPENSE_CATEGORIES = ['Insumos', 'Embalagens', 'Entregadores', 'Aluguel', 'Energia/Água/Gás', 'Salários', 'Marketing', 'Taxas e tarifas', 'Manutenção', 'Outros'];

const pctChange = (now: number, before: number) => (before ? ((now - before) / Math.abs(before)) * 100 : null);

const Delta: React.FC<{ now: number; before?: number; inverse?: boolean }> = ({ now, before, inverse }) => {
  if (before === undefined) return null;
  const p = pctChange(now, before);
  if (p === null) return <span className="text-[10px] text-zinc-500">sem base anterior</span>;
  const good = inverse ? p <= 0 : p >= 0;
  const Icon = p >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon className="w-3 h-3" /> {p >= 0 ? '+' : ''}{p.toFixed(0)}% vs. período anterior
    </span>
  );
};

const Card: React.FC<{ label: string; value: number; before?: number; money?: boolean; inverse?: boolean; strong?: boolean }> = ({ label, value, before, money = true, inverse, strong }) => (
  <div className={`p-4 rounded-2xl border ${strong ? 'bg-amber-500/10 border-amber-500/40' : 'bg-[#141620] border-zinc-800'}`}>
    <span className="block text-[10px] uppercase tracking-wider text-zinc-400">{label}</span>
    <span className="block text-lg font-black text-white tabular-nums">{money ? formatCentsToBRL(value) : value}</span>
    <Delta now={value} before={before} inverse={inverse} />
  </div>
);

const Breakdown: React.FC<{ title: string; rows: { label: string; detail: string; value: number }[] }> = ({ title, rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="p-5 rounded-3xl bg-[#141620] border border-zinc-800 space-y-3">
      <h3 className="text-xs font-black uppercase tracking-wider text-white">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-zinc-500 py-4 text-center">Nenhum dado no período.</p> : rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex justify-between text-xs gap-2">
            <span className="text-zinc-200 truncate">{r.label}</span>
            <span className="text-white font-bold tabular-nums whitespace-nowrap">{formatCentsToBRL(r.value)} <span className="text-zinc-500 font-normal">· {r.detail}</span></span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden" aria-hidden><div className="h-full bg-amber-500" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </section>
  );
};

export const AdminFinancePage: React.FC<{ settings: StoreSettings }> = ({ settings }) => {
  const [period, setPeriod] = useState<Period>(() => periodFor('MONTH'));
  const [report, setReport] = useState<Report | null>(null);
  const [previous, setPrevious] = useState<Report | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [closings, setClosings] = useState<CashClosing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  // Formulário de despesa
  const [exp, setExp] = useState({ expense_date: localDate(), category: 'Insumos', description: '', amount: '', payment_method: 'PIX' as ExpenseMethod });
  const [expSaving, setExpSaving] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  // Fechamento de caixa
  const [cash, setCash] = useState({ date: localDate(), opening: '', counted: '', notes: '' });
  const [cashSaving, setCashSaving] = useState(false);
  const [cashMsg, setCashMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!ADMIN_DATA_AVAILABLE) return;
    let alive = true;
    setLoading(true);
    const prev = previousPeriod(period);
    Promise.all([fetchReport(period.from, period.to), fetchReport(prev.from, prev.to), fetchExpenses(period.from, period.to), fetchCashClosings()]).then(
      ([r, p, e, c]) => {
        if (!alive) return;
        setLoading(false);
        setError(r.error ?? e.error ?? null);
        setReport(r.data ?? null);
        setPrevious(p.data ?? null);
        setExpenses(e.data ?? []);
        setClosings(c.data ?? []);
      }
    );
    return () => {
      alive = false;
    };
  }, [period.from, period.to, reload]);

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpError(null);
    const amount_cents = parseBRLToCents(exp.amount);
    if (!exp.description.trim()) return setExpError('Descreva a despesa.');
    if (amount_cents <= 0) return setExpError('Informe um valor maior que zero.');
    setExpSaving(true);
    const r = await addExpense({ expense_date: exp.expense_date, category: exp.category, description: exp.description.trim(), amount_cents, payment_method: exp.payment_method });
    setExpSaving(false);
    if (r.error) return setExpError(r.error);
    setExp((x) => ({ ...x, description: '', amount: '' }));
    setReload((n) => n + 1);
  };

  const removeExpense = async (x: Expense) => {
    if (!window.confirm(`Apagar a despesa "${x.description}" de ${formatCentsToBRL(x.amount_cents)}? A exclusão fica registrada na auditoria.`)) return;
    const r = await deleteExpense(x.id);
    if (r.error) window.alert(r.error);
    setReload((n) => n + 1);
  };

  const submitCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashMsg(null);
    if (cash.counted.trim() === '') return setCashMsg({ ok: false, text: 'Informe quanto foi contado em dinheiro no caixa.' });
    const existing = closings.find((c) => c.business_date === cash.date);
    if (existing && !window.confirm('Este dia já foi fechado. Refazer o fechamento substitui o anterior (fica registrado na auditoria). Continuar?')) return;
    setCashSaving(true);
    const r = await closeCash(cash.date, parseBRLToCents(cash.opening || '0'), parseBRLToCents(cash.counted), cash.notes);
    setCashSaving(false);
    if (r.error || !r.data) return setCashMsg({ ok: false, text: r.error ?? 'Não foi possível fechar o caixa.' });
    const d = r.data.difference_cents;
    setCashMsg({ ok: d === 0, text: d === 0 ? 'Caixa fechado e batendo.' : `Caixa fechado com ${d > 0 ? 'sobra' : 'falta'} de ${formatCentsToBRL(Math.abs(d))}.` });
    setReload((n) => n + 1);
    printCashClosing(r.data, settings);
  };

  if (!ADMIN_DATA_AVAILABLE) {
    return <p className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">O financeiro usa o banco de dados e não está disponível no modo demonstração.</p>;
  }

  const s = report?.summary;
  const ps = previous?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-amber-500" /> FINANCEIRO & CAIXA
          </h2>
          <p className="text-xs text-zinc-400">Faturamento, despesas e fechamento de caixa calculados no servidor, no horário de Brasília.</p>
        </div>
        <button
          onClick={() => report && printSalesReport(report, settings, period.from === period.to ? 'Relatório diário de vendas' : 'Relatório financeiro')}
          disabled={!report}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white font-bold text-xs border border-zinc-700 cursor-pointer"
        >
          <Printer className="w-4 h-4 text-amber-400" /> Imprimir / PDF
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} presets={['TODAY', 'YESTERDAY', '7D', 'MONTH', 'LAST_MONTH']} />
        {loading && <span className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Atualizando…</span>}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card label="Faturamento bruto" value={s.gross_cents} before={ps?.gross_cents} />
            <Card label="(−) Descontos" value={s.discounts_cents} before={ps?.discounts_cents} inverse />
            <Card label="Faturamento líquido" value={s.net_cents} before={ps?.net_cents} strong />
            <Card label="(−) Despesas lançadas" value={s.expenses_cents} before={ps?.expenses_cents} inverse />
            <Card label="Saldo do período" value={s.balance_cents} before={ps?.balance_cents} strong />
            <Card label="Ticket médio" value={s.avg_ticket_cents} before={ps?.avg_ticket_cents} />
            <Card label="Taxas de entrega" value={s.delivery_fees_cents} before={ps?.delivery_fees_cents} />
            <Card label="Pedidos concluídos" value={s.orders_completed} before={ps?.orders_completed} money={false} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <p className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">Cancelados: <b className="text-rose-300">{s.orders_cancelled}</b> · {formatCentsToBRL(s.cancelled_cents)}</p>
            <p className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">Em andamento (ainda não faturado): <b className="text-amber-300">{s.orders_in_progress}</b> · {formatCentsToBRL(s.in_progress_cents)}</p>
            <p className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">Comparado com {previous ? formatPeriod({ preset: 'CUSTOM', from: previous.from, to: previous.to }) : '—'}</p>
          </div>
          <p className="text-[11px] text-zinc-500 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {FINANCE_NOTE}</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Breakdown title="Por forma de pagamento" rows={report!.by_payment.map((p) => ({ label: PAYMENT_METHOD_LABEL[p.method] ?? p.method, detail: `${p.orders} pedidos`, value: p.net_cents }))} />
            <Breakdown title="Por categoria" rows={report!.by_category.map((c) => ({ label: c.name, detail: `${c.quantity} itens`, value: c.revenue_cents }))} />
            <Breakdown title="Produtos (top 10)" rows={report!.by_product.slice(0, 10).map((p) => ({ label: p.name, detail: `${p.quantity} un.`, value: p.revenue_cents }))} />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Despesas */}
        <section className="p-5 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-white">Despesas de {formatPeriod(period)}</h3>
          <form onSubmit={submitExpense} className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <input className={`${input} [color-scheme:dark] sm:col-span-2`} type="date" aria-label="Data da despesa" value={exp.expense_date} max={localDate()} onChange={(e) => setExp({ ...exp, expense_date: e.target.value })} />
            <select className={`${input} sm:col-span-2`} aria-label="Categoria" value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className={`${input} sm:col-span-2`} aria-label="Pago com" value={exp.payment_method} onChange={(e) => setExp({ ...exp, payment_method: e.target.value as ExpenseMethod })}>
              {Object.entries(EXPENSE_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={`${input} col-span-2 sm:col-span-3`} aria-label="Descrição" placeholder="Descrição (ex: compra de pães)" maxLength={200} value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} />
            <input className={input} aria-label="Valor" inputMode="decimal" placeholder="R$ 0,00" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} />
            <button type="submit" disabled={expSaving} className="sm:col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 text-xs font-black cursor-pointer">
              {expSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Lançar despesa
            </button>
          </form>
          {expError && <p className="text-xs text-rose-300">{expError}</p>}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800">
            {expenses.length === 0 ? <p className="text-xs text-zinc-500 py-4 text-center">Nenhuma despesa lançada no período.</p> : expenses.map((x) => (
              <div key={x.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="text-white font-bold truncate">{x.description}</p>
                  <p className="text-zinc-500">{x.expense_date.split('-').reverse().join('/')} · {x.category} · {EXPENSE_METHOD_LABEL[x.payment_method]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-rose-300 tabular-nums">{formatCentsToBRL(x.amount_cents)}</span>
                  <button type="button" onClick={() => removeExpense(x)} aria-label={`Apagar ${x.description}`} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-zinc-800 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Fechamento de caixa */}
        <section className="p-5 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5"><Lock className="w-4 h-4 text-amber-400" /> Fechamento de caixa</h3>
          <p className="text-[11px] text-zinc-400">
            Esperado em dinheiro = troco inicial + vendas em dinheiro concluídas no dia − despesas pagas em dinheiro no dia. Cartão e PIX entram no resumo, mas não na gaveta.
          </p>
          <form onSubmit={submitCash} className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400 space-y-1">Dia<input className={`${input} [color-scheme:dark]`} type="date" value={cash.date} max={localDate()} onChange={(e) => setCash({ ...cash, date: e.target.value })} /></label>
            <label className="text-[11px] text-zinc-400 space-y-1">Troco inicial<input className={input} inputMode="decimal" placeholder="R$ 0,00" value={cash.opening} onChange={(e) => setCash({ ...cash, opening: e.target.value })} /></label>
            <label className="text-[11px] text-zinc-400 space-y-1 col-span-2">Dinheiro contado na gaveta *<input className={input} inputMode="decimal" placeholder="R$ 0,00" value={cash.counted} onChange={(e) => setCash({ ...cash, counted: e.target.value })} /></label>
            <label className="text-[11px] text-zinc-400 space-y-1 col-span-2">Observações<input className={input} maxLength={1000} value={cash.notes} onChange={(e) => setCash({ ...cash, notes: e.target.value })} /></label>
            <button type="submit" disabled={cashSaving} className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-black cursor-pointer">
              {cashSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Fechar caixa e imprimir
            </button>
          </form>
          {cashMsg && <p className={`text-xs font-bold ${cashMsg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{cashMsg.text}</p>}
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Últimos fechamentos</h4>
            {closings.length === 0 ? <p className="text-xs text-zinc-500">Nenhum fechamento ainda.</p> : closings.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-200">{c.business_date.split('-').reverse().join('/')} <span className="text-zinc-500">· {formatDateTimeBR(c.closed_at)}</span></span>
                <span className="flex items-center gap-2">
                  <span className={`font-bold tabular-nums ${c.difference_cents === 0 ? 'text-emerald-300' : c.difference_cents > 0 ? 'text-sky-300' : 'text-rose-300'}`}>
                    {c.difference_cents === 0 ? 'batendo' : `${c.difference_cents > 0 ? '+' : ''}${formatCentsToBRL(c.difference_cents)}`}
                  </span>
                  <button type="button" onClick={() => printCashClosing(c, settings)} aria-label="Reimprimir fechamento" className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"><Printer className="w-3.5 h-3.5" /></button>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

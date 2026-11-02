import React, { useEffect, useState } from 'react';
import { BarChart3, Printer, FileSpreadsheet, Loader2, Clock, Flame, XCircle, CalendarDays } from 'lucide-react';
import type { StoreSettings } from '../../../types';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { formatDateTimeBR } from '../../../lib/formatters/date';
import { PAYMENT_METHOD_LABEL } from '../../../lib/labels';
import { downloadCSV } from '../../../services/storage';
import { printSalesReport } from '../../../lib/documents/templates';
import { ADMIN_DATA_AVAILABLE, fetchReport, Report } from '../../../services/admin.service';
import { PeriodPicker, Period, periodFor, formatPeriod } from '../components/PeriodPicker';

interface AdminReportsPageProps {
  settings: StoreSettings;
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const toCsv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
const reais = (cents: number) => (Number(cents) / 100).toFixed(2).replace('.', ',');

const Bars: React.FC<{ items: { label: string; value: number; tip: string }[]; height?: string }> = ({ items, height = 'h-40' }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={`flex items-end gap-1 ${height}`} role="img" aria-label={items.map((i) => `${i.label}: ${i.tip}`).join(', ')}>
      {items.map((i) => (
        <div key={i.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full group">
          <div className="opacity-0 group-hover:opacity-100 mb-1 px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-amber-300 whitespace-nowrap">{i.tip}</div>
          <div
            style={{ height: `${i.value ? Math.max(3, (i.value / max) * 100) : 1}%` }}
            className="w-full rounded-t-md bg-zinc-600 group-hover:bg-amber-500"
          />
          <span className="mt-1 text-[9px] text-zinc-500 truncate w-full text-center">{i.label}</span>
        </div>
      ))}
    </div>
  );
};

export const AdminReportsPage: React.FC<AdminReportsPageProps> = ({ settings }) => {
  const [period, setPeriod] = useState<Period>(() => periodFor('30D'));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ADMIN_DATA_AVAILABLE) return;
    let alive = true;
    setLoading(true);
    fetchReport(period.from, period.to).then((r) => {
      if (!alive) return;
      setLoading(false);
      setError(r.error ?? null);
      setReport(r.data ?? null);
    });
    return () => {
      alive = false;
    };
  }, [period.from, period.to]);

  if (!ADMIN_DATA_AVAILABLE) {
    return <p className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">Os relatórios usam o banco de dados e não estão disponíveis no modo demonstração.</p>;
  }

  const s = report?.summary;
  const cancelRate = s && s.orders_total ? ((s.orders_cancelled / s.orders_total) * 100).toFixed(1) : '0.0';
  const title =
    period.from === period.to ? 'Relatório diário de vendas' : period.preset === 'MONTH' || period.preset === 'LAST_MONTH' ? 'Relatório mensal de vendas' : 'Relatório de vendas';

  const exportCsv = () => {
    if (!report) return;
    const parts = [
      csvCell(`${title} · ${formatPeriod(period)}`),
      toCsv(['Dia', 'Pedidos concluídos', 'Líquido (R$)', 'Cancelados'], report.by_day.map((d) => [d.date.split('-').reverse().join('/'), d.orders, reais(d.net_cents), d.cancelled])),
      '',
      toCsv(['Produto', 'Quantidade', 'Receita (R$)'], report.by_product.map((p) => [p.name, p.quantity, reais(p.revenue_cents)])),
      '',
      toCsv(['Categoria', 'Quantidade', 'Receita (R$)'], report.by_category.map((c) => [c.name, c.quantity, reais(c.revenue_cents)])),
      '',
      toCsv(['Forma de pagamento', 'Pedidos', 'Valor (R$)'], report.by_payment.map((p) => [PAYMENT_METHOD_LABEL[p.method] ?? p.method, p.orders, reais(p.net_cents)])),
    ];
    downloadCSV(`relatorio-burgerhub-${period.from}-a-${period.to}.csv`, '﻿' + parts.join('\n'));
  };

  // Horário: mostra das 6h às 5h do dia seguinte (madrugada no fim), cobrindo turnos noturnos
  const hours = Array.from({ length: 24 }, (_, i) => (i + 6) % 24).map((h) => {
    const n = report?.by_hour.find((x) => x.hour === h)?.orders ?? 0;
    return { label: `${h}h`, value: n, tip: `${h}h: ${n} pedidos` };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-500" /> RELATÓRIOS DE VENDAS & DESEMPENHO
          </h2>
          <p className="text-xs text-zinc-400">Todo o histórico de pedidos, calculado no servidor no horário de Brasília.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => report && printSalesReport(report, settings, title)} disabled={!report} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white font-bold text-xs border border-zinc-700 cursor-pointer">
            <Printer className="w-4 h-4 text-amber-400" /> Imprimir / PDF
          </button>
          <button onClick={exportCsv} disabled={!report} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white font-bold text-xs border border-zinc-700 cursor-pointer">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} presets={['TODAY', '7D', '30D', 'MONTH', 'LAST_MONTH']} />
        {loading && <span className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Atualizando…</span>}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}

      {s && report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              ['Pedidos concluídos', String(s.orders_completed)],
              ['Faturamento líquido', formatCentsToBRL(s.net_cents)],
              ['Ticket médio', formatCentsToBRL(s.avg_ticket_cents)],
              ['Entrega / retirada', `${s.delivery_count} / ${s.pickup_count}`],
              ['Taxa de cancelamento', `${cancelRate}%`],
            ].map(([l, v]) => (
              <div key={l} className="p-4 rounded-2xl bg-[#141620] border border-zinc-800">
                <span className="block text-[10px] uppercase tracking-wider text-zinc-400">{l}</span>
                <span className="text-lg font-black text-white tabular-nums">{v}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="xl:col-span-2 p-5 rounded-3xl bg-[#141620] border border-zinc-800 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-amber-400" /> Vendas por dia</h3>
              <Bars items={report.by_day.map((d) => ({ label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`, value: Number(d.net_cents), tip: `${formatCentsToBRL(d.net_cents)} · ${d.orders} ped.` }))} />
            </section>
            <section className="p-5 rounded-3xl bg-[#141620] border border-zinc-800 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-400" /> Pedidos por horário</h3>
              <Bars height="h-32" items={hours} />
              <p className="text-[10px] text-zinc-500">Ajuda a dimensionar equipe e entregadores nos horários de pico.</p>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="p-5 rounded-3xl bg-[#141620] border border-zinc-800 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5"><Flame className="w-4 h-4 text-amber-400" /> Produtos mais vendidos</h3>
              {report.by_product.length === 0 ? <p className="text-xs text-zinc-500 py-4 text-center">Nenhuma venda concluída no período.</p> : (
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-zinc-500"><tr><th className="text-left py-1">#</th><th className="text-left">Produto</th><th className="text-right">Qtd</th><th className="text-right">Receita</th></tr></thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {report.by_product.slice(0, 15).map((p, i) => (
                      <tr key={p.name}><td className="py-1.5 text-zinc-500">{i + 1}</td><td className="text-zinc-200">{p.name}</td><td className="text-right tabular-nums">{p.quantity}</td><td className="text-right font-bold tabular-nums">{formatCentsToBRL(p.revenue_cents)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="p-5 rounded-3xl bg-[#141620] border border-zinc-800 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5"><XCircle className="w-4 h-4 text-rose-400" /> Cancelamentos ({s.orders_cancelled} · {formatCentsToBRL(s.cancelled_cents)})</h3>
              {report.cancellations.length === 0 ? <p className="text-xs text-zinc-500 py-4 text-center">Nenhum cancelamento no período.</p> : (
                <ul className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto text-xs">
                  {report.cancellations.map((c) => (
                    <li key={c.order_number} className="py-1.5 flex justify-between gap-2">
                      <span><b className="text-amber-400">{c.order_number}</b> <span className="text-zinc-500">{formatDateTimeBR(c.created_at)}</span><span className="block text-zinc-400">{c.reason || 'Sem motivo'}</span></span>
                      <span className="font-bold tabular-nums">{formatCentsToBRL(c.total_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p className="text-[11px] text-zinc-500">Bruto, descontos, despesas, saldo e fechamento de caixa ficam em Financeiro & Caixa; o histórico por entregador fica em Entregadores.</p>
        </>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { History, Loader2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { formatTimeBR, formatDateTimeBR } from '../../../lib/formatters/date';
import { ADMIN_DATA_AVAILABLE, CourierReportRow, fetchCourierReport } from '../../../services/admin.service';
import { PeriodPicker, Period, periodFor, formatPeriod } from './PeriodPicker';

const DELIVERY_STATUS: Record<string, string> = {
  ATRIBUIDA: 'Atribuída',
  COLETADA: 'Coletada',
  EM_ROTA: 'Em rota',
  ENTREGUE: 'Entregue',
  FALHOU: 'Falhou',
  CANCELADA: 'Cancelada',
};

const minutesBetween = (a?: string | null, b?: string | null) =>
  a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : null;

/** Entregas por entregador no período: quantidade, valores, horários e quem atribuiu. */
export const CourierHistoryPanel: React.FC = () => {
  const [period, setPeriod] = useState<Period>(() => periodFor('TODAY'));
  const [rows, setRows] = useState<CourierReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!ADMIN_DATA_AVAILABLE) return;
    let alive = true;
    setRows(null);
    fetchCourierReport(period.from, period.to).then((r) => {
      if (!alive) return;
      setError(r.error ?? null);
      setRows(r.data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [period.from, period.to]);

  if (!ADMIN_DATA_AVAILABLE) return null;
  const totalFees = (rows ?? []).reduce((s, c) => s + Number(c.fees_cents), 0);
  const totalDelivered = (rows ?? []).reduce((s, c) => s + c.delivered_count, 0);

  return (
    <section className="p-6 rounded-3xl bg-[#141622] border border-zinc-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2"><History className="w-5 h-5 text-amber-400" /> Histórico de entregas</h3>
          <p className="text-xs text-zinc-400">
            {formatPeriod(period)} · {totalDelivered} entregas · {formatCentsToBRL(totalFees)} em taxas de entrega (valor cobrado do cliente; o repasse ao entregador é combinado à parte)
          </p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} presets={['TODAY', 'YESTERDAY', '7D', 'MONTH']} />
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {!rows ? (
        <p className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-zinc-500">Nenhum entregador cadastrado.</p>
      ) : (
        <div className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 overflow-hidden">
          {rows.map((c) => (
            <div key={c.courier_id}>
              <button
                type="button"
                onClick={() => setOpen(open === c.courier_id ? null : c.courier_id)}
                aria-expanded={open === c.courier_id}
                className="w-full flex items-center justify-between gap-3 p-3 bg-zinc-950 hover:bg-zinc-900 text-left cursor-pointer"
              >
                <span>
                  <span className="text-sm font-bold text-white">{c.full_name}</span>
                  <span className="block text-[11px] text-zinc-400">{c.phone}</span>
                </span>
                <span className="flex items-center gap-4 text-xs">
                  <span className="text-zinc-300"><b className="text-emerald-300">{c.delivered_count}</b> entregues</span>
                  {c.in_route_count > 0 && <span className="text-zinc-300"><b className="text-indigo-300">{c.in_route_count}</b> em andamento</span>}
                  <span className="font-black text-white tabular-nums">{formatCentsToBRL(c.fees_cents)}</span>
                  {open === c.courier_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>
              {open === c.courier_id && (
                <div className="overflow-x-auto bg-zinc-900/40">
                  {c.deliveries.length === 0 ? (
                    <p className="p-4 text-xs text-zinc-500">Nenhuma entrega no período.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="text-zinc-500 uppercase text-[10px]">
                        <tr>
                          <th className="p-2 text-left">Pedido</th>
                          <th className="p-2 text-left">Cliente / bairro</th>
                          <th className="p-2 text-left">Atribuído</th>
                          <th className="p-2 text-left">Saída</th>
                          <th className="p-2 text-left">Entrega</th>
                          <th className="p-2 text-left">Situação</th>
                          <th className="p-2 text-right">Taxa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                        {c.deliveries.map((d) => {
                          const route = minutesBetween(d.out_for_delivery_at, d.delivered_at);
                          return (
                            <tr key={d.order_id}>
                              <td className="p-2 font-bold text-amber-400">{d.order_number}</td>
                              <td className="p-2">{d.customer_name}<span className="block text-[10px] text-zinc-500">{d.neighborhood ?? ''}</span></td>
                              <td className="p-2" title={formatDateTimeBR(d.assigned_at)}>
                                {formatTimeBR(d.assigned_at)}
                                <span className="block text-[10px] text-zinc-500">por {d.assigned_by_name ?? '—'}</span>
                              </td>
                              <td className="p-2">{d.out_for_delivery_at ? formatTimeBR(d.out_for_delivery_at) : '—'}</td>
                              <td className="p-2">
                                {d.delivered_at ? formatTimeBR(d.delivered_at) : '—'}
                                {route !== null && <span className="block text-[10px] text-zinc-500">{route} min em rota</span>}
                              </td>
                              <td className="p-2">
                                {DELIVERY_STATUS[d.status] ?? d.status}
                                {d.payment_collected && <span className="flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="w-3 h-3" /> pagamento recebido</span>}
                              </td>
                              <td className="p-2 text-right font-bold tabular-nums">{formatCentsToBRL(d.fee_cents)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  DollarSign,
  Clock,
  Bike,
  PlusCircle,
  FileText,
  Calendar,
  Flame,
  ArrowRight,
  Eye,
  Users,
  Trophy,
  Loader2,
} from 'lucide-react';
import { Order, Product, Courier } from '../../../types';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { formatDateTimeBR } from '../../../lib/formatters/date';
import { STATUS_LABEL, STATUS_STYLE } from '../../../lib/labels';
import { ADMIN_DATA_AVAILABLE, fetchReport, localDate, Report, shiftDate } from '../../../services/admin.service';
import { periodFor, previousPeriod } from '../components/PeriodPicker';

interface AdminOverviewProps {
  orders: Order[];
  products: Product[];
  couriers: Courier[];
  onNavigateTab: (tab: 'pedidos' | 'produtos' | 'entregadores' | 'relatorios' | 'financeiro' | 'clientes') => void;
  onOpenNewProductModal: () => void;
  onOpenNewCourierModal: () => void;
}

interface Snapshot {
  today?: Report;
  yesterday?: Report;
  month?: Report;
  prevMonth?: Report;
  week?: Report;
}

const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const Trend: React.FC<{ now?: number; before?: number; label: string }> = ({ now, before, label }) => {
  if (now === undefined || before === undefined) return <span className="text-[10px] text-zinc-500">{label}</span>;
  if (!before) return <span className="text-[10px] text-zinc-500">{label}: sem base</span>;
  const p = ((now - before) / before) * 100;
  const Icon = p >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${p >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon className="w-3 h-3" /> {p >= 0 ? '+' : ''}{p.toFixed(0)}% {label}
    </span>
  );
};

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  orders,
  products,
  couriers,
  onNavigateTab,
  onOpenNewProductModal,
  onOpenNewCourierModal,
}) => {
  const [data, setData] = useState<Snapshot>({});
  const [loading, setLoading] = useState(ADMIN_DATA_AVAILABLE);

  // Números oficiais vêm do banco (todo o histórico, horário de Brasília). Recalcula
  // pouco depois de cada mudança nos pedidos (Realtime), sem martelar o servidor.
  const ordersVersion = orders.map((o) => `${o.id}:${o.status}`).join(',');
  useEffect(() => {
    if (!ADMIN_DATA_AVAILABLE) return;
    let alive = true;
    const t = setTimeout(async () => {
      const today = localDate();
      const month = periodFor('MONTH');
      const prevMonth = previousPeriod(month);
      const [d, y, m, pm, w] = await Promise.all([
        fetchReport(today, today),
        fetchReport(shiftDate(today, -1), shiftDate(today, -1)),
        fetchReport(month.from, month.to),
        fetchReport(prevMonth.from, prevMonth.to),
        fetchReport(shiftDate(today, -6), today),
      ]);
      if (!alive) return;
      setData({ today: d.data, yesterday: y.data, month: m.data, prevMonth: pm.data, week: w.data });
      setLoading(false);
    }, 800);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ordersVersion]);

  // Fluxo operacional ao vivo: pedidos de hoje no cache (atualizado pelo Realtime)
  const today = localDate();
  const todayOrders = useMemo(() => orders.filter((o) => localDate(new Date(o.created_at)) === today), [orders, today]);
  const awaitingCount = orders.filter((o) => o.status === 'AGUARDANDO_CONFIRMACAO').length;
  const preparingCount = orders.filter((o) => o.status === 'EM_PREPARACAO' || o.status === 'CONFIRMADO').length;
  const deliveringCount = orders.filter((o) => ['PRONTO', 'AGUARDANDO_RETIRADA', 'EM_ENTREGA'].includes(o.status)).length;
  const completedToday = todayOrders.filter((o) => o.status === 'CONCLUIDO').length;
  const cancelledToday = todayOrders.filter((o) => o.status === 'CANCELADO').length;

  // Sem banco (modo demonstração): só o que dá para calcular de verdade com os pedidos locais
  const localTodayNet = todayOrders.filter((o) => o.status === 'CONCLUIDO').reduce((s, o) => s + o.total_cents, 0);
  const t = data.today?.summary;
  const m = data.month?.summary;

  const totalProducts = products.length;
  const unavailableProducts = products.filter((p) => !p.is_available).length;
  const activeCouriers = couriers.filter((c) => c.status === 'ATIVO');
  const availableCouriers = couriers.filter((c) => c.status === 'ATIVO' && c.is_available_for_orders);

  const chart = (data.week?.by_day ?? []).map((d) => ({
    label: d.date === today ? 'Hoje' : WEEKDAY[new Date(`${d.date}T12:00:00Z`).getUTCDay()],
    date: d.date,
    value: Number(d.net_cents),
    count: d.orders,
  }));
  const maxVal = Math.max(1, ...chart.map((c) => c.value));
  const weekTotal = chart.reduce((s, c) => s + c.value, 0);
  const recentOrders = orders.slice(0, 5);
  const kpi = (v?: number) => (v === undefined ? (loading ? '…' : '—') : formatCentsToBRL(v));

  return (
    <div className="space-y-8">
      {/* Atalhos */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white">
            PAINEL DE CONTROLE GERAL &bull; BURGER HUB
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">Vendas, produção da cozinha e entregas, com números do banco no horário de Brasília</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onOpenNewProductModal} className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition cursor-pointer shadow-md shadow-amber-500/20">
            <PlusCircle className="w-4 h-4" />
            <span>+ Novo Produto</span>
          </button>
          <button onClick={() => onNavigateTab('pedidos')} className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer">
            <ShoppingBag className="w-4 h-4 text-blue-400" />
            <span>Gerenciar Pedidos</span>
          </button>
          <button onClick={onOpenNewCourierModal} className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer">
            <Bike className="w-4 h-4 text-emerald-400" />
            <span>+ Novo Entregador</span>
          </button>
          <button onClick={() => onNavigateTab('financeiro')} className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer">
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Financeiro</span>
          </button>
        </div>
      </div>

      {!ADMIN_DATA_AVAILABLE && (
        <p className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
          Modo demonstração: faturamento mensal, comparações e gráfico precisam do banco de dados. Abaixo, só os pedidos deste aparelho.
        </p>
      )}

      {/* Linha 1: faturamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-[#141622] border border-amber-500/30 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Faturamento hoje</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-3xl font-black text-amber-400 font-['Bebas_Neue',sans-serif]">{ADMIN_DATA_AVAILABLE ? kpi(t?.net_cents) : formatCentsToBRL(localTodayNet)}</p>
          <Trend now={t?.net_cents} before={data.yesterday?.summary.net_cents} label="vs. ontem" />
        </div>
        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Faturamento do mês</span>
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-black text-emerald-400 font-['Bebas_Neue',sans-serif]">{kpi(m?.net_cents)}</p>
          <Trend now={m?.net_cents} before={data.prevMonth?.summary.net_cents} label="vs. mesmo período do mês passado" />
        </div>
        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Ticket médio (mês)</span>
            <ShoppingBag className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-3xl font-black text-purple-300 font-['Bebas_Neue',sans-serif]">{kpi(m?.avg_ticket_cents)}</p>
          <Trend now={m?.avg_ticket_cents} before={data.prevMonth?.summary.avg_ticket_cents} label="vs. mês passado" />
        </div>
        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Clientes recorrentes (mês)</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-3xl font-black text-sky-300 font-['Bebas_Neue',sans-serif]">
            {m ? `${m.returning_customers} / ${m.unique_customers}` : loading ? '…' : '—'}
          </p>
          <button onClick={() => onNavigateTab('clientes')} className="text-[10px] text-zinc-400 hover:text-amber-300 cursor-pointer">
            já tinham comprado antes · ver clientes →
          </button>
        </div>
      </div>

      {/* Linha 2: fluxo operacional */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          { label: 'Pedidos hoje', value: todayOrders.length, hint: 'Recebidos hoje', cls: 'border-zinc-800 text-white' },
          { label: 'Aguardando conf.', value: awaitingCount, hint: 'Ação necessária', cls: 'border-amber-500/40 text-amber-400' },
          { label: 'Na cozinha', value: preparingCount, hint: 'Confirmados e em preparo', cls: 'border-orange-500/40 text-orange-400' },
          { label: 'Prontos / em rota', value: deliveringCount, hint: 'Balcão ou entrega', cls: 'border-blue-500/40 text-blue-400' },
          { label: 'Entregues hoje', value: completedToday, hint: 'Concluídos', cls: 'border-emerald-500/40 text-emerald-400' },
          { label: 'Cancelados hoje', value: cancelledToday, hint: 'Com motivo registrado', cls: 'border-rose-500/40 text-rose-400' },
        ].map((k) => (
          <div key={k.label} className={`p-4 rounded-2xl bg-zinc-900/90 border ${k.cls.split(' ')[0]}`}>
            <span className={`text-[10px] font-bold uppercase block ${k.cls.split(' ')[1]}`}>{k.label}</span>
            <p className={`text-2xl font-black font-['Bebas_Neue',sans-serif] ${k.cls.split(' ')[1]}`}>{k.value}</p>
            <span className="text-[10px] text-zinc-400">{k.hint}</span>
          </div>
        ))}
      </div>

      {/* Linha 3: cardápio e frota */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Status do Cardápio</h3>
              <p className="text-xs text-zinc-400">
                <strong className="text-white">{totalProducts}</strong> produtos cadastrados &bull;{' '}
                <strong className={unavailableProducts > 0 ? 'text-rose-400' : 'text-emerald-400'}>{unavailableProducts}</strong> pausados/indisponíveis
              </p>
            </div>
          </div>
          <button onClick={() => onNavigateTab('produtos')} className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-bold transition cursor-pointer">
            <span>Gerenciar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Frota de Entregadores</h3>
              <p className="text-xs text-zinc-400">
                <strong className="text-white">{activeCouriers.length}</strong> ativos &bull;{' '}
                <strong className="text-emerald-400">{availableCouriers.length}</strong> prontos para corridas agora
              </p>
            </div>
          </div>
          <button onClick={() => onNavigateTab('entregadores')} className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-bold transition cursor-pointer">
            <span>Ver Frota</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Linha 4: gráfico de 7 dias + mais vendidos */}
      {ADMIN_DATA_AVAILABLE && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  <span>Vendas dos últimos 7 dias</span>
                </h3>
                <p className="text-xs text-zinc-400">Faturamento líquido de pedidos concluídos, por dia</p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-mono font-bold text-amber-400">
                Média diária: {formatCentsToBRL(Math.round(weekTotal / 7))}
              </span>
            </div>
            {chart.length === 0 ? (
              <p className="h-44 flex items-center justify-center text-xs text-zinc-500 gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</> : 'Sem dados de vendas.'}
              </p>
            ) : (
              <div className="pt-6 pb-2" role="img" aria-label={`Vendas por dia: ${chart.map((c) => `${c.label} ${formatCentsToBRL(c.value)}`).join(', ')}`}>
                <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-44">
                  {chart.map((col) => {
                    const isToday = col.date === today;
                    return (
                      <div key={col.date} className="flex flex-col items-center justify-end h-full group">
                        <div className="opacity-0 group-hover:opacity-100 transition mb-1 px-2 py-1 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-amber-300 whitespace-nowrap shadow-xl">
                          {formatCentsToBRL(col.value)} ({col.count} ped.)
                        </div>
                        <div
                          style={{ height: `${col.value ? Math.max(4, Math.round((col.value / maxVal) * 100)) : 2}%` }}
                          className={`w-full rounded-xl transition-all ${isToday ? 'bg-gradient-to-t from-amber-600 to-amber-400' : 'bg-gradient-to-t from-zinc-800 to-zinc-600'}`}
                        />
                        <span className={`mt-2 text-[11px] font-bold uppercase ${isToday ? 'text-amber-400' : 'text-zinc-400'}`}>{col.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /> Mais vendidos (7 dias)</h3>
            {(data.week?.by_product ?? []).slice(0, 6).map((p, i) => (
              <div key={p.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-zinc-800 text-amber-300 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-zinc-200 truncate">{p.name}</span>
                </span>
                <span className="text-white font-bold whitespace-nowrap">{p.quantity} un.</span>
              </div>
            ))}
            {!loading && !data.week?.by_product?.length && <p className="text-xs text-zinc-500">Nenhuma venda concluída na semana.</p>}
          </div>
        </div>
      )}

      {/* Linha 5: pedidos recentes */}
      <div className="rounded-3xl bg-[#141620] border border-zinc-800 overflow-hidden shadow-xl space-y-2">
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>Pedidos Recentes</span>
            </h3>
            <p className="text-xs text-zinc-400">Últimos pedidos recebidos no sistema</p>
          </div>
          <button onClick={() => onNavigateTab('pedidos')} className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer">
            Ver Todos os Pedidos &rarr;
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="p-4">Pedido / Data</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Itens</th>
                <th className="p-4">Total</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-400">Nenhum pedido registrado no momento.</td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-zinc-900/40 transition">
                    <td className="p-4">
                      <span className="font-extrabold text-amber-400 text-sm block">{order.order_number}</span>
                      <span className="text-[10px] text-zinc-400">{formatDateTimeBR(order.created_at)}</span>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-white">{order.customer_name}</p>
                      <p className="text-[11px] text-zinc-400">{order.customer_phone}</p>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-zinc-300">{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</span>
                      <p className="text-[10px] text-zinc-400 truncate max-w-xs">{order.items.map((i) => `${i.quantity}x ${i.product_name_snapshot}`).join(', ')}</p>
                    </td>
                    <td className="p-4">
                      <span className="font-black text-white text-sm block">{formatCentsToBRL(order.total_cents)}</span>
                      <span className="text-[10px] text-zinc-400">{order.fulfillment_type === 'DELIVERY' ? '🛵 Entrega' : '🏪 Balcão'}</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase ${STATUS_STYLE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => onNavigateTab('pedidos')} className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-[11px] transition inline-flex items-center space-x-1 cursor-pointer">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Abrir</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

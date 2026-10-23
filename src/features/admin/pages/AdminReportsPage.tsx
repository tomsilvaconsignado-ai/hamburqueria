import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Bike,
  Calendar,
  Download,
  Printer,
  Flame,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { Order, Product, Courier, Category } from '../../../types';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { exportOrdersToCSV, downloadCSV } from '../../../services/storage';

interface AdminReportsPageProps {
  orders: Order[];
  products: Product[];
  couriers: Courier[];
  categories: Category[];
}

export const AdminReportsPage: React.FC<AdminReportsPageProps> = ({
  orders,
  products,
  couriers,
  categories,
}) => {
  const [period, setPeriod] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');

  // Filter orders by period
  const now = new Date();
  const filteredOrders = orders.filter((o) => {
    const orderDate = new Date(o.created_at);
    if (period === 'TODAY') {
      return (
        orderDate.getDate() === now.getDate() &&
        orderDate.getMonth() === now.getMonth() &&
        orderDate.getFullYear() === now.getFullYear()
      );
    } else if (period === 'WEEK') {
      const diffTime = Math.abs(now.getTime() - orderDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    } else if (period === 'MONTH') {
      return (
        orderDate.getMonth() === now.getMonth() &&
        orderDate.getFullYear() === now.getFullYear()
      );
    }
    return true;
  });

  // Financial Metrics
  const completedOrders = filteredOrders.filter((o) => o.status === 'CONCLUIDO');
  const cancelledOrders = filteredOrders.filter((o) => o.status === 'CANCELADO');

  const totalRevenueCents = filteredOrders
    .filter(
      (o) =>
        o.payment_status === 'PAGO' ||
        o.payment_status === 'PAGO_NA_ENTREGA' ||
        o.status === 'CONCLUIDO'
    )
    .reduce((acc, o) => acc + o.total_cents, 0);

  const totalDeliveryFeesCents = filteredOrders
    .filter((o) => o.status !== 'CANCELADO')
    .reduce((acc, o) => acc + o.delivery_fee_cents, 0);

  const averageTicketCents =
    completedOrders.length > 0
      ? Math.round(
          completedOrders.reduce((acc, o) => acc + o.total_cents, 0) / completedOrders.length
        )
      : totalRevenueCents > 0
      ? Math.round(totalRevenueCents / Math.max(1, filteredOrders.length))
      : 0;

  const cancellationRate =
    filteredOrders.length > 0
      ? ((cancelledOrders.length / filteredOrders.length) * 100).toFixed(1)
      : '0.0';

  // Ranking de Produtos Mais Vendidos
  const productStatsMap: Record<
    string,
    { name: string; quantity: number; revenueCents: number; categoryId: string }
  > = {};

  filteredOrders.forEach((order) => {
    if (order.status === 'CANCELADO') return;
    order.items.forEach((item) => {
      const pId = item.product_id || item.product_name_snapshot;
      if (!productStatsMap[pId]) {
        const prodMatch = products.find((p) => p.id === item.product_id);
        productStatsMap[pId] = {
          name: item.product_name_snapshot,
          quantity: 0,
          revenueCents: 0,
          categoryId: prodMatch?.category_id || 'geral',
        };
      }
      productStatsMap[pId].quantity += item.quantity;
      productStatsMap[pId].revenueCents += item.line_total_cents;
    });
  });

  let rankedProducts = Object.values(productStatsMap);
  if (selectedCategoryFilter !== 'ALL') {
    rankedProducts = rankedProducts.filter((p) => p.categoryId === selectedCategoryFilter);
  }
  const topByQuantity = [...rankedProducts].sort((a, b) => b.quantity - a.quantity);
  const topByRevenue = [...rankedProducts].sort((a, b) => b.revenueCents - a.revenueCents);

  // Desempenho dos Entregadores
  const courierStats = couriers.map((courier) => {
    const courierOrders = filteredOrders.filter(
      (o) => o.assigned_courier_id === courier.id || o.assigned_courier_id === courier.user_id
    );
    const deliveredCount = courierOrders.filter((o) => o.status === 'CONCLUIDO').length;
    const courierFeesEarned = deliveredCount * 900; // Repasse de R$ 9,00 por entrega

    return {
      ...courier,
      periodOrdersCount: courierOrders.length,
      periodDeliveredCount: deliveredCount,
      periodFeesEarnedCents: courierFeesEarned,
    };
  });

  const handleExportCSV = () => {
    const csv = exportOrdersToCSV(filteredOrders);
    downloadCSV(`relatorio-vendas-burgerhub-${period.toLowerCase()}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-amber-500" />
            <span>RELATÓRIOS EXECUTIVOS & AUTONOMIA DE VENDAS</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Filtre métricas financeiras, produtos mais vendidos, taxas de entrega e desempenho da equipe
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
            <button
              onClick={() => setPeriod('TODAY')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                period === 'TODAY' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('WEEK')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                period === 'WEEK' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setPeriod('MONTH')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                period === 'MONTH' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Este Mês
            </button>
            <button
              onClick={() => setPeriod('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                period === 'ALL' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Tudo
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs border border-zinc-800 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-[#141622] border border-amber-500/30 shadow-lg space-y-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
            Faturamento do Período
          </span>
          <p className="text-3xl font-black text-amber-400 font-['Bebas_Neue',sans-serif]">
            {formatCentsToBRL(totalRevenueCents)}
          </p>
          <span className="text-[10px] text-zinc-400 block">
            {completedOrders.length} pedidos finalizados com sucesso
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 shadow-lg space-y-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
            Ticket Médio
          </span>
          <p className="text-3xl font-black text-white font-['Bebas_Neue',sans-serif]">
            {formatCentsToBRL(averageTicketCents)}
          </p>
          <span className="text-[10px] text-zinc-400 block">Média por pedido concluído</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 shadow-lg space-y-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
            Taxas de Entrega Arrecadadas
          </span>
          <p className="text-3xl font-black text-blue-400 font-['Bebas_Neue',sans-serif]">
            {formatCentsToBRL(totalDeliveryFeesCents)}
          </p>
          <span className="text-[10px] text-zinc-400 block">Repasse para logística</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 shadow-lg space-y-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
            Taxa de Cancelamento
          </span>
          <p className="text-3xl font-black text-rose-400 font-['Bebas_Neue',sans-serif]">
            {cancellationRate}%
          </p>
          <span className="text-[10px] text-zinc-400 block">
            {cancelledOrders.length} pedido(s) cancelado(s)
          </span>
        </div>
      </div>

      {/* Row: Top Products Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top by Quantity */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>Produtos Mais Vendidos (em Unidades)</span>
            </h3>
            <span className="text-xs font-mono text-zinc-400">{topByQuantity.length} produtos</span>
          </div>

          <div className="space-y-3">
            {topByQuantity.length === 0 ? (
              <p className="text-xs text-zinc-400 py-6 text-center">Nenhum dado no período.</p>
            ) : (
              topByQuantity.slice(0, 5).map((prod, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-black text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-bold text-white">{prod.name}</p>
                      <p className="text-[10px] text-zinc-400">
                        Receita: {formatCentsToBRL(prod.revenueCents)}
                      </p>
                    </div>
                  </div>
                  <span className="font-black text-amber-400 text-sm">{prod.quantity} un.</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top by Revenue */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Produtos com Maior Faturamento (R$)</span>
            </h3>
            <span className="text-xs font-mono text-zinc-400">{topByRevenue.length} produtos</span>
          </div>

          <div className="space-y-3">
            {topByRevenue.length === 0 ? (
              <p className="text-xs text-zinc-400 py-6 text-center">Nenhum dado no período.</p>
            ) : (
              topByRevenue.slice(0, 5).map((prod, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-bold text-white">{prod.name}</p>
                      <p className="text-[10px] text-zinc-400">{prod.quantity} unidades vendidas</p>
                    </div>
                  </div>
                  <span className="font-black text-emerald-400 text-sm">
                    {formatCentsToBRL(prod.revenueCents)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row: Courier Performance Table */}
      <div className="rounded-3xl bg-[#141620] border border-zinc-800 overflow-hidden shadow-xl space-y-2">
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Bike className="w-5 h-5 text-amber-400" />
              <span>Desempenho & Repasses dos Entregadores</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Corridas realizadas no período e estimativa de taxas repassadas
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="p-4">Entregador</th>
                <th className="p-4">Veículo</th>
                <th className="p-4">Situação</th>
                <th className="p-4">Entregas no Período</th>
                <th className="p-4">Repasse Estimado</th>
                <th className="p-4">Avaliação Média</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {courierStats.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-900/40 transition">
                  <td className="p-4 font-bold text-white">
                    {c.full_name}
                    <span className="block text-[10px] text-zinc-400 font-normal">{c.phone}</span>
                  </td>
                  <td className="p-4 text-zinc-300">
                    {c.vehicle_type} {c.vehicle_model ? `(${c.vehicle_model})` : ''}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        c.status === 'ATIVO'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-white">
                    {c.periodDeliveredCount} entregas
                  </td>
                  <td className="p-4 font-black text-amber-400">
                    {formatCentsToBRL(c.periodFeesEarnedCents)}
                  </td>
                  <td className="p-4 text-amber-300 font-bold">
                    ★ {c.average_rating || 5.0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

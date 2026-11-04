import React, { useState } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Bike,
  Clock,
  MapPin,
  Phone,
  DollarSign,
  AlertTriangle,
  Download,
  Eye,
  X,
  Printer,
  ChevronRight,
  LayoutGrid,
  List,
  MessageCircle,
} from 'lucide-react';
import { Order, OrderStatus, Courier, StoreSettings } from '../../../types';
import { STATUS_LABEL, STATUS_STYLE, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '../../../lib/labels';
import { buildOrderMessage, suggestedMessageFor, waLink } from '../../../lib/whatsapp';
import { printOrdersReport } from '../../../lib/documents/templates';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { OrderBoard } from '../components/OrderBoard';
import { PeriodPicker, Period, periodFor, formatPeriod } from '../components/PeriodPicker';
import { localDate } from '../../../services/admin.service';
import {
  updateOrderStatus,
  assignCourierToOrder,
  cancelOrder,
  exportOrdersToCSV,
  downloadCSV,
} from '../../../services/storage';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { formatDateTimeBR } from '../../../lib/formatters/date';
import { reportResult } from '../../../lib/reportResult';
import { isOnlinePayment } from '../../../services/orderStateMachine';
import { ConfirmPaymentModal } from '../../delivery/ConfirmPaymentModal';

interface AdminOrdersManagerProps {
  orders: Order[];
  couriers: Courier[];
  settings: StoreSettings;
  onReloadData: () => void;
}

const VIEW_KEY = 'bh_admin_orders_view_v1';

export const AdminOrdersManager: React.FC<AdminOrdersManagerProps> = ({
  orders,
  couriers,
  settings,
  onReloadData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DELIVERY' | 'PICKUP'>('ALL');
  const [period, setPeriod] = useState<Period>(() => periodFor('7D'));
  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
    } catch {
      return 'board';
    }
  });
  const chooseView = (v: 'board' | 'list') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // só nesta sessão
    }
  };

  // Detalhes: guarda só o id para sempre mostrar a versão mais nova (Realtime)
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const selectedOrderDetails = orders.find((o) => o.id === detailsId) ?? null;
  const setSelectedOrderDetails = (o: Order | null) => setDetailsId(o?.id ?? null);

  // Modal Courier Assignment
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');

  // Modal Cancel Order (mandatory reason)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Filtros: busca (número, cliente, telefone com ou sem máscara, bairro), status, tipo e período
  const query = searchQuery.trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, '');
  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || o.fulfillment_type === typeFilter;
    const day = localDate(new Date(o.created_at));
    const matchesPeriod = day >= period.from && day <= period.to;
    const matchesSearch =
      !query ||
      o.order_number.toLowerCase().includes(query) ||
      o.customer_name.toLowerCase().includes(query) ||
      (queryDigits.length >= 3 && o.customer_phone.replace(/\D/g, '').includes(queryDigits)) ||
      (o.delivery_address_snapshot && o.delivery_address_snapshot.neighborhood.toLowerCase().includes(query));

    return matchesStatus && matchesType && matchesPeriod && matchesSearch;
  });
  // O quadro mostra todo pedido em andamento (mesmo de dias anteriores), sem o filtro de período
  const boardOrders = orders.filter(
    (o) =>
      (typeFilter === 'ALL' || o.fulfillment_type === typeFilter) &&
      (!query || o.order_number.toLowerCase().includes(query) || o.customer_name.toLowerCase().includes(query))
  );

  // Pago na entrega/balcão: concluir pede a confirmação do recebimento (mesma janela do entregador)
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const payingOrder = orders.find((o) => o.id === payingOrderId) ?? null;
  const [concluding, setConcluding] = useState(false);

  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    const order = orders.find((o) => o.id === orderId);
    if (nextStatus === 'CONCLUIDO' && order?.payment_status === 'PAGAMENTO_NA_ENTREGA') {
      setPayingOrderId(orderId);
      return;
    }
    const res = await updateOrderStatus(orderId, nextStatus, 'ADMIN', 'Administrador', 'Atualização no painel administrativo');
    reportResult(res);
    onReloadData();
  };

  const confirmPaymentAndConclude = async () => {
    if (!payingOrder) return;
    setConcluding(true);
    const res = await updateOrderStatus(payingOrder.id, 'CONCLUIDO', 'ADMIN', 'Administrador', 'Concluído no painel: pagamento recebido');
    setConcluding(false);
    reportResult(res);
    if (res.success) setPayingOrderId(null);
    onReloadData();
  };

  /** Entregador só pode ser (re)atribuído antes de sair e com o pagamento online aprovado. */
  const canAssignCourier = (o: Order) =>
    o.fulfillment_type === 'DELIVERY' &&
    !['EM_ENTREGA', 'CONCLUIDO', 'CANCELADO'].includes(o.status) &&
    !(isOnlinePayment(o) && o.payment_status !== 'PAGO');

  const openAssign = (o: Order) => {
    setAssigningOrderId(o.id);
    setSelectedCourierId(o.assigned_courier_id ?? '');
  };

  const handleConfirmAssignCourier = async () => {
    if (!assigningOrderId || !selectedCourierId) return;
    const res = await assignCourierToOrder(assigningOrderId, selectedCourierId, 'Administrador');
    if (!res.success) {
      alert(res.error);
    } else {
      setAssigningOrderId(null);
      setSelectedCourierId('');
      onReloadData();
    }
  };

  const handleConfirmCancelOrder = async () => {
    if (!cancellingOrderId) return;
    setCancelError(null);

    const res = await cancelOrder(cancellingOrderId, cancellationReason, 'Administrador');
    if (!res.success) {
      setCancelError(res.error || 'Erro ao cancelar pedido.');
    } else {
      setCancellingOrderId(null);
      setCancellationReason('');
      onReloadData();
    }
  };

  // Somente entregadores ATIVOS podem ser atribuídos
  const activeCouriers = couriers.filter((c) => c.status === 'ATIVO');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center space-x-2">
            <ShoppingBag className="w-6 h-6 text-amber-500" />
            <span>PAINEL DE GESTÃO E FLUXO DE PEDIDOS</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Acompanhe pedidos em tempo real, gerencie produção, despache entregas e registre cancelamentos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-zinc-950 border border-zinc-800 rounded-xl p-1" role="group" aria-label="Visualização">
            <button
              type="button"
              aria-pressed={view === 'board'}
              onClick={() => chooseView('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${view === 'board' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              <LayoutGrid className="w-4 h-4" /> Painel operacional
            </button>
            <button
              type="button"
              aria-pressed={view === 'list'}
              onClick={() => chooseView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${view === 'list' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              <List className="w-4 h-4" /> Histórico
            </button>
          </div>
          {view === 'list' && (
            <>
              <button
                onClick={() => printOrdersReport(filteredOrders, settings, `${formatPeriod(period)} · ${statusFilter === 'ALL' ? 'todos os status' : STATUS_LABEL[statusFilter as OrderStatus]}`)}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer shadow-md"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Imprimir / PDF</span>
              </button>
              <button
                onClick={() => {
                  const csv = exportOrdersToCSV(filteredOrders);
                  downloadCSV(`pedidos-burgerhub-${period.from}-a-${period.to}.csv`, csv);
                }}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer shadow-md"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Exportar CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#141620] border border-zinc-800">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por #pedido, cliente, telefone ou bairro..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === 'list' && <PeriodPicker value={period} onChange={setPeriod} presets={['TODAY', '7D', '30D', 'MONTH']} />}
          {view === 'list' && (
          <div className="flex items-center space-x-1">
            <Filter className="w-4 h-4 text-zinc-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Status"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Todos os status</option>
              {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          )}

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Delivery & Retirada</option>
            <option value="DELIVERY">🛵 Somente Delivery</option>
            <option value="PICKUP">🏪 Somente Retirada</option>
          </select>
        </div>
      </div>

      {view === 'board' ? (
        <OrderBoard
          orders={boardOrders}
          onOpen={setSelectedOrderDetails}
          onAdvance={(o, next) => handleUpdateStatus(o.id, next)}
          onAssign={openAssign}
        />
      ) : (
      <>
      <p className="text-[11px] text-zinc-500 -mt-3">
        {filteredOrders.length} pedido(s) em {formatPeriod(period)}. A lista mostra os 300 pedidos mais recentes; para meses
        anteriores use Financeiro e Clientes, que consultam o histórico completo.
      </p>
      <div className="rounded-3xl bg-[#141620] border border-zinc-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="p-4">Pedido / Horário</th>
                <th className="p-4">Cliente & Contato</th>
                <th className="p-4">Itens & Adicionais</th>
                <th className="p-4">Total & Pagamento</th>
                <th className="p-4">Status Atual</th>
                <th className="p-4">Entregador</th>
                <th className="p-4 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-zinc-400">
                    Nenhum pedido encontrado com estes filtros.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-zinc-900/40 transition">
                    {/* Order ID & Time */}
                    <td className="p-4">
                      <span className="font-black text-amber-400 text-sm block">
                        {order.order_number}
                      </span>
                      <span className="text-[10px] text-zinc-400 block">
                        {formatDateTimeBR(order.created_at)}
                      </span>
                      <span
                        className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          order.fulfillment_type === 'DELIVERY'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-blue-500/15 text-blue-300'
                        }`}
                      >
                        {order.fulfillment_type === 'DELIVERY' ? '🛵 Delivery' : '🏪 Balcão'}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="p-4">
                      <p className="font-bold text-white">{order.customer_name}</p>
                      <a
                        href={`tel:${order.customer_phone.replace(/\D/g, '')}`}
                        className="text-[11px] text-zinc-400 hover:text-amber-400 block"
                      >
                        {order.customer_phone}
                      </a>
                      {order.delivery_address_snapshot && (
                        <p className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[180px]">
                          {order.delivery_address_snapshot.neighborhood} - {order.delivery_address_snapshot.street}
                        </p>
                      )}
                    </td>

                    {/* Items */}
                    <td className="p-4">
                      <div className="space-y-0.5 max-w-xs">
                        {order.items.slice(0, 2).map((it, idx) => (
                          <p key={idx} className="text-zinc-200 truncate">
                            <strong className="text-amber-400">{it.quantity}x</strong>{' '}
                            {it.product_name_snapshot}
                          </p>
                        ))}
                        {order.items.length > 2 && (
                          <span className="text-[10px] text-zinc-400">
                            +{order.items.length - 2} outros itens...
                          </span>
                        )}
                        {order.customer_notes && (
                          <span className="block text-[10px] text-amber-300/80 italic truncate">
                            Obs: {order.customer_notes}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Total & Payment */}
                    <td className="p-4">
                      <span className="font-black text-white text-sm block">
                        {formatCentsToBRL(order.total_cents)}
                      </span>
                      <span className="text-[10px] text-zinc-400 block">
                        {PAYMENT_METHOD_LABEL[order.payment_method]}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase ${
                          order.payment_status === 'PAGO' || order.payment_status === 'PAGO_NA_ENTREGA'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {PAYMENT_STATUS_LABEL[order.payment_status]}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider inline-block ${STATUS_STYLE[order.status]}`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                      {order.cancellation_reason && (
                        <span className="block text-[10px] text-rose-300/90 italic mt-0.5 max-w-[150px] truncate">
                          Motivo: {order.cancellation_reason}
                        </span>
                      )}
                    </td>

                    {/* Assigned Courier */}
                    <td className="p-4">
                      {order.fulfillment_type === 'DELIVERY' ? (
                        order.assigned_courier_name ? (
                          <div>
                            <span className="text-xs font-semibold text-zinc-200 block">
                              {order.assigned_courier_name}
                            </span>
                            {canAssignCourier(order) && (
                              <button
                                onClick={() => openAssign(order)}
                                className="text-[10px] text-amber-400 hover:underline"
                              >
                                Trocar
                              </button>
                            )}
                          </div>
                        ) : canAssignCourier(order) ? (
                          <button
                            onClick={() => openAssign(order)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition cursor-pointer"
                          >
                            + Atribuir
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-500">
                            {order.status === 'CANCELADO' || order.status === 'CONCLUIDO' ? '—' : 'Após o pagamento'}
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] text-zinc-400">Retirada Balcão</span>
                      )}
                    </td>

                    {/* Quick Actions */}
                    <td className="p-4 text-right space-x-1">
                      <button
                        onClick={() => setSelectedOrderDetails(order)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold transition inline-flex items-center space-x-1"
                        title="Ver Detalhes do Pedido"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver</span>
                      </button>
                      {waLink(order.customer_phone) && (
                        <a
                          href={waLink(order.customer_phone, buildOrderMessage(order, suggestedMessageFor(order.status, order.fulfillment_type), settings.store_name)) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[10px] font-bold transition inline-flex items-center"
                          title="Abrir WhatsApp com a mensagem da etapa atual (você confere e envia)"
                          aria-label={`WhatsApp de ${order.customer_name}`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {order.status !== 'CONCLUIDO' && order.status !== 'CANCELADO' && (
                        <div className="inline-flex space-x-1">
                          {order.status === 'AGUARDANDO_CONFIRMACAO' &&
                            (isOnlinePayment(order) && order.payment_status !== 'PAGO' ? (
                              <span
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 font-bold text-[10px]"
                                title="Pedido só pode ser confirmado após aprovação do pagamento online"
                              >
                                Aguardando pgto
                              </span>
                            ) : (
                              <button
                                onClick={() => handleUpdateStatus(order.id, 'CONFIRMADO')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition"
                              >
                                Confirmar
                              </button>
                            ))}
                          {order.status === 'CONFIRMADO' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'EM_PREPARACAO')}
                              className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-[10px] transition"
                            >
                              Chapa
                            </button>
                          )}
                          {order.status === 'EM_PREPARACAO' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'PRONTO')}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition"
                            >
                              Pronto
                            </button>
                          )}
                          {order.status === 'PRONTO' && order.fulfillment_type === 'PICKUP' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'AGUARDANDO_RETIRADA')}
                              className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] transition"
                            >
                              No Balcão
                            </button>
                          )}
                          {order.status === 'PRONTO' && order.fulfillment_type === 'DELIVERY' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'EM_ENTREGA')}
                              disabled={!order.assigned_courier_id}
                              title={
                                order.assigned_courier_id
                                  ? 'O entregador confirma a retirada no app dele. Use aqui só se ele não conseguir.'
                                  : 'Atribua um entregador antes de despachar'
                              }
                              className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[10px] transition"
                            >
                              Saiu p/ entrega
                            </button>
                          )}
                          {(order.status === 'EM_ENTREGA' || order.status === 'AGUARDANDO_RETIRADA') && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'CONCLUIDO')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition"
                            >
                              Concluir
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setCancellingOrderId(order.id);
                              setCancellationReason('');
                              setCancelError(null);
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-bold text-[10px] transition"
                            title="Cancelar Pedido"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {selectedOrderDetails && (
        <OrderDetailsModal order={selectedOrderDetails} settings={settings} onClose={() => setSelectedOrderDetails(null)} />
      )}

      {/* Modal: Courier Assignment */}
      {assigningOrderId && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Bike className="w-5 h-5 text-amber-400" />
              <span>Atribuir Entregador Oficial</span>
            </h3>
            <p className="text-xs text-zinc-300">
              Escolha quem vai levar o pedido. Ele recebe o aviso no celular e, quando a cozinha marcar como pronto, é
              chamado para retirar.
            </p>

            {activeCouriers.length === 0 && (
              <p className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
                Nenhum entregador ativo. Cadastre em Entregadores & Frotas.
              </p>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto" role="radiogroup" aria-label="Entregadores ativos">
              {activeCouriers.map((c) => {
                const busy = orders.filter(
                  (o) => o.assigned_courier_id === c.id && o.id !== assigningOrderId && !['CONCLUIDO', 'CANCELADO'].includes(o.status)
                ).length;
                const selected = selectedCourierId === c.id;
                const current = orders.find((o) => o.id === assigningOrderId)?.assigned_courier_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedCourierId(c.id)}
                    className={`w-full text-left p-3 rounded-2xl border transition cursor-pointer ${
                      selected ? 'bg-amber-500/15 border-amber-500/60' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">
                        {c.full_name} {current && <span className="text-[10px] text-amber-400 font-black uppercase">· atual</span>}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          c.is_available_for_orders ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {c.is_available_for_orders ? 'Livre' : 'Em pausa'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {c.vehicle_type}
                      {c.vehicle_model ? ` ${c.vehicle_model}` : ''} · {c.phone} ·{' '}
                      {busy === 0 ? 'sem entregas em andamento' : `${busy} entrega(s) em andamento`}
                    </p>
                    {!c.user_id && (
                      <p className="text-[11px] text-rose-300 mt-1">
                        ⚠️ Sem acesso ao app: não vai ver nem ser avisado desta entrega. Vincule a conta em Entregadores.
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setAssigningOrderId(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs text-zinc-300 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAssignCourier}
                disabled={!selectedCourierId}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase disabled:opacity-50"
              >
                Confirmar Atribuição
              </button>
            </div>
          </div>
        </div>
      )}

      {payingOrder && (
        <ConfirmPaymentModal
          order={payingOrder}
          busy={concluding}
          onConfirm={confirmPaymentAndConclude}
          onCancel={() => setPayingOrderId(null)}
        />
      )}

      {/* Modal: Mandatory Cancellation Reason */}
      {cancellingOrderId && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-rose-500/40 p-6 rounded-3xl max-w-md w-full space-y-4">
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold">Cancelar Pedido</h3>
            </div>
            <p className="text-xs text-zinc-300">
              Informe o motivo detalhado do cancelamento deste pedido. Este registro ficará salvo na auditoria e visível ao cliente.
            </p>

            {cancelError && (
              <p className="text-xs text-rose-400 font-semibold">{cancelError}</p>
            )}

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Motivo do Cancelamento *</label>
              <textarea
                required
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Ex: Endereço fora do raio de entrega, cliente solicitou desistência, indisponibilidade de insumo..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setCancellingOrderId(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs text-zinc-300 font-bold"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmCancelOrder}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

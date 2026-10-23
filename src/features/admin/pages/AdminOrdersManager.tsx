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
} from 'lucide-react';
import { Order, OrderStatus, Courier } from '../../../types';
import {
  updateOrderStatus,
  assignCourierToOrder,
  cancelOrder,
  exportOrdersToCSV,
  downloadCSV,
} from '../../../services/storage';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { formatDateTimeBR } from '../../../lib/formatters/date';

interface AdminOrdersManagerProps {
  orders: Order[];
  couriers: Courier[];
  onReloadData: () => void;
}

export const AdminOrdersManager: React.FC<AdminOrdersManagerProps> = ({
  orders,
  couriers,
  onReloadData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DELIVERY' | 'PICKUP'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK'>('ALL');

  // Modal Detailed Order View
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);

  // Modal Courier Assignment
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');

  // Modal Cancel Order (mandatory reason)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || o.fulfillment_type === typeFilter;
    const matchesSearch =
      !searchQuery ||
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_phone.includes(searchQuery) ||
      (o.delivery_address_snapshot &&
        o.delivery_address_snapshot.neighborhood.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStatus && matchesType && matchesSearch;
  });

  const handleUpdateStatus = (orderId: string, nextStatus: OrderStatus) => {
    updateOrderStatus(orderId, nextStatus, 'ADMIN', 'Administrador Executivo', 'Atualização no painel administrativo');
    onReloadData();
  };

  const handleConfirmAssignCourier = () => {
    if (!assigningOrderId || !selectedCourierId) return;
    const res = assignCourierToOrder(assigningOrderId, selectedCourierId, 'Administrador');
    if (!res.success) {
      alert(res.error);
    } else {
      setAssigningOrderId(null);
      setSelectedCourierId('');
      onReloadData();
    }
  };

  const handleConfirmCancelOrder = () => {
    if (!cancellingOrderId) return;
    setCancelError(null);

    const res = cancelOrder(cancellingOrderId, cancellationReason, 'Administrador');
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

        <button
          onClick={() => {
            const csv = exportOrdersToCSV(orders);
            downloadCSV(`pedidos-burgerhub-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          }}
          className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer shadow-md"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Exportar Pedidos (CSV)</span>
        </button>
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
          <div className="flex items-center space-x-1">
            <Filter className="w-4 h-4 text-zinc-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Todos os Status</option>
              <option value="AGUARDANDO_CONFIRMACAO">Aguardando Confirmação</option>
              <option value="CONFIRMADO">Confirmado</option>
              <option value="EM_PREPARACAO">Em Preparação</option>
              <option value="PRONTO">Pronto para Despacho</option>
              <option value="EM_ENTREGA">Em Entrega</option>
              <option value="CONCLUIDO">Concluído</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>

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

      {/* Orders Table */}
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
                        {order.payment_method.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase ${
                          order.payment_status === 'PAGO' || order.payment_status === 'PAGO_NA_ENTREGA'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {order.payment_status}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-block ${
                          order.status === 'CONCLUIDO'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : order.status === 'CANCELADO'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : order.status === 'EM_PREPARACAO'
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {order.status.replace(/_/g, ' ')}
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
                            <button
                              onClick={() => setAssigningOrderId(order.id)}
                              className="text-[10px] text-amber-400 hover:underline"
                            >
                              Trocar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAssigningOrderId(order.id)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition cursor-pointer"
                          >
                            + Atribuir
                          </button>
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

                      {order.status !== 'CONCLUIDO' && order.status !== 'CANCELADO' && (
                        <div className="inline-flex space-x-1">
                          {order.status === 'AGUARDANDO_CONFIRMACAO' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'CONFIRMADO')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition"
                            >
                              Confirmar
                            </button>
                          )}
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
                          {order.status === 'PRONTO' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'EM_ENTREGA')}
                              className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] transition"
                            >
                              Despachar
                            </button>
                          )}
                          {order.status === 'EM_ENTREGA' && (
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

      {/* Modal: Detailed Order View */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <span className="text-xl font-black font-['Bebas_Neue',sans-serif] text-amber-400">
                  {selectedOrderDetails.order_number}
                </span>
                <p className="text-xs text-zinc-400">
                  Realizado em {formatDateTimeBR(selectedOrderDetails.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Details */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
              <h4 className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">
                Dados do Cliente
              </h4>
              <p className="text-white font-bold">{selectedOrderDetails.customer_name}</p>
              <p className="text-zinc-300">Telefone: {selectedOrderDetails.customer_phone}</p>
              {selectedOrderDetails.delivery_address_snapshot ? (
                <div className="text-zinc-400 space-y-0.5">
                  <p>
                    Endereço: {selectedOrderDetails.delivery_address_snapshot.street},{' '}
                    {selectedOrderDetails.delivery_address_snapshot.number}{' '}
                    {selectedOrderDetails.delivery_address_snapshot.complement}
                  </p>
                  <p>
                    Bairro: {selectedOrderDetails.delivery_address_snapshot.neighborhood} -{' '}
                    {selectedOrderDetails.delivery_address_snapshot.city}
                  </p>
                  {selectedOrderDetails.delivery_address_snapshot.reference && (
                    <p className="text-amber-300 italic">
                      Ref: {selectedOrderDetails.delivery_address_snapshot.reference}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-zinc-400">Tipo: Retirada rápida no Balcão da Loja</p>
              )}
            </div>

            {/* Items */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">
                Itens do Pedido ({selectedOrderDetails.items.length})
              </h4>
              <div className="divide-y divide-zinc-800/80 max-h-48 overflow-y-auto pr-1">
                {selectedOrderDetails.items.map((it, idx) => (
                  <div key={idx} className="py-2 flex justify-between">
                    <div>
                      <p className="font-bold text-white">
                        <span className="text-amber-400">{it.quantity}x</span> {it.product_name_snapshot}
                      </p>
                      {it.options && it.options.length > 0 && (
                        <div className="pl-4 text-[10px] text-zinc-400">
                          {it.options.map((opt, i) => (
                            <p key={i}>• {opt.option_name_snapshot}</p>
                          ))}
                        </div>
                      )}
                      {it.notes && (
                        <p className="pl-4 text-[10px] text-amber-300 italic">Obs: {it.notes}</p>
                      )}
                    </div>
                    <span className="font-bold text-zinc-300">
                      {formatCentsToBRL(it.line_total_cents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal dos Produtos</span>
                <span>{formatCentsToBRL(selectedOrderDetails.subtotal_cents)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Taxa de Entrega</span>
                <span>{formatCentsToBRL(selectedOrderDetails.delivery_fee_cents)}</span>
              </div>
              {selectedOrderDetails.discount_cents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Desconto Aplicado</span>
                  <span>-{formatCentsToBRL(selectedOrderDetails.discount_cents)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-amber-400 pt-1.5 border-t border-zinc-800">
                <span>Total Final</span>
                <span>{formatCentsToBRL(selectedOrderDetails.total_cents)}</span>
              </div>
              <p className="text-[10px] text-zinc-400 pt-1">
                Forma de Pagamento: <strong>{selectedOrderDetails.payment_method.replace(/_/g, ' ')}</strong> &bull;{' '}
                <span className="text-emerald-400">{selectedOrderDetails.payment_status}</span>
              </p>
            </div>

            {/* Print / Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => window.print()}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Recibo</span>
              </button>

              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
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
              Selecione um motoboy ativo para entrega deste pedido. Somente entregadores ativos podem receber atribuição.
            </p>

            <select
              value={selectedCourierId}
              onChange={(e) => setSelectedCourierId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white"
            >
              <option value="">Selecione um motoboy ativo...</option>
              {activeCouriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.vehicle_type} - {c.phone}){' '}
                  {c.is_available_for_orders ? '• Livre' : '• Ocupado'}
                </option>
              ))}
            </select>

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

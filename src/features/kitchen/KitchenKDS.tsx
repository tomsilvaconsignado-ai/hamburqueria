import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  Clock,
  Bike,
  Store,
  CheckCircle,
  Play,
  Package,
  AlertTriangle,
  Flame,
  Volume2,
} from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { getOrders, subscribeToRealtime, updateOrderStatus } from '../../services/storage';
import { getNextStatus, isOnlinePayment } from '../../services/orderStateMachine';
import { formatTimeBR, getElapsedMinutes } from '../../lib/formatters/date';
import { reportResult } from '../../lib/reportResult';
import { useAuth } from '../auth/AuthContext';

export const KitchenKDS: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const loadOrders = () => {
    const list = getOrders();
    // Exibe pedidos que requerem ação da cozinha
    const active = list.filter(
      (o) =>
        o.status === 'AGUARDANDO_CONFIRMACAO' ||
        o.status === 'CONFIRMADO' ||
        o.status === 'EM_PREPARACAO' ||
        o.status === 'PRONTO' ||
        o.status === 'AGUARDANDO_RETIRADA'
    );
    setOrders(active);
  };

  useEffect(() => {
    loadOrders();
    const unsub = subscribeToRealtime(() => {
      loadOrders();
    });
    return unsub;
  }, []);

  // Pedido de delivery pronto sai da cozinha pelo entregador (ação dele no painel)
  const kitchenCanAdvance = (order: Order) =>
    !(order.status === 'PRONTO' && order.fulfillment_type === 'DELIVERY') &&
    !(order.status === 'AGUARDANDO_CONFIRMACAO' && isOnlinePayment(order) && order.payment_status !== 'PAGO');

  const handleAdvanceStatus = async (order: Order) => {
    const next: OrderStatus | null = getNextStatus(order);
    if (!next || !kitchenCanAdvance(order)) return;
    const res = await updateOrderStatus(
      order.id,
      next,
      user?.role ?? 'KITCHEN',
      user?.full_name ?? 'Cozinha',
      'Avanço pelo painel da cozinha'
    );
    reportResult(res);
  };

  // Grupos por coluna Kanban
  const confirmedOrders = orders.filter((o) => o.status === 'AGUARDANDO_CONFIRMACAO' || o.status === 'CONFIRMADO');
  const preparingOrders = orders.filter((o) => o.status === 'EM_PREPARACAO');
  const readyOrders = orders.filter((o) => o.status === 'PRONTO');
  const pickupWaitingOrders = orders.filter((o) => o.status === 'AGUARDANDO_RETIRADA');

  const renderOrderCard = (order: Order) => {
    const elapsed = getElapsedMinutes(order.created_at);
    const isUrgent = elapsed >= 25;
    const isWarning = elapsed >= 15 && elapsed < 25;

    return (
      <div
        key={order.id}
        className={`p-4 rounded-3xl border transition duration-200 shadow-xl flex flex-col justify-between ${
          isUrgent
            ? 'bg-rose-950/40 border-rose-500/70 shadow-rose-900/20'
            : isWarning
            ? 'bg-amber-950/30 border-amber-500/60 shadow-amber-900/10'
            : 'bg-[#181a24] border-zinc-800'
        }`}
      >
        <div>
          {/* Header of the card */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black font-['Bebas_Neue',sans-serif] text-white">
                  {order.order_number}
                </span>
                <span
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    order.fulfillment_type === 'DELIVERY'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}
                >
                  {order.fulfillment_type === 'DELIVERY' ? (
                    <>
                      <Bike className="w-3 h-3" />
                      <span>Delivery</span>
                    </>
                  ) : (
                    <>
                      <Store className="w-3 h-3" />
                      <span>Retirada</span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-300 mt-0.5">{order.customer_name}</p>
            </div>

            {/* Timer Badge */}
            <div
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-mono font-bold ${
                isUrgent
                  ? 'bg-rose-600 text-white animate-pulse'
                  : isWarning
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{elapsed} min</span>
            </div>
          </div>

          {/* Items list */}
          <div className="py-3 space-y-3">
            {order.items.map((it) => (
              <div key={it.id} className="text-xs space-y-1">
                <div className="flex items-start justify-between font-bold text-white">
                  <span className="text-amber-400 font-extrabold text-sm">{it.quantity}x</span>
                  <span className="flex-1 ml-2 text-zinc-100">{it.product_name_snapshot}</span>
                </div>

                {/* Options / Customizations */}
                {it.options && it.options.length > 0 && (
                  <div className="pl-6 space-y-0.5 text-[11px] text-amber-300/90 font-medium">
                    {it.options.map((opt, i) => (
                      <p key={i}>• {opt.option_name_snapshot}</p>
                    ))}
                  </div>
                )}

                {/* Specific item notes */}
                {it.notes && (
                  <div className="ml-6 p-1.5 rounded-lg bg-red-950/60 border border-red-500/40 text-[11px] text-red-300 flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3 shrink-0 text-red-400" />
                    <span>Obs: {it.notes}</span>
                  </div>
                )}
              </div>
            ))}

            {/* Global Order Customer Notes */}
            {order.customer_notes && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start space-x-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  <strong>Nota do Cliente:</strong> {order.customer_notes}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-zinc-800/80">
          {!kitchenCanAdvance(order) ? (
            <div className="w-full py-2.5 rounded-xl text-xs font-bold text-center bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center space-x-1.5">
              {order.status === 'PRONTO' ? (
                <>
                  <Bike className="w-4 h-4" />
                  <span>{order.assigned_courier_name ? `Aguardando ${order.assigned_courier_name}` : 'Aguardando entregador'}</span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  <span>Aguardando pagamento online</span>
                </>
              )}
            </div>
          ) : (
          <button
            onClick={() => handleAdvanceStatus(order)}
            className="w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition active:scale-98 cursor-pointer shadow-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/20"
          >
            {order.status === 'AGUARDANDO_CONFIRMACAO' && (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Confirmar Pedido</span>
              </>
            )}
            {order.status === 'CONFIRMADO' && (
              <>
                <Flame className="w-4 h-4 text-red-600" />
                <span>Iniciar Preparo na Chapa</span>
              </>
            )}
            {order.status === 'EM_PREPARACAO' && (
              <>
                <Package className="w-4 h-4" />
                <span>Marcar como Pronto</span>
              </>
            )}
            {order.status === 'PRONTO' && (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Liberar no Balcão</span>
              </>
            )}
            {order.status === 'AGUARDANDO_RETIRADA' && (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Concluir Retirada</span>
              </>
            )}
          </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0e1017] text-white p-4 sm:p-6 lg:p-8 space-y-6">
      {/* KDS Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-[#141620] border border-zinc-800 shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <ChefHat className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white">
                KITCHEN DISPLAY SYSTEM (KDS)
              </h1>
              <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>AO VIVO</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Operação da Cozinha • Monitoramento de Chapa, Fritadeira e Embalagem
            </p>
          </div>
        </div>

        {/* Stats summary & volume toggle */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800">
              Confirmados: <strong className="text-amber-400">{confirmedOrders.length}</strong>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800">
              Na Chapa: <strong className="text-orange-400">{preparingOrders.length}</strong>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800">
              Prontos: <strong className="text-emerald-400">{readyOrders.length}</strong>
            </span>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition ${
              soundEnabled
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-500'
            }`}
            title="Alerta sonoro de novos pedidos"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 4 Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
        {/* Column 1: Novos / Confirmados */}
        <div className="bg-[#12141c] rounded-3xl p-4 border border-zinc-800/80 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200">
                1. Confirmados
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-zinc-900 text-xs font-bold text-amber-400 border border-zinc-800">
              {confirmedOrders.length}
            </span>
          </div>

          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {confirmedOrders.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-10">Nenhum pedido na fila</p>
            ) : (
              confirmedOrders.map(renderOrderCard)
            )}
          </div>
        </div>

        {/* Column 2: Em Preparação (Chapa) */}
        <div className="bg-[#12141c] rounded-3xl p-4 border border-zinc-800/80 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200">
                2. Em Preparação
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-zinc-900 text-xs font-bold text-orange-400 border border-zinc-800">
              {preparingOrders.length}
            </span>
          </div>

          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {preparingOrders.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-10">Chapa livre no momento</p>
            ) : (
              preparingOrders.map(renderOrderCard)
            )}
          </div>
        </div>

        {/* Column 3: Prontos (Embalados) */}
        <div className="bg-[#12141c] rounded-3xl p-4 border border-zinc-800/80 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200">
                3. Prontos na Bancada
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-zinc-900 text-xs font-bold text-emerald-400 border border-zinc-800">
              {readyOrders.length}
            </span>
          </div>

          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {readyOrders.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-10">Nenhum pedido aguardando coleta</p>
            ) : (
              readyOrders.map(renderOrderCard)
            )}
          </div>
        </div>

        {/* Column 4: Aguardando Retirada no Balcão */}
        <div className="bg-[#12141c] rounded-3xl p-4 border border-zinc-800/80 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-blue-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-200">
                4. Retirada / Balcão
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-zinc-900 text-xs font-bold text-blue-400 border border-zinc-800">
              {pickupWaitingOrders.length}
            </span>
          </div>

          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {pickupWaitingOrders.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-10">Nenhum pedido no balcão</p>
            ) : (
              pickupWaitingOrders.map(renderOrderCard)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

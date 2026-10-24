import React, { useState, useEffect } from 'react';
import {
  Bike,
  MapPin,
  Phone,
  Navigation,
  CheckCircle,
  PackageCheck,
  Clock,
  DollarSign,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Order, Courier } from '../../types';
import {
  getOrders,
  getCourierByUserId,
  toggleCourierAvailability,
  subscribeToRealtime,
  updateCourierDeliveryStatus,
} from '../../services/storage';
import { formatCentsToBRL } from '../../lib/formatters/currency';
import { formatDateTimeBR } from '../../lib/formatters/date';
import { reportResult } from '../../lib/reportResult';
import { useAuth } from '../auth/AuthContext';

export const DeliveryPanel: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [courierData, setCourierData] = useState<Courier | undefined>(undefined);

  const loadDeliveries = () => {
    if (!user) return;
    // Entregador = cadastro em `couriers` vinculado à conta logada
    const cData = getCourierByUserId(user.id);
    setCourierData(cData);

    // Admin acompanha todas as entregas atribuídas; entregador só as suas
    setOrders(
      getOrders().filter((o) =>
        isAdmin ? Boolean(o.assigned_courier_id) : Boolean(cData && o.assigned_courier_id === cData.id)
      )
    );
  };

  useEffect(() => {
    loadDeliveries();
    return subscribeToRealtime(() => {
      loadDeliveries();
    });
  }, [user?.id]);

  const currentDeliveries = orders.filter((o) => o.status !== 'CONCLUIDO' && o.status !== 'CANCELADO');
  const completedDeliveries = orders.filter((o) => o.status === 'CONCLUIDO');

  const handleAction = async (order: Order, action: 'PICKUP' | 'DELIVERED') => {
    const collectOnDelivery = order.payment_status === 'PAGAMENTO_NA_ENTREGA';
    if (
      action === 'DELIVERED' &&
      collectOnDelivery &&
      !confirm(`Confirma que recebeu ${formatCentsToBRL(order.total_cents)} do cliente?`)
    ) {
      return;
    }
    const res = await updateCourierDeliveryStatus(
      order.id,
      order.assigned_courier_id ?? '',
      action,
      action === 'DELIVERED' && collectOnDelivery
    );
    reportResult(res);
  };

  if (!user) return null;

  if (!isAdmin && !courierData) {
    return (
      <div className="min-h-screen bg-[#0d0f15] text-white p-6 max-w-xl mx-auto flex items-center">
        <div className="p-6 rounded-3xl bg-[#141622] border border-amber-500/40 text-center space-y-2 w-full">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="font-bold">Conta ainda não vinculada a um cadastro de entregador</p>
          <p className="text-xs text-zinc-400">
            Peça à gerência para vincular sua conta em Admin → Entregadores. Depois disso suas entregas aparecem aqui.
          </p>
        </div>
      </div>
    );
  }

  const courierName = courierData?.full_name ?? user.full_name;

  const getGpsLink = (addr?: { street: string; number: string; neighborhood: string; city: string }) => {
    if (!addr) return '#';
    const query = encodeURIComponent(`${addr.street}, ${addr.number} - ${addr.neighborhood}, ${addr.city}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  };

  const getWazeLink = (addr?: { street: string; number: string; neighborhood: string; city: string }) => {
    if (!addr) return '#';
    const query = encodeURIComponent(`${addr.street}, ${addr.number} - ${addr.neighborhood}`);
    return `https://waze.com/ul?q=${query}&navigate=yes`;
  };

  const totalEarnedCents = completedDeliveries.length * 900; // Taxa de R$ 9,00 por corrida repassada ao entregador

  return (
    <div className="min-h-screen bg-[#0d0f15] text-white p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Blocked or Inactive Alert */}
      {courierData && courierData.status !== 'ATIVO' && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-rose-300 flex items-start space-x-3 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Situação Cadastral: {courierData.status}</p>
            <p className="mt-0.5 text-zinc-300">
              Seu cadastro está suspenso ou bloqueado pela administração. Você não poderá receber ou despachar novas entregas. Entre em contato com a gerência.
            </p>
          </div>
        </div>
      )}

      {/* Header Profile */}
      <div className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20">
            <Bike className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-black text-white">{courierName}</h1>
              {courierData ? (
                <button
                  onClick={() => {
                    if (courierData.status === 'ATIVO') {
                      toggleCourierAvailability(courierData.id).then(reportResult);
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition cursor-pointer ${
                    courierData.status !== 'ATIVO'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : courierData.is_available_for_orders
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {courierData.status !== 'ATIVO'
                    ? courierData.status
                    : courierData.is_available_for_orders
                    ? 'LIVRE PARA ENTREGAS'
                    : 'PAUSA / OCUPADO'}
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  DISPONÍVEL
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              {courierData?.phone ?? user.phone} &bull;{' '}
              {courierData?.vehicle_type ? `${courierData.vehicle_type} (${courierData.vehicle_model || ''})` : 'Motoboy Oficial'}
            </p>
          </div>
        </div>

        {/* Daily summary */}
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-zinc-400 block">Ganhos do Turno</span>
          <span className="text-xl font-black text-amber-400 font-['Bebas_Neue',sans-serif]">
            {formatCentsToBRL(totalEarnedCents)}
          </span>
          <span className="text-[10px] text-zinc-400 block">({completedDeliveries.length} entregas)</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800">
        <button
          onClick={() => setActiveTab('current')}
          className={`py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
            activeTab === 'current'
              ? 'bg-amber-500 text-zinc-950 shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Entregas Ativas ({currentDeliveries.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
            activeTab === 'history'
              ? 'bg-amber-500 text-zinc-950 shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Histórico Concluído ({completedDeliveries.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === 'current' ? (
        <div className="space-y-4">
          {currentDeliveries.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 bg-zinc-900/40 rounded-3xl border border-zinc-800 space-y-3">
              <Bike className="w-12 h-12 text-zinc-600 mx-auto" />
              <p className="text-sm font-semibold text-zinc-300">
                Você não tem nenhuma entrega pendente no momento.
              </p>
              <p className="text-xs text-zinc-500">
                Assim que a hamburgueria atribuir um novo pedido a você, ele aparecerá aqui com as instruções.
              </p>
            </div>
          ) : (
            currentDeliveries.map((order) => {
              const addr = order.delivery_address_snapshot;
              const isPaymentOnDelivery = order.payment_status === 'PAGAMENTO_NA_ENTREGA';

              return (
                <div
                  key={order.id}
                  className="p-5 rounded-3xl bg-[#141622] border border-amber-500/40 shadow-xl space-y-4"
                >
                  {/* Top order info */}
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                      <span className="text-2xl font-black font-['Bebas_Neue',sans-serif] text-amber-400">
                        {order.order_number}
                      </span>
                      <p className="text-xs text-zinc-300">
                        Cliente: <strong>{order.customer_name}</strong>
                      </p>
                    </div>

                    <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black uppercase">
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Destination Address & GPS */}
                  {addr && (
                    <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                      <div className="flex items-start space-x-2 text-xs">
                        <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-white text-sm">
                            {addr.street}, {addr.number} {addr.complement}
                          </p>
                          <p className="text-zinc-400">
                            {addr.neighborhood} - {addr.city}
                          </p>
                          {addr.reference && (
                            <p className="text-amber-300/90 italic mt-0.5">
                              Ponto de Ref: {addr.reference}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* GPS Action Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/60">
                        <a
                          href={getGpsLink(addr)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold transition"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Google Maps</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>

                        <a
                          href={getWazeLink(addr)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-bold transition"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Waze</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Customer phone with call button */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                    <span className="text-zinc-400">Contato: {order.customer_phone}</span>
                    <a
                      href={`tel:${order.customer_phone.replace(/\D/g, '')}`}
                      className="flex items-center space-x-1 text-emerald-400 font-bold hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Ligar para o Cliente</span>
                    </a>
                  </div>

                  {/* Payment notice if cash or card on delivery */}
                  {isPaymentOnDelivery && (
                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          Cobrar na entrega: <strong>{formatCentsToBRL(order.total_cents)}</strong> (
                          {order.payment_method === 'CASH_ON_DELIVERY' ? 'Dinheiro' : 'Cartão'})
                          {order.cash_change_for_cents ? (
                            <> • Levar troco para <strong>{formatCentsToBRL(order.cash_change_for_cents)}</strong></>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Operational workflow buttons */}
                  <div className="space-y-2 pt-2">
                    {order.status === 'CONFIRMADO' || order.status === 'EM_PREPARACAO' || order.status === 'AGUARDANDO_CONFIRMACAO' ? (
                      <div className="w-full py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-bold flex items-center justify-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>Pedido ainda em preparo na cozinha</span>
                      </div>
                    ) : order.status === 'PRONTO' ? (
                      <button
                        onClick={() => handleAction(order, 'PICKUP')}
                        className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 active:scale-98 cursor-pointer"
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>Confirmar Retirada na Hamburgueria</span>
                      </button>
                    ) : order.status === 'EM_ENTREGA' ? (
                      <button
                        onClick={() => handleAction(order, 'DELIVERED')}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/30 active:scale-98 cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Confirmar Entrega Concluída com Sucesso</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* History list */
        <div className="space-y-3">
          {completedDeliveries.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-10">Nenhuma entrega realizada ainda.</p>
          ) : (
            completedDeliveries.map((order) => (
              <div
                key={order.id}
                className="p-4 rounded-2xl bg-[#141620] border border-zinc-800 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white">{order.order_number}</span>
                    <span className="text-emerald-400 font-semibold">• Entregue</span>
                  </div>
                  <p className="text-zinc-400 mt-0.5">
                    {order.customer_name} • {order.delivery_address_snapshot?.neighborhood}
                  </p>
                  <span className="text-[10px] text-zinc-500">
                    {formatDateTimeBR(order.completed_at || order.updated_at)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="font-black text-amber-400 text-sm">
                    {formatCentsToBRL(order.total_cents)}
                  </span>
                  <p className="text-[10px] text-emerald-400">+ R$ 9,00 taxa repasse</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

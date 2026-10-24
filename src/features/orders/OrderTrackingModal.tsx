import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  Clock,
  ChefHat,
  Bike,
  Store,
  Phone,
  AlertCircle,
  HelpCircle,
  Package,
} from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { formatCentsToBRL } from '../../lib/formatters/currency';
import { formatDateTimeBR } from '../../lib/formatters/date';
import { getMyOrders, subscribeToRealtime, updateOrderStatus } from '../../services/storage';
import { useAuth } from '../auth/AuthContext';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderId?: string;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  initialOrderId,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialOrderId || '');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const { user } = useAuth();

  const reloadOrders = () => {
    // Apenas pedidos da conta logada ou criados neste navegador (sem busca por telefone de terceiros)
    const list = getMyOrders(user?.id);
    setOrders(list);

    const current = selectedOrder ? list.find((o) => o.id === selectedOrder.id) : undefined;
    const fromQuery = searchQuery
      ? list.find((o) => o.id === searchQuery || o.order_number.toLowerCase() === searchQuery.toLowerCase())
      : undefined;
    setSelectedOrder(fromQuery ?? current ?? list[0] ?? null);
  };

  useEffect(() => {
    if (isOpen) {
      reloadOrders();
      return subscribeToRealtime(() => {
        reloadOrders();
      });
    }
  }, [isOpen, searchQuery, user?.id]);

  useEffect(() => {
    if (initialOrderId) setSearchQuery(initialOrderId);
  }, [initialOrderId]);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchQuery.trim().toLowerCase();
    const found = orders.find((o) => o.order_number.toLowerCase() === clean || o.id.toLowerCase() === clean);
    if (found) {
      setSelectedOrder(found);
    } else {
      alert('Nenhum pedido seu encontrado com esse número. Use o link de acompanhamento recebido no pedido.');
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    const res = await updateOrderStatus(
      selectedOrder.id,
      'CANCELADO',
      'CUSTOMER',
      selectedOrder.customer_name,
      cancelReason || 'Cancelado a pedido do cliente'
    );
    if (res.success) {
      setShowCancelModal(false);
      reloadOrders();
    } else {
      alert(res.error);
    }
  };

  // Timeline steps computation
  const isDelivery = selectedOrder?.fulfillment_type === 'DELIVERY';

  const steps: { key: OrderStatus; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      key: 'AGUARDANDO_CONFIRMACAO',
      label: 'Pedido Recebido',
      desc: 'Aguardando confirmação da hamburgueria',
      icon: <Clock className="w-5 h-5" />,
    },
    {
      key: 'CONFIRMADO',
      label: 'Confirmado',
      desc: 'Pedido aceito e enviado para a fila',
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
    {
      key: 'EM_PREPARACAO',
      label: 'Em Preparação',
      desc: 'Chef preparando seus hambúrgueres na brasa',
      icon: <ChefHat className="w-5 h-5" />,
    },
    {
      key: 'PRONTO',
      label: 'Pronto na Cozinha',
      desc: 'Embalado e pronto para entrega ou coleta',
      icon: <Package className="w-5 h-5" />,
    },
    {
      key: isDelivery ? 'EM_ENTREGA' : 'AGUARDANDO_RETIRADA',
      label: isDelivery ? 'Saiu para Entrega' : 'Aguardando Retirada',
      desc: isDelivery ? 'Motoboy a caminho do seu endereço' : 'Disponível no balcão da hamburgueria',
      icon: isDelivery ? <Bike className="w-5 h-5" /> : <Store className="w-5 h-5" />,
    },
    {
      key: 'CONCLUIDO',
      label: 'Entregue / Concluído',
      desc: 'Bom apetite!',
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
  ];

  const getStatusStepIndex = (status: OrderStatus): number => {
    switch (status) {
      case 'AGUARDANDO_CONFIRMACAO':
        return 0;
      case 'CONFIRMADO':
        return 1;
      case 'EM_PREPARACAO':
        return 2;
      case 'PRONTO':
        return 3;
      case 'EM_ENTREGA':
      case 'AGUARDANDO_RETIRADA':
        return 4;
      case 'CONCLUIDO':
        return 5;
      case 'CANCELADO':
        return -1;
      default:
        return 0;
    }
  };

  const currentStepIdx = selectedOrder ? getStatusStepIndex(selectedOrder.status) : 0;
  const isCancellable =
    selectedOrder &&
    (selectedOrder.status === 'AGUARDANDO_CONFIRMACAO' || selectedOrder.status === 'CONFIRMADO');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#12141c] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-8 text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-[#0e1017] border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white">
                ACOMPANHAMENTO EM TEMPO REAL
              </h2>
              <p className="text-xs text-zinc-400">
                Sincronizado ao vivo com a cozinha e motoboy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar for Other Orders */}
        <div className="p-4 bg-[#151722] border-b border-zinc-800/80 shrink-0">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Número do seu pedido (ex: #BH-1041)"
                className="w-full bg-zinc-950 border border-zinc-750 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Consultar
            </button>
          </form>
        </div>

        {/* Order Details Body */}
        {selectedOrder ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top Order Card */}
            <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-black font-['Bebas_Neue',sans-serif] text-amber-400">
                    {selectedOrder.order_number}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                      selectedOrder.status === 'CANCELADO'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : selectedOrder.status === 'CONCLUIDO'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {selectedOrder.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Cliente: <strong className="text-zinc-200">{selectedOrder.customer_name}</strong> •{' '}
                  {formatDateTimeBR(selectedOrder.created_at)}
                </p>
              </div>

              <div className="text-right">
                <span className="block text-xs text-zinc-400">Total do Pedido</span>
                <span className="text-xl font-black text-white font-['Bebas_Neue',sans-serif]">
                  {formatCentsToBRL(selectedOrder.total_cents)}
                </span>
                <span className="block text-[10px] text-zinc-400">
                  {selectedOrder.payment_method.replace('_', ' ')} • {selectedOrder.payment_status}
                </span>
              </div>
            </div>

            {/* Link privado de acompanhamento (funciona em qualquer aparelho) */}
            {selectedOrder.guest_access_token && (
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 flex flex-wrap items-center justify-between gap-2">
                <span>Guarde este link para acompanhar o pedido de outro aparelho. Não compartilhe.</span>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}/acompanhar/${selectedOrder.guest_access_token}`
                    )
                  }
                  className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold transition cursor-pointer"
                >
                  Copiar link
                </button>
              </div>
            )}

            {/* Cancelled Banner */}
            {selectedOrder.status === 'CANCELADO' ? (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                <div className="flex items-center space-x-2 font-bold text-sm">
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                  <span>Este pedido foi cancelado</span>
                </div>
                <p>Motivo: {selectedOrder.cancellation_reason || 'Cancelamento solicitado'}</p>
                {selectedOrder.payment_status === 'REEMBOLSO_PENDENTE' && (
                  <p className="text-amber-300">
                    • Reembolso em processamento pela instituição financeira.
                  </p>
                )}
              </div>
            ) : (
              /* Timeline */
              <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                  Progresso da Entrega
                </h3>

                <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                  {steps.map((step, idx) => {
                    const isDone = currentStepIdx > idx;
                    const isCurrent = currentStepIdx === idx;
                    const isPending = currentStepIdx < idx;

                    return (
                      <div key={step.key} className="relative flex items-start space-x-4">
                        <div
                          className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center transition ${
                            isDone
                              ? 'bg-emerald-500 text-zinc-950 ring-4 ring-emerald-500/20'
                              : isCurrent
                              ? 'bg-amber-500 text-zinc-950 ring-4 ring-amber-500/30 animate-pulse'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                          ) : (
                            <span className="text-[10px] font-black">{idx + 1}</span>
                          )}
                        </div>

                        <div className="pt-0.5">
                          <h4
                            className={`text-sm font-bold ${
                              isCurrent ? 'text-amber-400 font-extrabold' : isDone ? 'text-zinc-200' : 'text-zinc-500'
                            }`}
                          >
                            {step.label}
                          </h4>
                          <p className="text-xs text-zinc-400">{step.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Courier Card if assigned */}
            {selectedOrder.assigned_courier_name && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center font-black">
                    <Bike className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                      ENTREGADOR DESIGNADO
                    </span>
                    <h4 className="text-sm font-bold text-white">
                      {selectedOrder.assigned_courier_name}
                    </h4>
                  </div>
                </div>

                {selectedOrder.assigned_courier_phone && (
                  <a
                    href={`tel:${selectedOrder.assigned_courier_phone.replace(/\D/g, '')}`}
                    className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-amber-300 hover:text-white"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Ligar</span>
                  </a>
                )}
              </div>
            )}

            {/* Items summary */}
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Itens do Pedido ({selectedOrder.items.length})
              </h4>
              <div className="divide-y divide-zinc-800/60">
                {selectedOrder.items.map((it) => (
                  <div key={it.id} className="py-2.5 flex justify-between text-xs">
                    <div>
                      <span className="font-bold text-white">
                        {it.quantity}x {it.product_name_snapshot}
                      </span>
                      {it.options && it.options.length > 0 && (
                        <div className="text-[11px] text-zinc-400 pl-2 mt-0.5">
                          {it.options.map((opt, i) => (
                            <span key={i} className="block">
                              + {opt.option_name_snapshot}
                            </span>
                          ))}
                        </div>
                      )}
                      {it.notes && (
                        <span className="block text-[11px] text-amber-400 italic mt-0.5">
                          Obs: {it.notes}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-zinc-300">
                      {formatCentsToBRL(it.line_total_cents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Destination Address if delivery */}
            {selectedOrder.delivery_address_snapshot && (
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-1 text-zinc-300">
                <span className="font-bold text-amber-400 block uppercase tracking-wider text-[11px]">
                  Endereço de Entrega
                </span>
                <p className="font-medium text-white">
                  {selectedOrder.delivery_address_snapshot.street},{' '}
                  {selectedOrder.delivery_address_snapshot.number}{' '}
                  {selectedOrder.delivery_address_snapshot.complement}
                </p>
                <p className="text-zinc-400">
                  {selectedOrder.delivery_address_snapshot.neighborhood} -{' '}
                  {selectedOrder.delivery_address_snapshot.city}
                </p>
                {selectedOrder.delivery_address_snapshot.reference && (
                  <p className="text-zinc-500 italic">
                    Ref: {selectedOrder.delivery_address_snapshot.reference}
                  </p>
                )}
              </div>
            )}

            {/* Actions: Cancel and WhatsApp Support */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <a
                href={`https://wa.me/5511987654321?text=Olá,%20gostaria%20de%20informações%20sobre%20meu%20pedido%20${selectedOrder.order_number}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition"
              >
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                <span>Ajuda via WhatsApp</span>
              </a>

              {isCancellable && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar Pedido
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-zinc-400 space-y-3">
            <Package className="w-12 h-12 text-zinc-600 mx-auto" />
            <p>Nenhum pedido selecionado. Digite o número acima para consultar.</p>
          </div>
        )}

        {/* Cancel Confirmation Submodal */}
        {showCancelModal && (
          <div className="absolute inset-0 bg-black/90 p-6 flex items-center justify-center z-20">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-700 p-6 rounded-2xl space-y-4 text-white">
              <h3 className="text-lg font-bold text-rose-400">Deseja realmente cancelar?</h3>
              <p className="text-xs text-zinc-300">
                Cancelamentos só podem ser efetuados antes do início do preparo na cozinha.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Motivo do cancelamento (opcional)..."
                rows={2}
                className="w-full bg-zinc-950 border border-zinc-750 rounded-xl p-2.5 text-xs text-white resize-none"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold"
                >
                  Voltar
                </button>
                <button
                  onClick={handleCancelOrder}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

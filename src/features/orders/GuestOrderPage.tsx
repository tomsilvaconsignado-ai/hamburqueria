import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Order, OrderStatus } from '../../types';
import { getOrderByGuestToken, loadOrderByGuestToken, subscribeToRealtime } from '../../services/storage';
import { formatCentsToBRL } from '../../lib/formatters/currency';
import { formatDateTimeBR } from '../../lib/formatters/date';
import {
  Bike,
  Store,
  Clock,
  CheckCircle2,
  ChefHat,
  Package,
  ArrowLeft,
  AlertCircle,
  HelpCircle,
  Flame,
} from 'lucide-react';

export const GuestOrderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    // Somente o token secreto do link dá acesso (número do pedido é sequencial e adivinhável)
    setLoading(true);
    loadOrderByGuestToken(token).then((found) => {
      setOrder(found ?? null);
      setLoading(false);
    });
    return subscribeToRealtime(() => {
      setOrder(getOrderByGuestToken(token) ?? null);
    });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c12] text-zinc-400 flex items-center justify-center text-xs">
        Carregando pedido...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#0a0c12] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="p-8 max-w-md w-full rounded-3xl bg-[#141622] border border-zinc-800 shadow-2xl space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold">Pedido Não Localizado</h2>
          <p className="text-xs text-zinc-400">
            Não encontramos nenhum pedido para este link. Confira se o endereço foi copiado por completo.
          </p>
          <Link
            to="/"
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Cardápio</span>
          </Link>
        </div>
      </div>
    );
  }

  const isDelivery = order.fulfillment_type === 'DELIVERY';

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

  const currentStepIdx = getStatusStepIndex(order.status);

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Navbar Back */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center space-x-2 text-xs font-bold text-zinc-400 hover:text-amber-400 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Cardápio</span>
          </Link>
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <span className="font-extrabold font-['Bebas_Neue',sans-serif] text-xl tracking-wider">
              BURGER HUB
            </span>
          </div>
        </div>

        {/* Order Header Card */}
        <div className="p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-3xl font-black font-['Bebas_Neue',sans-serif] text-amber-400">
                {order.order_number}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                  order.status === 'CONCLUIDO'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : order.status === 'CANCELADO'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {order.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {formatDateTimeBR(order.created_at)} • {order.fulfillment_type === 'DELIVERY' ? '🛵 Delivery' : '🏪 Retirada'}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-zinc-400 block">Total</span>
            <span className="text-2xl font-black text-white font-['Bebas_Neue',sans-serif]">
              {formatCentsToBRL(order.total_cents)}
            </span>
            <span className="text-[10px] text-zinc-400 block">
              {order.payment_method.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Timeline */}
        {order.status === 'CANCELADO' ? (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            Pedido cancelado: {order.cancellation_reason || 'Cancelamento solicitado'}
          </div>
        ) : (
          <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Progresso do seu Pedido
            </h3>
            <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
              {steps.map((step, idx) => {
                const isDone = currentStepIdx > idx;
                const isCurrent = currentStepIdx === idx;

                return (
                  <div key={step.key} className="relative flex items-start space-x-4">
                    <div
                      className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center transition ${
                        isDone
                          ? 'bg-emerald-500 text-zinc-950'
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
                    <div>
                      <h4
                        className={`text-sm font-bold ${
                          isCurrent ? 'text-amber-400' : isDone ? 'text-zinc-200' : 'text-zinc-500'
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

        {/* Items */}
        <div className="p-5 rounded-2xl bg-[#141620] border border-zinc-800 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Itens Solicitados ({order.items.length})
          </h4>
          <div className="divide-y divide-zinc-800/60">
            {order.items.map((it) => (
              <div key={it.id} className="py-2.5 flex justify-between text-xs">
                <div>
                  <span className="font-bold text-white">
                    {it.quantity}x {it.product_name_snapshot}
                  </span>
                  {it.options?.map((opt, i) => (
                    <span key={i} className="block text-[11px] text-zinc-400 pl-2">
                      + {opt.option_name_snapshot}
                    </span>
                  ))}
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

        {/* Help via WhatsApp */}
        <div className="pt-2 flex justify-center">
          <a
            href={`https://wa.me/5511987654321?text=Olá,%20gostaria%20de%20informações%20sobre%20meu%20pedido%20${order.order_number}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition"
          >
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span>Precisa de Ajuda? Fale no WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Clock, Bike, Store, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Order, OrderStatus } from '../../../types';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { getElapsedMinutes, formatTimeBR } from '../../../lib/formatters/date';
import { STATUS_LABEL, STATUS_STYLE } from '../../../lib/labels';
import { getNextStatus, isOnlinePayment } from '../../../services/orderStateMachine';

// Colunas do painel operacional (pedidos ainda em andamento)
const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: 'Recebidos', statuses: ['AGUARDANDO_CONFIRMACAO'] },
  { title: 'Confirmados', statuses: ['CONFIRMADO'] },
  { title: 'Em preparação', statuses: ['EM_PREPARACAO'] },
  { title: 'Prontos', statuses: ['PRONTO', 'AGUARDANDO_RETIRADA'] },
  { title: 'Saiu para entrega', statuses: ['EM_ENTREGA'] },
];

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMADO: 'Confirmar',
  EM_PREPARACAO: 'Iniciar preparo',
  PRONTO: 'Marcar pronto',
  AGUARDANDO_RETIRADA: 'Liberar no balcão',
  EM_ENTREGA: 'Despachar',
  CONCLUIDO: 'Concluir',
};

interface Props {
  orders: Order[];
  onOpen: (order: Order) => void;
  onAdvance: (order: Order, next: OrderStatus) => void;
  onAssign: (order: Order) => void;
}

export const OrderBoard: React.FC<Props> = ({ orders, onOpen, onAdvance, onAssign }) => (
  <div className="grid grid-flow-col auto-cols-[minmax(250px,1fr)] gap-3 overflow-x-auto pb-2">
    {COLUMNS.map((col) => {
      const list = orders
        .filter((o) => col.statuses.includes(o.status))
        .sort((a, b) => a.created_at.localeCompare(b.created_at)); // mais antigo primeiro
      return (
        <section key={col.title} className="rounded-2xl bg-[#141620] border border-zinc-800 p-3 space-y-2.5 min-h-[160px]" aria-label={col.title}>
          <h3 className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-zinc-300">
            {col.title}
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-amber-300">{list.length}</span>
          </h3>
          {list.length === 0 && <p className="text-[11px] text-zinc-600 py-6 text-center">Nenhum pedido</p>}
          {list.map((o) => {
            const next = getNextStatus(o);
            const waitingPayment = o.status === 'AGUARDANDO_CONFIRMACAO' && isOnlinePayment(o) && o.payment_status !== 'PAGO';
            const needsCourier = o.status === 'PRONTO' && o.fulfillment_type === 'DELIVERY' && !o.assigned_courier_id;
            const minutes = getElapsedMinutes(o.created_at);
            return (
              <article key={o.id} className={`rounded-xl border p-3 space-y-2 bg-zinc-950 ${STATUS_STYLE[o.status].split(' ').find((c) => c.startsWith('border-'))}`}>
                <button type="button" onClick={() => onOpen(o)} className="w-full text-left cursor-pointer space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-400">{o.order_number}</span>
                    <span className={`flex items-center gap-1 text-[11px] font-bold ${minutes >= 40 ? 'text-rose-400' : 'text-zinc-400'}`}>
                      <Clock className="w-3 h-3" /> {formatTimeBR(o.created_at)} · {minutes} min
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white truncate">{o.customer_name}</p>
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                    {o.fulfillment_type === 'DELIVERY' ? <Bike className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                    {o.fulfillment_type === 'DELIVERY' ? o.delivery_address_snapshot?.neighborhood ?? 'Entrega' : 'Retirada'}
                    {' · '}
                    {formatCentsToBRL(o.total_cents)}
                  </p>
                  <p className="text-[11px] text-zinc-300 line-clamp-2">
                    {o.items.map((i) => `${i.quantity}x ${i.product_name_snapshot}`).join(', ')}
                  </p>
                  {o.status === 'AGUARDANDO_RETIRADA' && (
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  )}
                </button>
                {waitingPayment ? (
                  <p className="text-[11px] text-amber-300 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Aguardando pagamento online</p>
                ) : needsCourier ? (
                  <button type="button" onClick={() => onAssign(o)} className="w-full px-2 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold cursor-pointer">
                    + Atribuir entregador
                  </button>
                ) : (
                  next && (
                    <button
                      type="button"
                      onClick={() => onAdvance(o, next)}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-100 text-[11px] font-bold transition cursor-pointer"
                    >
                      {NEXT_LABEL[next] ?? STATUS_LABEL[next]} <ChevronRight className="w-3 h-3" />
                    </button>
                  )
                )}
              </article>
            );
          })}
        </section>
      );
    })}
  </div>
);

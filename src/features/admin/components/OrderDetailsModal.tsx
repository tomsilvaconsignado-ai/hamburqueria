import React, { useEffect, useState } from 'react';
import { X, Printer, MessageCircle, Phone, History, ChefHat, Receipt, Bike, CreditCard, Loader2, Info } from 'lucide-react';
import type { Order, StoreSettings } from '../../../types';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { formatDateTimeBR, formatTimeBR } from '../../../lib/formatters/date';
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL, STATUS_STYLE } from '../../../lib/labels';
import { buildOrderMessage, MESSAGE_LABELS, OrderMessageKind, suggestedMessageFor, waMeChannel, toWhatsAppNumber } from '../../../lib/whatsapp';
import { printDeliveryReceipt, printKitchenTicket, printOrderReceipt, printPaymentReceipt } from '../../../lib/documents/templates';
import type { PaperFormat } from '../../../lib/documents/print';
import { ADMIN_DATA_AVAILABLE, fetchOrderTimeline, TimelineEntry } from '../../../services/admin.service';
import { AdminDeliveryCode } from './AdminDeliveryCode';

const ACTOR_LABEL: Record<string, string> = {
  CUSTOMER: 'Cliente',
  ADMIN: 'Administração',
  KITCHEN: 'Cozinha',
  DELIVERY: 'Entregador',
  SYSTEM: 'Sistema',
};

const FORMAT_KEY = 'bh_print_format_v1';
const readFormat = (): PaperFormat => {
  try {
    return localStorage.getItem(FORMAT_KEY) === 'a4' ? 'a4' : 'thermal80';
  } catch {
    return 'thermal80';
  }
};

interface Props {
  order: Order;
  settings: StoreSettings;
  onClose: () => void;
}

export const OrderDetailsModal: React.FC<Props> = ({ order, settings, onClose }) => {
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [format, setFormat] = useState<PaperFormat>(readFormat);
  const [kind, setKind] = useState<OrderMessageKind>(suggestedMessageFor(order.status, order.fulfillment_type));
  const [text, setText] = useState(() => buildOrderMessage(order, kind, settings.store_name));
  const [waNote, setWaNote] = useState<string | null>(null);

  useEffect(() => {
    if (!ADMIN_DATA_AVAILABLE) return;
    let alive = true;
    fetchOrderTimeline(order.id).then((r) => {
      if (!alive) return;
      if (r.error) setTimelineError(r.error);
      else setTimeline(r.data ?? []);
    });
    return () => {
      alive = false;
    };
    // recarrega quando o status muda (Realtime atualiza a lista)
  }, [order.id, order.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chooseFormat = (f: PaperFormat) => {
    setFormat(f);
    try {
      localStorage.setItem(FORMAT_KEY, f);
    } catch {
      // só nesta sessão
    }
  };

  const chooseKind = (k: OrderMessageKind) => {
    setKind(k);
    setText(buildOrderMessage(order, k, settings.store_name));
    setWaNote(null);
  };

  const openWhatsApp = async () => {
    const r = await waMeChannel.send(order.customer_phone, text);
    setWaNote(r.opened ? 'WhatsApp aberto com a mensagem. Confira e toque em enviar por lá.' : r.error ?? 'Não foi possível abrir o WhatsApp.');
  };

  const a = order.delivery_address_snapshot;
  const phoneOk = Boolean(toWhatsAppNumber(order.customer_phone));
  const docButton = 'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold transition cursor-pointer';

  return (
    <div className="fixed inset-0 bg-black/85 flex items-start sm:items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pedido ${order.order_number}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-3xl w-full p-5 sm:p-6 space-y-4 my-4"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
          <div>
            <span className="text-2xl font-black font-['Bebas_Neue',sans-serif] text-amber-400">{order.order_number}</span>
            <p className="text-xs text-zinc-400">
              {formatDateTimeBR(order.created_at)} · {FULFILLMENT_LABEL[order.fulfillment_type]}
            </p>
            <span className={`inline-block mt-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-black uppercase tracking-wide ${STATUS_STYLE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Coluna 1: cliente, itens, valores */}
          <div className="space-y-4">
            <section className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1.5 text-xs">
              <h4 className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">Cliente</h4>
              <p className="text-white font-bold">{order.customer_name}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${order.customer_phone.replace(/\D/g, '')}`} className="inline-flex items-center gap-1 text-zinc-300 hover:text-amber-400">
                  <Phone className="w-3.5 h-3.5" /> {order.customer_phone}
                </a>
              </div>
              {a ? (
                <div className="text-zinc-400 space-y-0.5 pt-1">
                  <p>
                    {a.street}, {a.number}
                    {a.complement ? ` - ${a.complement}` : ''}
                  </p>
                  <p>
                    {a.neighborhood}
                    {a.city ? ` · ${a.city}/${a.state}` : ''}
                    {a.postal_code ? ` · CEP ${a.postal_code}` : ''}
                  </p>
                  {a.reference && <p className="text-amber-300 italic">Ref: {a.reference}</p>}
                  <a
                    href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${a.street}, ${a.number}, ${a.neighborhood}, ${a.city ?? ''}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[11px] text-sky-300 hover:underline"
                  >
                    Ver no mapa (OpenStreetMap)
                  </a>
                </div>
              ) : (
                <p className="text-zinc-400">Retirada no balcão</p>
              )}
              {order.customer_notes && <p className="text-amber-300 pt-1">Obs: {order.customer_notes}</p>}
            </section>

            <section className="text-xs space-y-2">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Itens ({order.items.length})</h4>
              <div className="divide-y divide-zinc-800/80 max-h-56 overflow-y-auto pr-1">
                {order.items.map((it) => (
                  <div key={it.id} className="py-2 flex justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">
                        <span className="text-amber-400">{it.quantity}x</span> {it.product_name_snapshot}
                      </p>
                      {it.options.map((opt, i) => (
                        <p key={i} className="pl-4 text-[11px] text-zinc-400">
                          • {opt.option_name_snapshot}
                        </p>
                      ))}
                      {it.notes && <p className="pl-4 text-[11px] text-amber-300 italic">Obs: {it.notes}</p>}
                    </div>
                    <span className="font-bold text-zinc-300 whitespace-nowrap">{formatCentsToBRL(it.line_total_cents)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
              <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{formatCentsToBRL(order.subtotal_cents)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>Taxa de entrega</span><span>{formatCentsToBRL(order.delivery_fee_cents)}</span></div>
              {order.discount_cents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Desconto{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                  <span>-{formatCentsToBRL(order.discount_cents)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-amber-400 pt-1.5 border-t border-zinc-800">
                <span>Total</span>
                <span>{formatCentsToBRL(order.total_cents)}</span>
              </div>
              <p className="text-[11px] text-zinc-400 pt-1">
                {PAYMENT_METHOD_LABEL[order.payment_method]} · <span className="text-emerald-400">{PAYMENT_STATUS_LABEL[order.payment_status]}</span>
                {order.cash_change_for_cents ? ` · troco para ${formatCentsToBRL(order.cash_change_for_cents)}` : ''}
              </p>
              {order.assigned_courier_name && (
                <p className="text-[11px] text-zinc-300 flex items-center gap-1">
                  <Bike className="w-3.5 h-3.5 text-amber-400" /> {order.assigned_courier_name}
                  {order.assigned_courier_phone ? ` · ${order.assigned_courier_phone}` : ''}
                </p>
              )}
              {order.cancellation_reason && <p className="text-[11px] text-rose-300">Motivo do cancelamento: {order.cancellation_reason}</p>}
            </section>

            <AdminDeliveryCode order={order} />
          </div>

          {/* Coluna 2: linha do tempo, documentos, WhatsApp */}
          <div className="space-y-4">
            <section className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-3">
                <History className="w-4 h-4 text-amber-400" /> Linha do tempo
              </h4>
              {!ADMIN_DATA_AVAILABLE ? (
                <p className="text-zinc-500">Disponível com o banco de dados conectado.</p>
              ) : timelineError ? (
                <p className="text-rose-300">{timelineError}</p>
              ) : !timeline ? (
                <p className="text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>
              ) : (
                <ol className="relative border-l border-zinc-800 ml-1.5 space-y-3">
                  {timeline.map((t) => (
                    <li key={t.id} className="relative pl-4">
                      <span className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden />
                      <p className="font-bold text-white">
                        {formatTimeBR(t.created_at)} · {STATUS_LABEL[t.new_status]}
                      </p>
                      <p className="text-zinc-400">
                        {t.actor_name ?? ACTOR_LABEL[t.actor_type] ?? t.actor_type}
                        {t.actor_name ? ` (${ACTOR_LABEL[t.actor_type] ?? t.actor_type})` : ''}
                        {t.reason ? ` — ${t.reason}` : ''}
                      </p>
                      <p className="text-[10px] text-zinc-500">{formatDateTimeBR(t.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-amber-400" /> Imprimir / PDF
                </h4>
                <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5" role="group" aria-label="Papel">
                  {(['thermal80', 'a4'] as PaperFormat[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={format === f}
                      onClick={() => chooseFormat(f)}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${format === f ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400'}`}
                    >
                      {f === 'thermal80' ? 'Térmica 80mm' : 'A4'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className={docButton} onClick={() => printKitchenTicket(order, settings, format)}><ChefHat className="w-4 h-4" /> Comanda</button>
                <button className={docButton} onClick={() => printOrderReceipt(order, settings, format)}><Receipt className="w-4 h-4" /> Comprovante</button>
                {order.fulfillment_type === 'DELIVERY' && (
                  <button className={docButton} onClick={() => printDeliveryReceipt(order, settings, format)}><Bike className="w-4 h-4" /> Recibo de entrega</button>
                )}
                <button className={docButton} onClick={() => printPaymentReceipt(order, settings, format)}><CreditCard className="w-4 h-4" /> Pagamento</button>
              </div>
              <p className="text-[10px] text-zinc-500">Para PDF, escolha "Salvar como PDF" no destino da impressão. Pode reimprimir quantas vezes precisar.</p>
            </section>

            <section className="p-4 rounded-2xl bg-zinc-950 border border-emerald-900/50 text-xs space-y-2.5">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-emerald-400" /> Mensagem no WhatsApp
              </h4>
              <select
                value={kind}
                onChange={(e) => chooseKind(e.target.value as OrderMessageKind)}
                aria-label="Tipo de mensagem"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                {(Object.keys(MESSAGE_LABELS) as OrderMessageKind[]).map((k) => (
                  <option key={k} value={k}>{MESSAGE_LABELS[k]}</option>
                ))}
              </select>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                aria-label="Texto da mensagem"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={openWhatsApp}
                disabled={!phoneOk || !text.trim()}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" /> Abrir no WhatsApp
              </button>
              <p className="text-[10px] text-zinc-400 flex gap-1">
                <Info className="w-3.5 h-3.5 shrink-0" />
                {!phoneOk ? 'Telefone do cliente inválido para WhatsApp.' : waNote ?? 'Abre o WhatsApp com o texto pronto; o envio é feito por você (não há envio automático).'}
              </p>
            </section>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase cursor-pointer">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

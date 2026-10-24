import React, { useEffect, useState } from 'react';
import {
  X,
  CreditCard,
  QrCode,
  Banknote,
  Bike,
  Store,
  CheckCircle,
  Copy,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useCart } from '../cart/CartContext';
import { useAuth } from '../auth/AuthContext';
import { PaymentMethod, Order } from '../../types';
import { formatCentsToBRL, parseBRLToCents } from '../../lib/formatters/currency';
import { orderService } from '../../services/order.service';
import { paymentService } from '../../services/payment.service';
import { IS_DEMO_MODE, getOrderById, getStoreSettings, subscribeToRealtime } from '../../services/storage';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCompleted: (order: Order) => void;
}

const ALL_METHODS: PaymentMethod[] = ['PIX_ONLINE', 'CARD_ONLINE', 'CARD_ON_DELIVERY', 'CASH_ON_DELIVERY'];

const METHOD_LABELS: Record<PaymentMethod, { label: string; icon: React.ReactNode }> = {
  PIX_ONLINE: { label: 'PIX Instantâneo', icon: <QrCode className="w-5 h-5 text-amber-400" /> },
  CARD_ONLINE: { label: 'Cartão Online', icon: <CreditCard className="w-5 h-5 text-amber-400" /> },
  CARD_ON_DELIVERY: { label: 'Cartão na Entrega', icon: <CreditCard className="w-5 h-5 text-amber-400" /> },
  CASH_ON_DELIVERY: { label: 'Dinheiro', icon: <Banknote className="w-5 h-5 text-amber-400" /> },
};

interface PixData {
  copyPaste?: string;
  qrCodeDataUrl?: string;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose, onOrderCompleted }) => {
  const {
    items,
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    deliveryZoneFound,
    totalCents,
    fulfillmentType,
    setFulfillmentType,
    deliveryAddress,
    setDeliveryAddress,
    appliedCoupon,
    clearCart,
  } = useCart();
  const { user } = useAuth();

  const settings = getStoreSettings();
  const availableMethods = ALL_METHODS.filter(
    (m) => !settings.accepted_payment_methods || settings.accepted_payment_methods.includes(m)
  );

  // Form states (pré-preenchidos apenas com dados do próprio cliente logado)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  const [street, setStreet] = useState(deliveryAddress?.street || '');
  const [number, setNumber] = useState(deliveryAddress?.number || '');
  const [complement, setComplement] = useState(deliveryAddress?.complement || '');
  const [neighborhood, setNeighborhood] = useState(deliveryAddress?.neighborhood || '');
  const [postalCode, setPostalCode] = useState(deliveryAddress?.postal_code || '');
  const [reference, setReference] = useState(deliveryAddress?.reference || '');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(availableMethods[0] ?? 'CASH_ON_DELIVERY');
  const [cashChangeForStr, setCashChangeForStr] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Etapa de pagamento online (o pedido já existe e aguarda o gateway)
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [startingPayment, setStartingPayment] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setCustomerName((v) => v || user.full_name);
      setCustomerPhone((v) => v || user.phone);
    }
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!availableMethods.includes(paymentMethod) && availableMethods[0]) {
      setPaymentMethod(availableMethods[0]);
    }
  }, [availableMethods.join(',')]);

  // Aguarda a confirmação do pagamento (webhook → banco → Realtime/consulta)
  useEffect(() => {
    if (!createdOrder) return;
    const check = () => {
      const fresh = getOrderById(createdOrder.id);
      if (fresh && fresh.payment_status === 'PAGO') {
        finish(fresh);
      }
    };
    check();
    return subscribeToRealtime(check);
  }, [createdOrder?.id]);

  // Neighborhood digitado atualiza a prévia de taxa do carrinho
  useEffect(() => {
    if (fulfillmentType !== 'DELIVERY') return;
    setDeliveryAddress(
      neighborhood.trim()
        ? {
            recipient_name: customerName,
            recipient_phone: customerPhone,
            postal_code: postalCode,
            street,
            number,
            complement,
            neighborhood,
            city: 'São Paulo',
            state: 'SP',
            reference,
          }
        : null
    );
  }, [neighborhood]);

  const resetPaymentStep = () => {
    setCreatedOrder(null);
    setPixData(null);
    setPaymentError(null);
  };

  const finish = (order: Order) => {
    resetPaymentStep();
    onOrderCompleted(order);
    onClose();
  };

  const startOnlinePayment = async (order: Order) => {
    if (IS_DEMO_MODE) return; // tela de simulação
    setStartingPayment(true);
    setPaymentError(null);
    const res = await paymentService.startOnlinePayment(order);
    setStartingPayment(false);

    if (!res.success) {
      setPaymentError(res.error || 'Não foi possível iniciar o pagamento.');
      return;
    }
    if (res.alreadyPaid) {
      finish(order);
      return;
    }
    if (res.checkoutUrl) {
      // Checkout Pro do Mercado Pago: dados do cartão são digitados no ambiente do gateway
      window.location.href = res.checkoutUrl;
      return;
    }
    setPixData({ copyPaste: res.pixCopyPaste, qrCodeDataUrl: res.pixQrCodeDataUrl });
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMessage('Por favor, informe seu nome e telefone/WhatsApp.');
      return;
    }

    if (fulfillmentType === 'DELIVERY' && (!street.trim() || !number.trim() || !neighborhood.trim())) {
      setErrorMessage('Por favor, preencha rua, número e bairro para a entrega.');
      return;
    }

    setIsSubmitting(true);

    try {
      const addressSnapshot =
        fulfillmentType === 'DELIVERY'
          ? {
              recipient_name: customerName.trim(),
              recipient_phone: customerPhone.trim(),
              postal_code: postalCode.trim(),
              street: street.trim(),
              number: number.trim(),
              complement: complement.trim() || undefined,
              neighborhood: neighborhood.trim(),
              city: 'São Paulo',
              state: 'SP',
              reference: reference.trim() || undefined,
            }
          : undefined;

      if (addressSnapshot) setDeliveryAddress(addressSnapshot);

      const res = await orderService.createOrder({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_id: user?.id,
        fulfillment_type: fulfillmentType,
        delivery_address: addressSnapshot,
        items,
        customer_notes: customerNotes.trim() || undefined,
        payment_method: paymentMethod,
        coupon_code: appliedCoupon || undefined,
        cash_change_for_cents:
          paymentMethod === 'CASH_ON_DELIVERY' && cashChangeForStr ? parseBRLToCents(cashChangeForStr) : undefined,
      });

      if (!res.success || !res.order) {
        setErrorMessage(res.error || 'Erro ao processar o pedido. Tente novamente.');
        return;
      }

      clearCart();

      if (paymentMethod === 'PIX_ONLINE' || paymentMethod === 'CARD_ONLINE') {
        setCreatedOrder(res.order);
        await startOnlinePayment(res.order);
        return;
      }

      finish(res.order);
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha na conexão com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulateDemoPayment = () => {
    if (!createdOrder) return;
    paymentService.simulateDemoApproval(createdOrder.id);
  };

  const handleCopyPix = () => {
    if (pixData?.copyPaste) {
      navigator.clipboard.writeText(pixData.copyPaste);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2000);
    }
  };

  const handleClose = () => {
    // Pedido online pendente continua acessível pelo acompanhamento
    if (createdOrder) {
      const order = createdOrder;
      resetPaymentStep();
      onOrderCompleted(order);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#12141d] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-8 text-white">
        {/* Header */}
        <div className="p-6 bg-[#0e1017] border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white">
              {createdOrder ? 'PAGAMENTO DO PEDIDO' : 'FINALIZAR PEDIDO'}
            </h2>
            <p className="text-xs text-zinc-400">
              {createdOrder
                ? `${createdOrder.order_number} • Total: ${formatCentsToBRL(createdOrder.total_cents)}`
                : `${items.length} itens • Total estimado: ${formatCentsToBRL(totalCents)}`}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdOrder ? (
          /* Etapa de pagamento online */
          <div className="p-6 sm:p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              {createdOrder.payment_method === 'PIX_ONLINE' ? <QrCode className="w-8 h-8" /> : <CreditCard className="w-8 h-8" />}
            </div>

            <div className="space-y-1">
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                PEDIDO GERADO • {createdOrder.order_number}
              </span>
              <h3 className="text-2xl font-black text-white font-['Bebas_Neue',sans-serif]">
                {createdOrder.payment_method === 'PIX_ONLINE' ? 'PAGUE COM PIX PARA CONFIRMAR' : 'PAGAMENTO COM CARTÃO'}
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                O pedido só segue para a cozinha depois que o pagamento for aprovado. Esta tela atualiza sozinha.
              </p>
            </div>

            {IS_DEMO_MODE ? (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-3">
                <p>
                  <strong>Modo demonstração:</strong> nenhum pagamento real é gerado. Use o botão abaixo para simular a
                  aprovação do gateway.
                </p>
                <button
                  type="button"
                  onClick={handleSimulateDemoPayment}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wide transition cursor-pointer"
                >
                  Simular pagamento aprovado
                </button>
              </div>
            ) : startingPayment ? (
              <div className="flex items-center justify-center space-x-2 text-xs text-zinc-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Gerando cobrança segura no Mercado Pago...</span>
              </div>
            ) : paymentError ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => startOnlinePayment(createdOrder)}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            ) : pixData ? (
              <>
                {pixData.qrCodeDataUrl && (
                  <div className="p-4 bg-white rounded-2xl w-fit mx-auto shadow-2xl">
                    <img src={pixData.qrCodeDataUrl} alt="QR Code Pix" className="w-52 h-52 object-contain" />
                  </div>
                )}

                <div className="flex items-center justify-center space-x-6 text-xs text-zinc-300">
                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Expira em 15 minutos</span>
                  </div>
                  <div className="font-bold text-amber-400 text-sm">
                    Valor: {formatCentsToBRL(createdOrder.total_cents)}
                  </div>
                </div>

                {pixData.copyPaste && (
                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-xs text-zinc-300 font-mono transition cursor-pointer"
                  >
                    <span>{copiedPix ? 'CÓDIGO PIX COPIADO!' : 'COPIAR CÓDIGO PIX COPIA E COLA'}</span>
                    {copiedPix ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}

                <div className="flex items-center justify-center space-x-2 text-xs text-zinc-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Aguardando confirmação do banco...</span>
                </div>
              </>
            ) : null}

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs uppercase tracking-wide transition cursor-pointer"
            >
              Acompanhar pedido
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateOrder} className="p-6 sm:p-8 space-y-6">
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 1. Fulfillment Type */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">1. Tipo de Atendimento</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!settings.delivery_enabled}
                  onClick={() => setFulfillmentType('DELIVERY')}
                  className={`flex items-center justify-center space-x-2 py-3 rounded-2xl font-bold text-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    fulfillmentType === 'DELIVERY'
                      ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                      : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  <span>Entrega (Delivery)</span>
                </button>

                <button
                  type="button"
                  disabled={!settings.pickup_enabled}
                  onClick={() => setFulfillmentType('PICKUP')}
                  className={`flex items-center justify-center space-x-2 py-3 rounded-2xl font-bold text-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    fulfillmentType === 'PICKUP'
                      ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                      : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <span>Retirada no Balcão</span>
                </button>
              </div>
            </div>

            {/* 2. Customer Info */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">2. Seus Dados de Contato</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  maxLength={120}
                  autoComplete="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Seu Nome Completo"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="tel"
                  required
                  maxLength={30}
                  autoComplete="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="WhatsApp / Telefone (com DDD)"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* 3. Address (If Delivery) */}
            {fulfillmentType === 'DELIVERY' && (
              <div className="space-y-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-amber-400">3. Endereço de Entrega</label>
                  <span className="text-[11px] text-zinc-400">
                    {neighborhood.trim()
                      ? deliveryZoneFound
                        ? `Taxa: ${formatCentsToBRL(deliveryFeeCents)}`
                        : 'Bairro fora da área de entrega'
                      : 'Informe o bairro para calcular a taxa'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      required
                      autoComplete="address-line1"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Rua / Avenida"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Número"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder="Bairro"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Complemento / Ap"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    autoComplete="postal-code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="CEP"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ponto de Referência (ex: em frente à farmácia)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* 4. Payment Method Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">4. Forma de Pagamento</label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {availableMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`p-3 rounded-2xl border flex flex-col items-center justify-center space-y-1.5 transition cursor-pointer ${
                      paymentMethod === method
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    {METHOD_LABELS[method].icon}
                    <span className="text-xs font-bold">{METHOD_LABELS[method].label}</span>
                  </button>
                ))}
              </div>

              {paymentMethod === 'CASH_ON_DELIVERY' && (
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800">
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Precisa de troco para quanto? (Deixe em branco se não precisar)
                  </label>
                  <input
                    type="text"
                    value={cashChangeForStr}
                    onChange={(e) => setCashChangeForStr(e.target.value)}
                    placeholder="Ex: R$ 100,00"
                    className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              )}

              {(paymentMethod === 'CARD_ONLINE' || paymentMethod === 'PIX_ONLINE') && (
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {paymentMethod === 'CARD_ONLINE'
                      ? 'Você será levado ao ambiente seguro do Mercado Pago para digitar os dados do cartão.'
                      : 'O QR Code PIX é gerado pelo Mercado Pago após o envio do pedido.'}
                  </span>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Observações Adicionais
              </label>
              <textarea
                value={customerNotes}
                maxLength={500}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Ex: Não tocar campainha, ligar quando chegar..."
                rows={2}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            {/* Total breakdown */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1.5 text-xs text-zinc-300">
              <div className="flex justify-between">
                <span>Subtotal dos itens</span>
                <span>{formatCentsToBRL(subtotalCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Desconto ({appliedCoupon})</span>
                  <span>- {formatCentsToBRL(discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Taxa de Entrega</span>
                <span>{fulfillmentType === 'PICKUP' ? 'Grátis' : formatCentsToBRL(deliveryFeeCents)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-zinc-800">
                <span>Total a pagar</span>
                <span className="text-amber-400 font-['Bebas_Neue',sans-serif] text-xl">{formatCentsToBRL(totalCents)}</span>
              </div>
              <p className="text-[10px] text-zinc-500 pt-1">
                Valores, cupom e taxa são conferidos pela loja ao enviar o pedido.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || items.length === 0 || availableMethods.length === 0}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-red-600/30 transition transform active:scale-98 cursor-pointer flex items-center justify-center space-x-2"
            >
              <span>{isSubmitting ? 'Processando Pedido...' : 'Confirmar e Enviar Pedido'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

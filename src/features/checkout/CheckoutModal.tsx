import React, { useState } from 'react';
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
} from 'lucide-react';
import { useCart } from '../cart/CartContext';
import { PaymentMethod, Order } from '../../types';
import { formatCentsToBRL, parseBRLToCents } from '../../lib/formatters/currency';
import { orderService } from '../../services/order.service';
import { paymentService } from '../../services/payment.service';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCompleted: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  onOrderCompleted,
}) => {
  const {
    items,
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    totalCents,
    fulfillmentType,
    setFulfillmentType,
    deliveryAddress,
    setDeliveryAddress,
    appliedCoupon,
    clearCart,
  } = useCart();

  // Form states
  const [customerName, setCustomerName] = useState('Lucas Ferreira');
  const [customerPhone, setCustomerPhone] = useState('(11) 99876-5432');
  const [customerNotes, setCustomerNotes] = useState('');

  // Address fields
  const [street, setStreet] = useState(deliveryAddress?.street || 'Av. Paulista');
  const [number, setNumber] = useState(deliveryAddress?.number || '1200');
  const [complement, setComplement] = useState(deliveryAddress?.complement || 'Apt 142');
  const [neighborhood, setNeighborhood] = useState(deliveryAddress?.neighborhood || 'Bela Vista');
  const [postalCode, setPostalCode] = useState(deliveryAddress?.postal_code || '01311-000');
  const [reference, setReference] = useState(deliveryAddress?.reference || 'Próximo ao MASP');

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX_ONLINE');
  const [cashChangeForStr, setCashChangeForStr] = useState('');
  const [cardBrand, setCardBrand] = useState('Mastercard');
  const [cardNumber, setCardNumber] = useState('**** **** **** 8842');
  const [cardHolder, setCardHolder] = useState('LUCAS FERREIRA');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvv, setCardCvv] = useState('321');

  // Loading & PIX step
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{
    qrCodeUrl: string;
    copyPasteCode: string;
    expiresAt: string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  if (!isOpen) return null;

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMessage('Por favor, informe seu nome e telefone/WhatsApp.');
      return;
    }

    if (fulfillmentType === 'DELIVERY') {
      if (!street.trim() || !number.trim() || !neighborhood.trim()) {
        setErrorMessage('Por favor, preencha rua, número e bairro para a entrega.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const addressSnapshot =
        fulfillmentType === 'DELIVERY'
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
          : undefined;

      if (addressSnapshot) {
        setDeliveryAddress(addressSnapshot);
      }

      const res = await orderService.createOrder({
        customer_name: customerName,
        customer_phone: customerPhone,
        fulfillment_type: fulfillmentType,
        delivery_address: addressSnapshot,
        items,
        customer_notes: customerNotes,
        payment_method: paymentMethod,
        coupon_code: appliedCoupon || undefined,
        cash_change_for_cents:
          paymentMethod === 'CASH_ON_DELIVERY' && cashChangeForStr
            ? parseBRLToCents(cashChangeForStr)
            : undefined,
      });

      if (!res.success || !res.order) {
        setErrorMessage(res.error || 'Erro ao processar o pedido. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      // Se for Pix Online, geramos os dados e mantemos na tela para pagamento
      if (paymentMethod === 'PIX_ONLINE') {
        const pix = paymentService.generatePixCharge(res.order.order_number, res.order.total_cents);
        setPixData(pix);
        setCreatedOrder(res.order);
        setIsSubmitting(false);
        clearCart();
        return;
      }

      // Cartão online ou na entrega: finaliza com sucesso
      clearCart();
      setIsSubmitting(false);
      onOrderCompleted(res.order);
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha na conexão com o servidor.');
      setIsSubmitting(false);
    }
  };

  const handleConfirmPixPayment = () => {
    if (createdOrder) {
      onOrderCompleted(createdOrder);
      onClose();
    }
  };

  const handleCopyPix = () => {
    if (pixData) {
      navigator.clipboard.writeText(pixData.copyPasteCode);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#12141d] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-8 text-white">
        {/* Header */}
        <div className="p-6 bg-[#0e1017] border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white">
              FINALIZAR PEDIDO
            </h2>
            <p className="text-xs text-zinc-400">
              {items.length} itens • Total: {formatCentsToBRL(totalCents)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PIX Payment Modal Screen */}
        {pixData && createdOrder ? (
          <div className="p-6 sm:p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <QrCode className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                PEDIDO GERADO • {createdOrder.order_number}
              </span>
              <h3 className="text-2xl font-black text-white font-['Bebas_Neue',sans-serif]">
                PAGUE COM PIX PARA CONFIRMAÇÃO IMEDIATA
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Escaneie o QR Code abaixo com seu aplicativo bancário ou copie o código Pix Copia e Cola.
              </p>
            </div>

            {/* QR Code Container */}
            <div className="p-4 bg-white rounded-2xl w-fit mx-auto shadow-2xl">
              <img
                src={pixData.qrCodeUrl}
                alt="QR Code Pix"
                className="w-52 h-52 object-contain"
              />
            </div>

            {/* Total and Expire timer */}
            <div className="flex items-center justify-center space-x-6 text-xs text-zinc-300">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Expira em 15 minutos</span>
              </div>
              <div className="font-bold text-amber-400 text-sm">
                Valor: {formatCentsToBRL(createdOrder.total_cents)}
              </div>
            </div>

            {/* Copy & Paste Code */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCopyPix}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-xs text-zinc-300 font-mono transition cursor-pointer"
              >
                <span>{copiedPix ? 'CÓDIGO PIX COPIADO!' : 'COPIAR CHAVE PIX COPIA E COLA'}</span>
                {copiedPix ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Confirmation CTA */}
            <button
              onClick={handleConfirmPixPayment}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black text-sm uppercase tracking-wide shadow-xl shadow-emerald-600/30 transition transform active:scale-98 cursor-pointer"
            >
              Já realizei o pagamento → Acompanhar Pedido
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
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                1. Tipo de Atendimento
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFulfillmentType('DELIVERY')}
                  className={`flex items-center justify-center space-x-2 py-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
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
                  onClick={() => setFulfillmentType('PICKUP')}
                  className={`flex items-center justify-center space-x-2 py-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
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
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                2. Seus Dados de Contato
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Seu Nome Completo"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="WhatsApp / Telefone (com DDD)"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* 3. Address (If Delivery) */}
            {fulfillmentType === 'DELIVERY' && (
              <div className="space-y-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    3. Endereço de Entrega
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    Taxa: {formatCentsToBRL(deliveryFeeCents)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      required
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Rua / Avenida"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      required
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="Número"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <input
                      type="text"
                      required
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Bairro"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Complemento / Ap"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="CEP"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ponto de Referência (ex: em frente à farmácia)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* 4. Payment Method Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                4. Forma de Pagamento
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('PIX_ONLINE')}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center space-y-1.5 transition cursor-pointer ${
                    paymentMethod === 'PIX_ONLINE'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                  }`}
                >
                  <QrCode className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-bold">PIX Instantâneo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CARD_ONLINE')}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center space-y-1.5 transition cursor-pointer ${
                    paymentMethod === 'CARD_ONLINE'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-bold">Cartão Online</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CARD_ON_DELIVERY')}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center space-y-1.5 transition cursor-pointer ${
                    paymentMethod === 'CARD_ON_DELIVERY'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-bold">Cartão na Entrega</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH_ON_DELIVERY')}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center space-y-1.5 transition cursor-pointer ${
                    paymentMethod === 'CASH_ON_DELIVERY'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                  }`}
                >
                  <Banknote className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-bold">Dinheiro</span>
                </button>
              </div>

              {/* Extra payment options: Cash change or Card details */}
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

              {paymentMethod === 'CARD_ONLINE' && (
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="flex items-center space-x-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Transação Criptografada SSL</span>
                    </span>
                    <span className="font-bold text-amber-400">{cardBrand}</span>
                  </div>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="Número do Cartão"
                    className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      placeholder="Nome no Cartão"
                      className="bg-zinc-950 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-white uppercase"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/AA"
                        className="bg-zinc-950 border border-zinc-750 rounded-lg px-2 py-2 text-xs text-white text-center"
                      />
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        placeholder="CVV"
                        className="bg-zinc-950 border border-zinc-750 rounded-lg px-2 py-2 text-xs text-white text-center"
                      />
                    </div>
                  </div>
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
                  <span>Desconto aplicado ({appliedCoupon})</span>
                  <span>- {formatCentsToBRL(discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Taxa de Entrega</span>
                <span>
                  {fulfillmentType === 'PICKUP' ? 'Grátis' : formatCentsToBRL(deliveryFeeCents)}
                </span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-zinc-800">
                <span>Total a pagar</span>
                <span className="text-amber-400 font-['Bebas_Neue',sans-serif] text-xl">
                  {formatCentsToBRL(totalCents)}
                </span>
              </div>
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isSubmitting || items.length === 0}
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

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Copy, CreditCard, QrCode, RefreshCw } from 'lucide-react';
import type { Order } from '../../types';
import { formatCentsToBRL } from '../../lib/formatters/currency';
import { isPresentationPayment, paymentService } from '../../services/payment.service';
import { isOnlinePayment } from '../../services/orderStateMachine';
import { IS_DEMO_MODE } from '../../services/storage';

/** O cliente fechou a tela de pagamento sem pagar: retoma o Pix/cartão pelo acompanhamento do pedido. */
export const PendingPaymentCard: React.FC<{ order: Order }> = ({ order }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<{ copyPaste?: string; qr?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const pending =
    isOnlinePayment(order) &&
    order.status === 'AGUARDANDO_CONFIRMACAO' &&
    ['PENDENTE', 'EM_PROCESSAMENTO', 'RECUSADO'].includes(order.payment_status);
  if (!pending) return null;

  const presentation = isPresentationPayment();
  const isPix = order.payment_method === 'PIX_ONLINE';

  const pay = async () => {
    setBusy(true);
    setError(null);
    if (presentation) {
      const res = await paymentService.simulateDemoApproval(order);
      setBusy(false);
      if (!res.success) setError(res.error || 'Não foi possível aprovar o pagamento.');
      return;
    }
    const res = await paymentService.startOnlinePayment(order);
    setBusy(false);
    if (!res.success) {
      setError(res.error || 'Não foi possível iniciar o pagamento.');
      return;
    }
    if (res.checkoutUrl) {
      window.location.href = res.checkoutUrl;
      return;
    }
    setPix({ copyPaste: res.pixCopyPaste, qr: res.pixQrCodeDataUrl });
  };

  const copy = () => {
    if (!pix?.copyPaste) return;
    navigator.clipboard.writeText(pix.copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-3 text-center">
      <p className="text-sm font-bold text-amber-200 flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        {order.payment_status === 'RECUSADO' ? 'Pagamento recusado' : 'Falta pagar o pedido'}
      </p>
      <p className="text-xs text-zinc-300">
        A cozinha só começa depois da aprovação do pagamento de {formatCentsToBRL(order.total_cents)}.
        {presentation && ` ${IS_DEMO_MODE ? 'Modo demonstração' : 'Modo apresentação'}: nenhum valor é cobrado.`}
      </p>

      {pix ? (
        <div className="space-y-3">
          {pix.qr && (
            <div className="p-3 bg-white rounded-2xl w-fit mx-auto">
              <img src={pix.qr} alt="QR Code Pix" className="w-44 h-44 object-contain" />
            </div>
          )}
          {pix.copyPaste && (
            <button
              type="button"
              onClick={copy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-xs text-zinc-200 font-mono cursor-pointer"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'CÓDIGO PIX COPIADO!' : 'COPIAR CÓDIGO PIX'}
            </button>
          )}
          <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Aguardando confirmação do banco…
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={pay}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
        >
          {isPix ? <QrCode className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
          {busy ? 'Aguarde…' : presentation ? 'Simular pagamento aprovado' : isPix ? 'Pagar agora com Pix' : 'Pagar agora com cartão'}
        </button>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
};

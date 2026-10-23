import { PaymentMethod, PaymentRecord } from '../types';

export const paymentService = {
  /**
   * Gera dados de cobrança Pix reais/emulados com chave copia-e-cola e QR code.
   */
  generatePixCharge(orderNumber: string, amountCents: number): {
    qrCodeUrl: string;
    copyPasteCode: string;
    expiresAt: string;
  } {
    const formattedVal = (amountCents / 100).toFixed(2);
    // Código EMV padrão Pix
    const copyPasteCode = `00020126580014br.gov.bcb.pix0136burgerhub-${orderNumber.replace('#', '')}-pix-pagamento520400005303986540${formattedVal}5802BR5910BURGER HUB6009SAO PAULO62070503***6304ABCD`;
    // URL do QR Code gerado via serviço público seguro de QR code
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(copyPasteCode)}`;
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();

    return { qrCodeUrl, copyPasteCode, expiresAt };
  },

  /**
   * Cria registro de pagamento correspondente
   */
  createPaymentRecord(orderId: string, method: PaymentMethod, amountCents: number, cashChangeForCents?: number): PaymentRecord {
    const isOnline = method === 'PIX_ONLINE' || method === 'CARD_ONLINE';
    return {
      id: `pay-${Date.now()}`,
      order_id: orderId,
      provider: isOnline ? 'MERCADOPAGO' : 'MANUAL',
      provider_payment_id: isOnline ? `mp_${Date.now()}` : undefined,
      method,
      status: isOnline ? 'PAGO' : 'PAGAMENTO_NA_ENTREGA',
      amount_cents: amountCents,
      cash_change_for_cents: cashChangeForCents,
      created_at: new Date().toISOString(),
      confirmed_at: isOnline ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    };
  },
};

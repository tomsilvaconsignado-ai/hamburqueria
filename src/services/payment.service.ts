import { supabase } from '../lib/supabase/client';
import { IS_DEMO_MODE, simulateDemoPaymentApproval } from './storage';
import { getGuestTokenForOrder } from './remote';
import { Order } from '../types';

export interface OnlinePaymentResult {
  success: boolean;
  error?: string;
  /** PIX: código copia-e-cola e imagem do QR Code gerados pelo Mercado Pago */
  pixCopyPaste?: string;
  pixQrCodeDataUrl?: string;
  expiresAt?: string;
  /** Cartão: URL do Checkout Pro do Mercado Pago (os dados do cartão nunca passam pelo app) */
  checkoutUrl?: string;
  alreadyPaid?: boolean;
}

export const paymentService = {
  /**
   * Inicia a cobrança online do pedido pela Edge Function `create-payment`.
   * O valor é lido do banco pelo servidor; o navegador só informa o pedido.
   */
  async startOnlinePayment(order: Order): Promise<OnlinePaymentResult> {
    if (IS_DEMO_MODE || !supabase) {
      return { success: false, error: 'Pagamento online indisponível no modo demonstração.' };
    }

    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: {
        order_id: order.id,
        guest_token: order.guest_access_token ?? getGuestTokenForOrder(order.id),
      },
    });

    if (error) {
      let message = 'Não foi possível iniciar o pagamento online.';
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        // mantém mensagem padrão
      }
      return { success: false, error: message };
    }

    if (data?.status === 'PAGO') return { success: true, alreadyPaid: true };
    if (data?.method === 'CARD_ONLINE') return { success: true, checkoutUrl: data.checkout_url };
    return {
      success: true,
      pixCopyPaste: data?.pix_copy_paste,
      pixQrCodeDataUrl: data?.pix_qr_code_base64 ? `data:image/png;base64,${data.pix_qr_code_base64}` : undefined,
      expiresAt: data?.expires_at,
    };
  },

  /** Somente modo demonstração: simula a confirmação do gateway. */
  simulateDemoApproval(orderId: string) {
    return simulateDemoPaymentApproval(orderId);
  },
};

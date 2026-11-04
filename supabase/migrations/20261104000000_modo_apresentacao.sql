-- ==============================================================================
-- BURGER HUB - MODO APRESENTAÇÃO (PAGAMENTO SIMULADO)
-- Enquanto a loja não tem o Mercado Pago configurado, o admin pode ligar este modo
-- para demonstrar o app: Pix e cartão online são "aprovados" por um botão, sem
-- cobrança real. Desligado (padrão), a aprovação simulada é recusada pelo servidor.
-- Só acrescenta; idempotente.
-- ==============================================================================

ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS payment_demo_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- Aprova o pagamento online de um pedido sem gateway (somente com o modo ligado).
-- Pode ser chamada por quem enxerga o pedido: cliente logado, link do convidado ou equipe.
CREATE OR REPLACE FUNCTION public.demo_approve_payment(p_order_id UUID, p_guest_token TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT COALESCE((SELECT payment_demo_mode FROM public.store_settings LIMIT 1), FALSE) THEN
    RAISE EXCEPTION 'O modo apresentação está desligado: o pagamento precisa ser feito pelo Mercado Pago.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    public.can_read_order(p_order_id)
    OR (p_guest_token IS NOT NULL AND length(p_guest_token) >= 20
        AND v_order.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex'))
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_order.payment_method NOT IN ('PIX_ONLINE', 'CARD_ONLINE') THEN
    RAISE EXCEPTION 'Este pedido é pago na entrega.';
  END IF;
  IF v_order.payment_status = 'PAGO' THEN
    RETURN jsonb_build_object('success', TRUE, 'already_paid', TRUE);
  END IF;
  IF v_order.status = 'CANCELADO' OR v_order.payment_status NOT IN ('PENDENTE', 'EM_PROCESSAMENTO', 'RECUSADO') THEN
    RAISE EXCEPTION 'Este pedido não aguarda pagamento.';
  END IF;

  UPDATE public.payments
  SET status = 'PAGO', provider = 'MANUAL', external_reference = 'APRESENTACAO',
      confirmed_at = NOW(), updated_at = NOW()
  WHERE order_id = p_order_id;
  UPDATE public.orders SET payment_status = 'PAGO' WHERE id = p_order_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'DEMO_PAYMENT_APPROVED', 'orders', p_order_id::text,
          jsonb_build_object('order_number', v_order.order_number, 'total_cents', v_order.total_cents,
                             'note', 'Pagamento simulado (modo apresentação): nenhum valor foi cobrado'));

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.demo_approve_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demo_approve_payment(UUID, TEXT) TO anon, authenticated;

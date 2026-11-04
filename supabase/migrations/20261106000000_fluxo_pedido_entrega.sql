-- ==============================================================================
-- BURGER HUB - FLUXO PEDIDO → ENTREGA (revisão)
-- 1. A entrega (tabela deliveries) e o contador do entregador acompanham o pedido por
--    qualquer caminho: botão do entregador, do admin ou da cozinha.
-- 2. Pedido pago na entrega/balcão que é concluído fica como recebido.
-- 3. Não atribui entregador a pedido com pagamento online ainda não aprovado.
-- 4. Avisos push: pedido pronto (entregador / admin sem entregador), cancelamento e
--    troca de entregador.
-- Só acrescenta/redefine funções; idempotente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PAGAMENTO NA ENTREGA/BALCÃO: concluir = recebido
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_payment_on_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'CONCLUIDO' AND OLD.status IS DISTINCT FROM 'CONCLUIDO'
     AND NEW.payment_status = 'PAGAMENTO_NA_ENTREGA' THEN
    NEW.payment_status := 'PAGO_NA_ENTREGA';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_payment_on_completion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_settle_payment_on_completion ON public.orders;
CREATE TRIGGER trg_settle_payment_on_completion
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.settle_payment_on_completion();

-- ------------------------------------------------------------------------------
-- 2. ENTREGA E PAGAMENTO ACOMPANHAM O STATUS DO PEDIDO (qualquer caminho)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_delivery_on_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_courier UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'EM_ENTREGA' THEN
    UPDATE public.deliveries
    SET status = 'EM_ROTA', picked_up_at = COALESCE(picked_up_at, NOW()),
        out_for_delivery_at = COALESCE(out_for_delivery_at, NOW()), updated_at = NOW()
    WHERE order_id = NEW.id AND status IN ('ATRIBUIDA', 'COLETADA');

  ELSIF NEW.status = 'CONCLUIDO' THEN
    -- Recebido na entrega/balcão: o registro do pagamento também
    IF NEW.payment_status = 'PAGO_NA_ENTREGA' AND OLD.payment_status = 'PAGAMENTO_NA_ENTREGA' THEN
      UPDATE public.payments
      SET status = 'PAGO_NA_ENTREGA', confirmed_at = COALESCE(confirmed_at, NOW()), updated_at = NOW()
      WHERE order_id = NEW.id AND status = 'PAGAMENTO_NA_ENTREGA';
    END IF;
    UPDATE public.deliveries
    SET status = 'ENTREGUE', delivered_at = COALESCE(delivered_at, NOW()),
        picked_up_at = COALESCE(picked_up_at, NOW()), out_for_delivery_at = COALESCE(out_for_delivery_at, NOW()),
        payment_collected = payment_collected OR OLD.payment_status = 'PAGAMENTO_NA_ENTREGA',
        updated_at = NOW()
    WHERE order_id = NEW.id AND status <> 'ENTREGUE'
    RETURNING courier_id INTO v_courier;
    -- Conta a entrega uma única vez, quando ela passa a ENTREGUE
    IF v_courier IS NOT NULL THEN
      UPDATE public.couriers
      SET total_deliveries_count = total_deliveries_count + 1,
          completed_deliveries_count = completed_deliveries_count + 1,
          updated_at = NOW()
      WHERE id = v_courier;
    END IF;

  ELSIF NEW.status = 'CANCELADO' THEN
    UPDATE public.deliveries
    SET status = 'CANCELADA', updated_at = NOW()
    WHERE order_id = NEW.id AND status NOT IN ('ENTREGUE', 'CANCELADA');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_delivery_on_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_delivery_on_status ON public.orders;
CREATE TRIGGER trg_sync_delivery_on_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_on_status();

-- Ação do entregador: só valida e muda o status; o resto é feito pelos triggers acima
-- (antes ela mesma atualizava entrega e contador, que agora ficariam em dobro).
CREATE OR REPLACE FUNCTION public.courier_update_delivery(
  p_order_id UUID,
  p_action TEXT,
  p_payment_collected BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_courier_id UUID := public.current_courier_id();
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_admin() AND (v_courier_id IS NULL OR v_order.assigned_courier_id IS DISTINCT FROM v_courier_id) THEN
    RAISE EXCEPTION 'Não autorizado: esta entrega não está atribuída a você.';
  END IF;

  IF p_action = 'PICKUP' THEN
    IF v_order.status <> 'PRONTO' THEN
      RAISE EXCEPTION 'O pedido ainda não está pronto para retirada na cozinha.';
    END IF;
    PERFORM set_config('burgerhub.status_reason', 'Pedido retirado pelo entregador', TRUE);
    UPDATE public.orders SET status = 'EM_ENTREGA' WHERE id = p_order_id;
  ELSIF p_action = 'DELIVERED' THEN
    IF v_order.status <> 'EM_ENTREGA' THEN
      RAISE EXCEPTION 'A entrega precisa estar em rota para ser concluída.';
    END IF;
    IF v_order.payment_status = 'PAGAMENTO_NA_ENTREGA' AND NOT COALESCE(p_payment_collected, FALSE) THEN
      RAISE EXCEPTION 'Confirme o recebimento do pagamento antes de concluir a entrega.';
    END IF;
    PERFORM set_config('burgerhub.status_reason', 'Entrega confirmada no destino', TRUE);
    UPDATE public.orders SET status = 'CONCLUIDO' WHERE id = p_order_id;
  ELSE
    RAISE EXCEPTION 'Ação de entrega inválida.';
  END IF;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.courier_update_delivery(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_update_delivery(UUID, TEXT, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. ATRIBUIÇÃO: não aceita pedido com pagamento online pendente
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_courier(p_order_id UUID, p_courier_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_courier public.couriers%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores atribuem entregadores.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF v_order.fulfillment_type <> 'DELIVERY' THEN
    RAISE EXCEPTION 'Este pedido é para retirada no balcão e não exige entregador.';
  END IF;
  IF v_order.status IN ('EM_ENTREGA', 'CONCLUIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é possível atribuir entregador a um pedido %.',
      CASE v_order.status WHEN 'EM_ENTREGA' THEN 'que já saiu para entrega'
                          WHEN 'CONCLUIDO' THEN 'concluído' ELSE 'cancelado' END;
  END IF;
  IF v_order.payment_method IN ('PIX_ONLINE', 'CARD_ONLINE') AND v_order.payment_status <> 'PAGO' THEN
    RAISE EXCEPTION 'Aguarde o pagamento online ser aprovado antes de chamar o entregador.';
  END IF;

  SELECT * INTO v_courier FROM public.couriers WHERE id = p_courier_id;
  IF NOT FOUND OR v_courier.status <> 'ATIVO' THEN
    RAISE EXCEPTION 'Entregador inválido, inativo ou bloqueado.';
  END IF;

  UPDATE public.orders
  SET assigned_courier_id = v_courier.id,
      assigned_courier_name = v_courier.full_name,
      assigned_courier_phone = v_courier.phone
  WHERE id = p_order_id;

  INSERT INTO public.deliveries (order_id, courier_id, status, assigned_by, assigned_at)
  VALUES (p_order_id, v_courier.id, 'ATRIBUIDA', auth.uid(), NOW())
  ON CONFLICT (order_id) DO UPDATE
  SET courier_id = EXCLUDED.courier_id, status = 'ATRIBUIDA', assigned_by = EXCLUDED.assigned_by,
      assigned_at = NOW(), updated_at = NOW();

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'ASSIGN_COURIER', 'deliveries', p_order_id::text,
          jsonb_build_object('courier', v_courier.full_name, 'courier_id', v_courier.id,
                             'previous_courier_id', v_order.assigned_courier_id));

  RETURN jsonb_build_object('success', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_assign_courier(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_courier(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. AVISOS PUSH DO FLUXO (substitui a função da migração 20261105000000)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.courier_user_id(p_courier_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT user_id FROM public.couriers WHERE id = p_courier_id $$;
REVOKE ALL ON FUNCTION public.courier_user_id(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.push_on_order_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_awaiting_online BOOLEAN;
  v_courier_user UUID;
  v_addr JSONB;
  v_where TEXT;
BEGIN
  v_awaiting_online := NEW.payment_method IN ('PIX_ONLINE', 'CARD_ONLINE') AND NEW.payment_status <> 'PAGO';
  v_addr := NEW.delivery_address_snapshot;
  v_where := COALESCE(NULLIF(concat_ws(' – ', NULLIF(concat_ws(', ', v_addr->>'street', v_addr->>'number'), ''), v_addr->>'neighborhood'), ''), NEW.customer_name);

  IF TG_OP = 'INSERT' THEN
    -- Admin: todo pedido novo
    PERFORM public.notify_push(public.staff_user_ids(ARRAY['ADMIN']),
      '🍔 Novo pedido ' || NEW.order_number, public.order_push_summary(NEW)
        || CASE WHEN v_awaiting_online THEN ' · aguardando pagamento' ELSE '' END,
      '/admin/pedidos', 'pedido-' || NEW.id, 'novo-pedido');
    -- Cozinha: só quando já pode preparar (pagamento na entrega ou já pago)
    IF NOT v_awaiting_online THEN
      PERFORM public.notify_push(public.staff_user_ids(ARRAY['KITCHEN']),
        '🍔 Novo pedido ' || NEW.order_number, public.order_push_summary(NEW), '/cozinha', 'pedido-' || NEW.id, 'novo-pedido');
    END IF;
    RETURN NEW;
  END IF;

  -- Pagamento online aprovado: a cozinha pode começar
  IF NEW.payment_status = 'PAGO' AND OLD.payment_status IS DISTINCT FROM 'PAGO'
     AND NEW.payment_method IN ('PIX_ONLINE', 'CARD_ONLINE') AND NEW.status <> 'CANCELADO' THEN
    PERFORM public.notify_push(public.staff_user_ids(ARRAY['KITCHEN']),
      '✅ Pagamento aprovado ' || NEW.order_number, public.order_push_summary(NEW), '/cozinha', 'pedido-' || NEW.id, 'novo-pedido');
  END IF;

  -- Entregador acionado (e o anterior, se houve troca)
  IF NEW.assigned_courier_id IS DISTINCT FROM OLD.assigned_courier_id THEN
    IF NEW.assigned_courier_id IS NOT NULL THEN
      v_courier_user := public.courier_user_id(NEW.assigned_courier_id);
      IF v_courier_user IS NOT NULL THEN
        PERFORM public.notify_push(ARRAY[v_courier_user],
          '🛵 Nova entrega ' || NEW.order_number,
          v_where
            || CASE WHEN NEW.status = 'PRONTO' THEN ' · já está pronto, pode retirar'
                    ELSE ' · aguarde: avisamos quando estiver pronto' END
            || CASE WHEN NEW.payment_status = 'PAGAMENTO_NA_ENTREGA'
                    THEN ' · cobrar R$ ' || replace(to_char(NEW.total_cents / 100.0, 'FM999990.00'), '.', ',') ELSE '' END,
          '/entregador', 'entrega-' || NEW.id, 'entregador-acionado');
      END IF;
    END IF;
    IF OLD.assigned_courier_id IS NOT NULL THEN
      v_courier_user := public.courier_user_id(OLD.assigned_courier_id);
      IF v_courier_user IS NOT NULL THEN
        PERFORM public.notify_push(ARRAY[v_courier_user],
          '↩️ Entrega ' || NEW.order_number || ' passada para outro entregador',
          'Não precisa mais buscar este pedido.', '/entregador', 'entrega-' || NEW.id, NULL);
      END IF;
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Pronto: chama o entregador para retirar (ou avisa o admin que falta entregador)
    IF NEW.status = 'PRONTO' AND NEW.fulfillment_type = 'DELIVERY' THEN
      IF NEW.assigned_courier_id IS NOT NULL THEN
        v_courier_user := public.courier_user_id(NEW.assigned_courier_id);
        IF v_courier_user IS NOT NULL THEN
          PERFORM public.notify_push(ARRAY[v_courier_user],
            '📦 Pedido ' || NEW.order_number || ' pronto para retirar', v_where,
            '/entregador', 'entrega-' || NEW.id, 'entregador-acionado');
        END IF;
      ELSE
        PERFORM public.notify_push(public.staff_user_ids(ARRAY['ADMIN']),
          '⚠️ Pedido ' || NEW.order_number || ' pronto sem entregador', 'Atribua um entregador para sair a entrega.',
          '/admin/pedidos', 'pedido-' || NEW.id, 'novo-pedido');
      END IF;
    END IF;

    -- Cancelado: avisa quem já estava trabalhando nele
    IF NEW.status = 'CANCELADO' THEN
      IF NEW.assigned_courier_id IS NOT NULL THEN
        v_courier_user := public.courier_user_id(NEW.assigned_courier_id);
        IF v_courier_user IS NOT NULL THEN
          PERFORM public.notify_push(ARRAY[v_courier_user],
            '❌ Entrega ' || NEW.order_number || ' cancelada',
            COALESCE(NULLIF(NEW.cancellation_reason, ''), 'Pedido cancelado') || CASE WHEN OLD.status = 'EM_ENTREGA'
              THEN ' · fale com a loja sobre o pedido em mãos' ELSE '' END,
            '/entregador', 'entrega-' || NEW.id, NULL);
        END IF;
      END IF;
      IF OLD.status IN ('CONFIRMADO', 'EM_PREPARACAO', 'PRONTO', 'AGUARDANDO_RETIRADA') THEN
        PERFORM public.notify_push(public.staff_user_ids(ARRAY['KITCHEN']),
          '❌ Pedido ' || NEW.order_number || ' cancelado',
          COALESCE(NULLIF(NEW.cancellation_reason, ''), 'Pedido cancelado'), '/cozinha', 'pedido-' || NEW.id, NULL);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.push_on_order_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_push_on_order_update ON public.orders;
CREATE TRIGGER trg_push_on_order_update
  AFTER UPDATE OF status, payment_status, assigned_courier_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.push_on_order_change();

-- ==============================================================================
-- BURGER HUB - SEGURANÇA NA ENTREGA E CUPONS
-- 1. Foto do entregador (o cliente vê quem vai trazer o pedido).
-- 2. Código de entrega de 4 dígitos: só o cliente vê; o entregador digita para concluir
--    ou libera sem código registrando uma observação. Opcional (por pedido ou automático).
-- 3. Cupons: validação no servidor antes do checkout, primeiro pedido pelo telefone
--    (qualquer formato) e pedido mínimo por cupom.
-- Só acrescenta/redefine funções; idempotente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FOTO DO ENTREGADOR
-- ------------------------------------------------------------------------------
-- Bucket público com nomes aleatórios: o cliente (inclusive convidado) abre a foto pelo link.
-- Não há política de listagem: ninguém consegue listar as fotos, só abrir pelo endereço.
INSERT INTO storage.buckets (id, name, public)
VALUES ('courier-photos', 'courier-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Admin envia fotos de entregadores" ON storage.objects;
CREATE POLICY "Admin envia fotos de entregadores"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'courier-photos' AND public.is_admin())
  WITH CHECK (bucket_id = 'courier-photos' AND public.is_admin());

-- Foto gravada no pedido na hora da atribuição (o cliente não lê a tabela de entregadores)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_courier_photo_url TEXT;

-- ------------------------------------------------------------------------------
-- 2. CÓDIGO DE ENTREGA
-- ------------------------------------------------------------------------------
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS delivery_code_auto BOOLEAN NOT NULL DEFAULT FALSE;
-- O entregador só sabe QUE existe código (para pedir ao cliente), nunca qual é
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_code_required BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.order_delivery_codes (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^\d{4}$'),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failed_attempts INT NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  override_note TEXT CHECK (override_note IS NULL OR length(override_note) <= 300),
  override_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.order_delivery_codes ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só as funções abaixo leem e gravam (o entregador nunca vê o código)
REVOKE ALL ON public.order_delivery_codes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.new_delivery_code()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = public, extensions
AS $$ SELECT lpad(((get_byte(b, 0) * 256 + get_byte(b, 1)) % 10000)::text, 4, '0') FROM (SELECT gen_random_bytes(2) AS b) r $$;

-- Automático: ao confirmar um pedido de entrega, se a loja ligou a opção
CREATE OR REPLACE FUNCTION public.auto_delivery_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'CONFIRMADO' AND OLD.status IS DISTINCT FROM 'CONFIRMADO'
     AND NEW.fulfillment_type = 'DELIVERY'
     AND COALESCE((SELECT delivery_code_auto FROM public.store_settings LIMIT 1), FALSE) THEN
    INSERT INTO public.order_delivery_codes (order_id, code, created_by)
    VALUES (NEW.id, public.new_delivery_code(), auth.uid())
    ON CONFLICT (order_id) DO NOTHING;
    NEW.delivery_code_required := TRUE;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_delivery_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auto_delivery_code ON public.orders;
CREATE TRIGGER trg_auto_delivery_code
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_delivery_code();

-- Admin gera (ou mostra o que já existe) para um pedido
CREATE OR REPLACE FUNCTION public.admin_delivery_code(p_order_id UUID, p_generate BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_code public.order_delivery_codes%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores.';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;

  SELECT * INTO v_code FROM public.order_delivery_codes WHERE order_id = p_order_id;
  IF NOT FOUND AND p_generate THEN
    IF v_order.fulfillment_type <> 'DELIVERY' THEN
      RAISE EXCEPTION 'Código de entrega é só para pedidos de entrega.';
    END IF;
    IF v_order.status IN ('CONCLUIDO', 'CANCELADO') THEN
      RAISE EXCEPTION 'Este pedido já foi encerrado.';
    END IF;
    INSERT INTO public.order_delivery_codes (order_id, code, created_by)
    VALUES (p_order_id, public.new_delivery_code(), auth.uid())
    RETURNING * INTO v_code;
    UPDATE public.orders SET delivery_code_required = TRUE WHERE id = p_order_id;
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'DELIVERY_CODE_CREATED', 'orders', p_order_id::text, jsonb_build_object('order_number', v_order.order_number));
  END IF;
  IF v_code.order_id IS NULL THEN
    RETURN jsonb_build_object('exists', FALSE);
  END IF;
  RETURN jsonb_build_object('exists', TRUE, 'code', v_code.code, 'verified_at', v_code.verified_at,
                            'override_note', v_code.override_note, 'failed_attempts', v_code.failed_attempts);
END;
$$;

-- Cliente (logado ou pelo link do convidado) vê o código do próprio pedido
CREATE OR REPLACE FUNCTION public.get_delivery_code(p_order_id UUID, p_guest_token TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_code public.order_delivery_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Dono do pedido (não a equipe: entregador e cozinha não podem ver)
  IF NOT (
    public.is_admin()
    OR (auth.uid() IS NOT NULL AND v_order.customer_id = auth.uid())
    OR (p_guest_token IS NOT NULL AND length(p_guest_token) >= 20
        AND v_order.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex'))
  ) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_code FROM public.order_delivery_codes WHERE order_id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('exists', FALSE); END IF;
  RETURN jsonb_build_object('exists', TRUE, 'code', v_code.code, 'used', v_code.verified_at IS NOT NULL OR v_code.override_note IS NOT NULL);
END;
$$;

-- Ação do entregador, agora com o código (ou a observação para liberar sem código).
-- Código errado não é exceção: devolve { success: false } para a tentativa ficar contada.
DROP FUNCTION IF EXISTS public.courier_update_delivery(UUID, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.courier_update_delivery(
  p_order_id UUID,
  p_action TEXT,
  p_payment_collected BOOLEAN DEFAULT FALSE,
  p_code TEXT DEFAULT NULL,
  p_override_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_courier_id UUID := public.current_courier_id();
  v_code public.order_delivery_codes%ROWTYPE;
  v_note TEXT := NULLIF(TRIM(p_override_note), '');
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
    RETURN jsonb_build_object('success', TRUE);
  END IF;

  IF p_action <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Ação de entrega inválida.';
  END IF;
  IF v_order.status <> 'EM_ENTREGA' THEN
    RAISE EXCEPTION 'A entrega precisa estar em rota para ser concluída.';
  END IF;
  IF v_order.payment_status = 'PAGAMENTO_NA_ENTREGA' AND NOT COALESCE(p_payment_collected, FALSE) THEN
    RAISE EXCEPTION 'Confirme o recebimento do pagamento antes de concluir a entrega.';
  END IF;

  SELECT * INTO v_code FROM public.order_delivery_codes WHERE order_id = p_order_id FOR UPDATE;
  IF FOUND THEN
    IF NULLIF(TRIM(p_code), '') IS NOT NULL THEN
      IF v_code.failed_attempts >= 5 THEN
        RETURN jsonb_build_object('success', FALSE, 'code_error', TRUE, 'locked', TRUE,
          'error', 'Muitas tentativas erradas. Libere sem código, escrevendo o que aconteceu.');
      END IF;
      IF TRIM(p_code) <> v_code.code THEN
        UPDATE public.order_delivery_codes SET failed_attempts = failed_attempts + 1 WHERE order_id = p_order_id;
        RETURN jsonb_build_object('success', FALSE, 'code_error', TRUE, 'locked', v_code.failed_attempts + 1 >= 5,
          'error', format('Código incorreto (tentativa %s de 5). Confira com o cliente.', v_code.failed_attempts + 1));
      END IF;
      UPDATE public.order_delivery_codes SET verified_at = NOW() WHERE order_id = p_order_id;
      PERFORM set_config('burgerhub.status_reason', 'Entrega confirmada com o código do cliente', TRUE);
    ELSIF v_note IS NOT NULL AND length(v_note) >= 5 THEN
      UPDATE public.order_delivery_codes
      SET override_note = LEFT(v_note, 300), override_by = auth.uid()
      WHERE order_id = p_order_id;
      UPDATE public.deliveries SET notes = LEFT('Liberado sem código: ' || v_note, 500), updated_at = NOW() WHERE order_id = p_order_id;
      INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
      VALUES (auth.uid(), 'DELIVERY_WITHOUT_CODE', 'orders', p_order_id::text,
              jsonb_build_object('order_number', v_order.order_number, 'note', LEFT(v_note, 300)));
      PERFORM set_config('burgerhub.status_reason', LEFT('Entregue sem código: ' || v_note, 300), TRUE);
    ELSE
      RETURN jsonb_build_object('success', FALSE, 'code_error', TRUE,
        'error', 'Este pedido tem código de entrega: digite o código do cliente ou escreva o motivo para liberar sem ele.');
    END IF;
  ELSE
    PERFORM set_config('burgerhub.status_reason', 'Entrega confirmada no destino', TRUE);
  END IF;

  UPDATE public.orders SET status = 'CONCLUIDO' WHERE id = p_order_id;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- Confere só o código (antes de receber o pagamento): conta as tentativas sem concluir a entrega
CREATE OR REPLACE FUNCTION public.courier_check_delivery_code(p_order_id UUID, p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_courier_id UUID := public.current_courier_id();
  v_code public.order_delivery_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_admin() AND (v_courier_id IS NULL OR v_order.assigned_courier_id IS DISTINCT FROM v_courier_id) THEN
    RAISE EXCEPTION 'Não autorizado: esta entrega não está atribuída a você.';
  END IF;
  SELECT * INTO v_code FROM public.order_delivery_codes WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', TRUE);
  END IF;
  IF v_code.failed_attempts >= 5 THEN
    RETURN jsonb_build_object('success', FALSE, 'code_error', TRUE, 'locked', TRUE,
      'error', 'Muitas tentativas erradas. Libere sem código, escrevendo o que aconteceu.');
  END IF;
  IF COALESCE(TRIM(p_code), '') <> v_code.code THEN
    UPDATE public.order_delivery_codes SET failed_attempts = failed_attempts + 1 WHERE order_id = p_order_id;
    RETURN jsonb_build_object('success', FALSE, 'code_error', TRUE, 'locked', v_code.failed_attempts + 1 >= 5,
      'error', format('Código incorreto (tentativa %s de 5). Confira com o cliente.', v_code.failed_attempts + 1));
  END IF;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.courier_check_delivery_code(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_check_delivery_code(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. ATRIBUIÇÃO: grava também a foto do entregador no pedido
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
      assigned_courier_phone = v_courier.phone,
      assigned_courier_photo_url = NULLIF(TRIM(v_courier.photo_url), '')
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

-- ------------------------------------------------------------------------------
-- 4. CUPONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_order_cents BIGINT CHECK (min_order_cents IS NULL OR min_order_cents >= 0);
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Validação antes do checkout (o pedido valida tudo de novo ao ser criado)
CREATE OR REPLACE FUNCTION public.validate_coupon(p_code TEXT, p_phone TEXT DEFAULT NULL, p_subtotal_cents BIGINT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code TEXT := NULLIF(UPPER(TRIM(p_code)), '');
  v_coupon public.coupons%ROWTYPE;
BEGIN
  IF v_code IS NULL OR length(v_code) > 40 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Digite o código do cupom.');
  END IF;
  SELECT * INTO v_coupon FROM public.coupons WHERE code = v_code;
  IF NOT FOUND OR NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Cupom não encontrado ou desativado.');
  END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Este cupom já expirou.');
  END IF;
  IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redemptions_count >= v_coupon.max_redemptions THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Este cupom já atingiu o limite de usos.');
  END IF;
  IF v_coupon.min_order_cents IS NOT NULL AND p_subtotal_cents IS NOT NULL AND p_subtotal_cents < v_coupon.min_order_cents THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Este cupom vale para pedidos a partir de R$ ' || replace(to_char(v_coupon.min_order_cents / 100.0, 'FM999990.00'), '.', ',') || '.');
  END IF;
  IF v_coupon.first_order_only AND (
    (public.phone_key(p_phone) IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o WHERE o.status <> 'CANCELADO' AND public.phone_key(o.customer_phone) = public.phone_key(p_phone)))
    OR (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.orders o WHERE o.status <> 'CANCELADO' AND o.customer_id = auth.uid()))
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'O cupom ' || v_code || ' vale só para o primeiro pedido, e este telefone já pediu antes.');
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'code', v_coupon.code, 'percent_off', v_coupon.percent_off,
                            'description', v_coupon.description, 'first_order_only', v_coupon.first_order_only,
                            'min_order_cents', v_coupon.min_order_cents, 'expires_at', v_coupon.expires_at);
END;
$$;

-- Regras do cupom que o cálculo original não cobria: primeiro pedido pelo telefone em
-- qualquer formato ("(11) 9..." = "119...") e pedido mínimo
CREATE OR REPLACE FUNCTION public.enforce_coupon_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
BEGIN
  IF NEW.coupon_code IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_coupon FROM public.coupons WHERE code = NEW.coupon_code;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF v_coupon.first_order_only AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.status <> 'CANCELADO' AND o.id <> NEW.id
      AND public.phone_key(o.customer_phone) = public.phone_key(NEW.customer_phone)
  ) THEN
    RAISE EXCEPTION 'O cupom % vale só para o primeiro pedido, e este telefone já pediu antes. Remova o cupom para continuar.', NEW.coupon_code;
  END IF;
  IF v_coupon.min_order_cents IS NOT NULL AND NEW.subtotal_cents < v_coupon.min_order_cents THEN
    RAISE EXCEPTION 'O cupom % vale para pedidos a partir de R$ %.', NEW.coupon_code,
      replace(to_char(v_coupon.min_order_cents / 100.0, 'FM999990.00'), '.', ',');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_coupon_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_coupon_rules ON public.orders;
CREATE TRIGGER trg_enforce_coupon_rules
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_coupon_rules();

-- Auditoria das mudanças em cupons feitas pelo admin (o uso em pedidos não entra aqui)
DROP TRIGGER IF EXISTS trg_audit_coupons ON public.coupons;
CREATE TRIGGER trg_audit_coupons
  AFTER INSERT OR DELETE OR UPDATE OF is_active, percent_off, expires_at, max_redemptions, first_order_only, min_order_cents, description
  ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('code');

-- ------------------------------------------------------------------------------
-- 5. PERMISSÕES
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.new_delivery_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delivery_code(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delivery_code(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.get_delivery_code(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_delivery_code(UUID, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.courier_update_delivery(UUID, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_update_delivery(UUID, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_assign_courier(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_courier(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.validate_coupon(TEXT, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, TEXT, BIGINT) TO anon, authenticated;

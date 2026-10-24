-- ==============================================================================
-- BURGER HUB - HARDENING DE SEGURANÇA E FLUXO TRANSACIONAL DE PEDIDOS
-- Migração: 20261024000000_security_hardening_and_order_rpcs.sql
--
-- Objetivos:
--   * Toda criação/alteração de pedido passa por funções SECURITY DEFINER que
--     recalculam preços, cupons e taxas no servidor (o navegador não é confiável).
--   * Máquina de estados do pedido aplicada no banco (trigger), válida para
--     qualquer caminho de escrita.
--   * Entregador só enxerga os pedidos atribuídos a ele; cozinha não altera
--     colunas financeiras.
--   * Token de acompanhamento de convidado armazenado apenas como hash.
--   * `couriers` passa a ser a única fonte de verdade de entregadores.
--   * Opcionais de produto ficam em `products.option_groups` (JSONB), que é o
--     formato editado pelo painel. As tabelas normalizadas nunca foram usadas.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES COM search_path FIXO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT public.get_current_user_role() = 'ADMIN'; $$;

CREATE OR REPLACE FUNCTION public.is_kitchen()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT public.get_current_user_role() IN ('ADMIN', 'KITCHEN'); $$;

CREATE OR REPLACE FUNCTION public.is_courier()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT public.get_current_user_role() IN ('ADMIN', 'DELIVERY'); $$;

-- Retorna o id do cadastro de entregador vinculado ao usuário logado
CREATE OR REPLACE FUNCTION public.current_courier_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT c.id FROM public.couriers c
  WHERE c.user_id = auth.uid() AND c.status = 'ATIVO'
  LIMIT 1;
$$;

-- ------------------------------------------------------------------------------
-- 2. AJUSTES DE ESQUEMA
-- ------------------------------------------------------------------------------
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon TEXT;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS badge TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price_cents BIGINT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS option_groups JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS tagline TEXT NOT NULL DEFAULT '';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_courier_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_courier_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cash_change_for_cents BIGINT CHECK (cash_change_for_cents IS NULL OR cash_change_for_cents >= 0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_assigned_courier ON public.orders(assigned_courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_guest_token_hash ON public.orders(guest_token_hash);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_image_snapshot TEXT;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS pix_copy_paste TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS pix_expires_at TIMESTAMPTZ;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cash_change_for_cents BIGINT;

-- Entregas passam a referenciar o cadastro de entregador (fonte única)
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_courier_id_fkey;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE RESTRICT;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS payment_collected BOOLEAN NOT NULL DEFAULT FALSE;

-- Opcionais: remove as tabelas normalizadas nunca utilizadas pelo app
ALTER TABLE public.order_item_options DROP CONSTRAINT IF EXISTS order_item_options_option_id_fkey;
ALTER TABLE public.order_item_options ALTER COLUMN option_id TYPE TEXT USING option_id::text;
DROP TABLE IF EXISTS public.product_option_groups;
DROP TABLE IF EXISTS public.product_options;
DROP TABLE IF EXISTS public.option_groups;

-- Numeração legível e única de pedidos
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1045;

-- Cupons de desconto (antes fixos no código do navegador)
CREATE TABLE IF NOT EXISTS public.coupons (
  code TEXT PRIMARY KEY CHECK (code = UPPER(code)),
  description TEXT,
  percent_off INT NOT NULL CHECK (percent_off > 0 AND percent_off <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  first_order_only BOOLEAN NOT NULL DEFAULT FALSE,
  max_redemptions INT CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemptions_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia cupons" ON public.coupons;
CREATE POLICY "Admin gerencia cupons" ON public.coupons
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Apenas uma linha de configuração da loja
CREATE UNIQUE INDEX IF NOT EXISTS store_settings_singleton ON public.store_settings ((TRUE));

-- ------------------------------------------------------------------------------
-- 3. PERFIS: usuário não altera role, is_active nem email do próprio perfil
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuário atualiza dados pessoais" ON public.profiles;
CREATE POLICY "Usuário atualiza dados pessoais" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Chamadas sem usuário (service_role / console SQL) e administradores podem tudo
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Não é permitido alterar função, status ou e-mail do próprio perfil.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS DE PEDIDOS E TABELAS RELACIONADAS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Cliente consulta seus próprios pedidos" ON public.orders;
DROP POLICY IF EXISTS "Cozinha atualiza status de preparo" ON public.orders;
DROP POLICY IF EXISTS "Admin administra pedidos" ON public.orders;

-- Leitura: cliente vê os seus, cozinha/admin veem todos, entregador só os atribuídos
CREATE POLICY "Leitura de pedidos por perfil" ON public.orders
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND customer_id = auth.uid())
    OR public.is_kitchen()
    OR (public.get_current_user_role() = 'DELIVERY'
        AND assigned_courier_id IS NOT NULL
        AND assigned_courier_id = public.current_courier_id())
  );
-- Escrita: somente via funções SECURITY DEFINER (create_order, update_order_status...)
-- Não há políticas de INSERT/UPDATE/DELETE para usuários.

CREATE OR REPLACE FUNCTION public.can_read_order(p_order_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id AND (
      (auth.uid() IS NOT NULL AND o.customer_id = auth.uid())
      OR public.is_kitchen()
      OR (public.get_current_user_role() = 'DELIVERY'
          AND o.assigned_courier_id IS NOT NULL
          AND o.assigned_courier_id = public.current_courier_id())
    )
  );
$$;

DROP POLICY IF EXISTS "Leitura de itens de pedido autorizada" ON public.order_items;
CREATE POLICY "Leitura de itens de pedido autorizada" ON public.order_items
  FOR SELECT USING (public.can_read_order(order_id));

DROP POLICY IF EXISTS "Leitura de opcionais de itens autorizada" ON public.order_item_options;
CREATE POLICY "Leitura de opcionais de itens autorizada" ON public.order_item_options
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_id AND public.can_read_order(oi.order_id))
  );

DROP POLICY IF EXISTS "Leitura de pagamentos autorizada" ON public.payments;
CREATE POLICY "Leitura de pagamentos autorizada" ON public.payments
  FOR SELECT USING (public.is_admin() OR public.can_read_order(order_id));

DROP POLICY IF EXISTS "Leitura de histórico autorizada" ON public.order_status_history;
CREATE POLICY "Leitura de histórico autorizada" ON public.order_status_history
  FOR SELECT USING (public.can_read_order(order_id));

DROP POLICY IF EXISTS "Admin consulta auditoria" ON public.audit_logs;
CREATE POLICY "Admin consulta auditoria" ON public.audit_logs
  FOR SELECT USING (public.is_admin());

-- Entregas: entregador vê as suas pelo vínculo com `couriers`
DROP POLICY IF EXISTS "Entregador consulta apenas suas entregas" ON public.deliveries;
DROP POLICY IF EXISTS "Entregador atualiza status de suas entregas" ON public.deliveries;
DROP POLICY IF EXISTS "Admin gerencia todas as entregas" ON public.deliveries;
CREATE POLICY "Leitura de entregas por perfil" ON public.deliveries
  FOR SELECT USING (public.is_admin() OR courier_id = public.current_courier_id());

-- Entregador pode ligar/desligar a própria disponibilidade (somente essa coluna, via RPC)
-- Políticas de catálogo: SELECT público já existente; escrita admin já existente.

-- ------------------------------------------------------------------------------
-- 5. MÁQUINA DE ESTADOS DO PEDIDO (vale para qualquer UPDATE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_transition_allowed(
  p_from order_status_enum,
  p_to order_status_enum,
  p_fulfillment fulfillment_type_enum
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IN ('CONCLUIDO', 'CANCELADO') THEN FALSE
    WHEN p_to = 'CANCELADO' THEN TRUE
    WHEN p_from = 'AGUARDANDO_CONFIRMACAO' THEN p_to = 'CONFIRMADO'
    WHEN p_from = 'CONFIRMADO' THEN p_to = 'EM_PREPARACAO'
    WHEN p_from = 'EM_PREPARACAO' THEN p_to = 'PRONTO'
    WHEN p_from = 'PRONTO' AND p_fulfillment = 'PICKUP' THEN p_to = 'AGUARDANDO_RETIRADA'
    WHEN p_from = 'PRONTO' AND p_fulfillment = 'DELIVERY' THEN p_to = 'EM_ENTREGA'
    WHEN p_from = 'AGUARDANDO_RETIRADA' THEN p_to = 'CONCLUIDO'
    WHEN p_from = 'EM_ENTREGA' THEN p_to = 'CONCLUIDO'
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF NOT public.order_transition_allowed(OLD.status, NEW.status, OLD.fulfillment_type) THEN
    RAISE EXCEPTION 'Transição de status inválida: % -> % (%).', OLD.status, NEW.status, OLD.fulfillment_type;
  END IF;

  IF NEW.status = 'CONFIRMADO'
     AND OLD.payment_method IN ('PIX_ONLINE', 'CARD_ONLINE')
     AND NEW.payment_status <> 'PAGO' THEN
    RAISE EXCEPTION 'Pedido com pagamento online só pode ser confirmado após aprovação do pagamento.';
  END IF;

  IF NEW.status = 'EM_ENTREGA' AND NEW.assigned_courier_id IS NULL THEN
    RAISE EXCEPTION 'Atribua um entregador antes de despachar o pedido.';
  END IF;

  NEW.updated_at := NOW();
  IF NEW.status = 'CONFIRMADO' THEN
    NEW.confirmed_at := NOW();
  ELSIF NEW.status = 'CONCLUIDO' THEN
    NEW.completed_at := NOW();
  ELSIF NEW.status = 'CANCELADO' THEN
    NEW.cancelled_at := NOW();
    NEW.cancellation_reason := COALESCE(NULLIF(TRIM(NEW.cancellation_reason), ''), 'Cancelado');
    IF OLD.payment_status = 'PAGO' THEN
      NEW.payment_status := 'REEMBOLSO_PENDENTE';
    ELSIF OLD.payment_status IN ('PENDENTE', 'EM_PROCESSAMENTO', 'PAGAMENTO_NA_ENTREGA') THEN
      NEW.payment_status := 'CANCELADO';
    END IF;
  END IF;

  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, actor_type, reason)
  VALUES (
    NEW.id, OLD.status, NEW.status, auth.uid(),
    COALESCE(public.get_current_user_role()::text, 'SYSTEM'),
    NULLIF(current_setting('burgerhub.status_reason', TRUE), '')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;
CREATE TRIGGER trg_enforce_order_status_transition
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

-- ------------------------------------------------------------------------------
-- 6. CRIAÇÃO DE PEDIDO (preços, cupom, taxa e número calculados no servidor)
-- ------------------------------------------------------------------------------
-- p_payload:
-- {
--   "customer_name": "...", "customer_phone": "...",
--   "fulfillment_type": "DELIVERY" | "PICKUP",
--   "payment_method": "PIX_ONLINE" | ...,
--   "delivery_address": { ...OrderAddressSnapshot },
--   "customer_notes": "...", "coupon_code": "...", "cash_change_for_cents": 0,
--   "items": [ { "product_id": "uuid", "quantity": 1, "notes": "...",
--                "options": [ { "option_id": "...", "quantity": 1 } ] } ]
-- }
-- Retorna: { order_id, order_number, guest_access_token }
CREATE OR REPLACE FUNCTION public.create_order(p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_settings public.store_settings%ROWTYPE;
  v_fulfillment fulfillment_type_enum;
  v_method payment_method_enum;
  v_item JSONB;
  v_opt JSONB;
  v_product public.products%ROWTYPE;
  v_group JSONB;
  v_catalog_opt JSONB;
  v_qty INT;
  v_opt_qty INT;
  v_unit BIGINT;
  v_subtotal BIGINT := 0;
  v_discount BIGINT := 0;
  v_fee BIGINT := 0;
  v_total BIGINT;
  v_minutes INT := NULL;
  v_zone public.delivery_zones%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_coupon_code TEXT;
  v_order_id UUID := gen_random_uuid();
  v_item_id UUID;
  v_order_number TEXT;
  v_token TEXT;
  v_name TEXT := NULLIF(TRIM(p_payload->>'customer_name'), '');
  v_phone TEXT := NULLIF(TRIM(p_payload->>'customer_phone'), '');
  v_neighborhood TEXT;
  v_group_counts JSONB;
  v_items_out JSONB := '[]'::jsonb;
  v_opts_out JSONB;
BEGIN
  SELECT * INTO v_settings FROM public.store_settings LIMIT 1;
  IF NOT FOUND OR NOT v_settings.is_open OR NOT v_settings.accepting_orders
     OR COALESCE(v_settings.store_status, 'OPEN') <> 'OPEN' THEN
    RAISE EXCEPTION 'A hamburgueria está fechada no momento e não está aceitando pedidos.';
  END IF;

  IF v_name IS NULL OR v_phone IS NULL THEN
    RAISE EXCEPTION 'Informe nome e telefone para o pedido.';
  END IF;
  IF length(v_name) > 120 OR length(v_phone) > 30 THEN
    RAISE EXCEPTION 'Nome ou telefone excede o tamanho permitido.';
  END IF;

  v_fulfillment := (p_payload->>'fulfillment_type')::fulfillment_type_enum;
  v_method := (p_payload->>'payment_method')::payment_method_enum;

  IF v_fulfillment = 'DELIVERY' AND NOT v_settings.delivery_enabled THEN
    RAISE EXCEPTION 'Entregas estão temporariamente desativadas.';
  END IF;
  IF v_fulfillment = 'PICKUP' AND NOT v_settings.pickup_enabled THEN
    RAISE EXCEPTION 'Retirada no balcão está temporariamente desativada.';
  END IF;
  IF v_settings.accepted_payment_methods IS NOT NULL
     AND NOT (v_method::text = ANY (v_settings.accepted_payment_methods)) THEN
    RAISE EXCEPTION 'Forma de pagamento não aceita pela loja.';
  END IF;

  IF jsonb_typeof(p_payload->'items') <> 'array' OR jsonb_array_length(p_payload->'items') = 0 THEN
    RAISE EXCEPTION 'O carrinho está vazio.';
  END IF;
  IF jsonb_array_length(p_payload->'items') > 50 THEN
    RAISE EXCEPTION 'Quantidade de itens excede o limite por pedido.';
  END IF;

  -- Valida cada item contra o catálogo oficial
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    SELECT * INTO v_product FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND is_available = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um dos produtos do carrinho não está mais disponível. Atualize o carrinho.';
    END IF;

    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 30 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%".', v_product.name;
    END IF;
    IF COALESCE(v_product.track_stock, FALSE) AND COALESCE(v_product.stock_quantity, 0) < v_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%".', v_product.name;
    END IF;

    v_unit := COALESCE(v_product.promotional_price_cents, v_product.price_cents);
    v_opts_out := '[]'::jsonb;
    v_group_counts := '{}'::jsonb;

    FOR v_opt IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'options', '[]'::jsonb)) LOOP
      v_catalog_opt := NULL;
      v_group := NULL;
      SELECT g.value, o.value INTO v_group, v_catalog_opt
      FROM jsonb_array_elements(v_product.option_groups) AS g(value),
           jsonb_array_elements(g.value->'options') AS o(value)
      WHERE o.value->>'id' = v_opt->>'option_id'
        AND COALESCE((g.value->>'is_active')::boolean, TRUE)
        AND COALESCE((o.value->>'is_available')::boolean, TRUE)
      LIMIT 1;

      IF v_catalog_opt IS NULL THEN
        RAISE EXCEPTION 'Opcional inválido ou indisponível para "%".', v_product.name;
      END IF;

      v_opt_qty := GREATEST(1, LEAST(COALESCE((v_opt->>'quantity')::int, 1), 10));
      v_unit := v_unit + (v_catalog_opt->>'price_delta_cents')::bigint * v_opt_qty;
      v_group_counts := jsonb_set(
        v_group_counts, ARRAY[v_group->>'id'],
        to_jsonb(COALESCE((v_group_counts->>(v_group->>'id'))::int, 0) + 1)
      );
      v_opts_out := v_opts_out || jsonb_build_object(
        'option_id', v_catalog_opt->>'id',
        'option_name_snapshot', (v_group->>'name') || ': ' || (v_catalog_opt->>'name'),
        'unit_price_delta_cents', (v_catalog_opt->>'price_delta_cents')::bigint,
        'quantity', v_opt_qty,
        'line_total_cents', (v_catalog_opt->>'price_delta_cents')::bigint * v_opt_qty
      );
    END LOOP;

    -- Regras de seleção mínima/máxima de cada grupo
    FOR v_group IN SELECT * FROM jsonb_array_elements(v_product.option_groups) LOOP
      CONTINUE WHEN NOT COALESCE((v_group->>'is_active')::boolean, TRUE);
      IF COALESCE((v_group_counts->>(v_group->>'id'))::int, 0) < COALESCE((v_group->>'min_selections')::int, 0)
         OR (COALESCE((v_group->>'is_required')::boolean, FALSE) AND COALESCE((v_group_counts->>(v_group->>'id'))::int, 0) = 0) THEN
        RAISE EXCEPTION 'Escolha obrigatória pendente em "%" (%).', v_product.name, v_group->>'name';
      END IF;
      IF COALESCE((v_group_counts->>(v_group->>'id'))::int, 0) > COALESCE((v_group->>'max_selections')::int, 99) THEN
        RAISE EXCEPTION 'Seleções acima do permitido em "%" (%).', v_product.name, v_group->>'name';
      END IF;
    END LOOP;

    v_subtotal := v_subtotal + v_unit * v_qty;
    v_items_out := v_items_out || jsonb_build_object(
      'product', to_jsonb(v_product),
      'unit', v_unit,
      'quantity', v_qty,
      'notes', LEFT(NULLIF(TRIM(v_item->>'notes'), ''), 300),
      'options', v_opts_out
    );
  END LOOP;

  -- Cupom
  v_coupon_code := NULLIF(UPPER(TRIM(p_payload->>'coupon_code')), '');
  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.coupons WHERE code = v_coupon_code FOR UPDATE;
    IF NOT FOUND OR NOT v_coupon.is_active
       OR (v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW())
       OR (v_coupon.max_redemptions IS NOT NULL AND v_coupon.redemptions_count >= v_coupon.max_redemptions) THEN
      RAISE EXCEPTION 'Cupom inválido ou expirado.';
    END IF;
    IF v_coupon.first_order_only AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.status <> 'CANCELADO'
        AND (o.customer_phone = v_phone OR (auth.uid() IS NOT NULL AND o.customer_id = auth.uid()))
    ) THEN
      RAISE EXCEPTION 'O cupom % é válido apenas para o primeiro pedido.', v_coupon_code;
    END IF;
    v_discount := ROUND(v_subtotal * v_coupon.percent_off / 100.0);
    UPDATE public.coupons SET redemptions_count = redemptions_count + 1 WHERE code = v_coupon_code;
  END IF;

  -- Taxa de entrega pela zona do bairro
  IF v_fulfillment = 'DELIVERY' THEN
    IF p_payload->'delivery_address' IS NULL OR jsonb_typeof(p_payload->'delivery_address') <> 'object' THEN
      RAISE EXCEPTION 'Endereço de entrega obrigatório para Delivery.';
    END IF;
    v_neighborhood := LOWER(TRIM(p_payload->'delivery_address'->>'neighborhood'));
    IF COALESCE(v_neighborhood, '') = ''
       OR COALESCE(TRIM(p_payload->'delivery_address'->>'street'), '') = ''
       OR COALESCE(TRIM(p_payload->'delivery_address'->>'number'), '') = '' THEN
      RAISE EXCEPTION 'Preencha rua, número e bairro para a entrega.';
    END IF;

    SELECT z.* INTO v_zone FROM public.delivery_zones z
    WHERE z.is_active AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(z.neighborhoods) n WHERE LOWER(TRIM(n)) = v_neighborhood
    )
    ORDER BY z.fee_cents
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ainda não entregamos no bairro informado. Escolha retirada no balcão.';
    END IF;

    v_fee := v_zone.fee_cents;
    v_minutes := v_zone.estimated_minutes;
    IF (v_subtotal - v_discount) < GREATEST(v_settings.minimum_order_cents, v_zone.minimum_order_cents) THEN
      RAISE EXCEPTION 'O valor mínimo para entrega é R$ %.',
        to_char(GREATEST(v_settings.minimum_order_cents, v_zone.minimum_order_cents) / 100.0, 'FM999990D00');
    END IF;
  END IF;

  v_total := GREATEST(0, v_subtotal - v_discount + v_fee);
  v_order_number := '#BH-' || nextval('public.order_number_seq');
  v_token := 'gst_' || encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.orders (
    id, order_number, customer_id, customer_name, customer_phone, fulfillment_type,
    status, payment_status, payment_method, delivery_address_snapshot,
    subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
    customer_notes, estimated_delivery_time, guest_token_hash, coupon_code, cash_change_for_cents
  ) VALUES (
    v_order_id, v_order_number, auth.uid(), v_name, v_phone, v_fulfillment,
    'AGUARDANDO_CONFIRMACAO',
    CASE WHEN v_method IN ('PIX_ONLINE', 'CARD_ONLINE') THEN 'PENDENTE'::payment_status_enum
         ELSE 'PAGAMENTO_NA_ENTREGA'::payment_status_enum END,
    v_method,
    CASE WHEN v_fulfillment = 'DELIVERY' THEN p_payload->'delivery_address' ELSE NULL END,
    v_subtotal, v_discount, v_fee, v_total,
    LEFT(NULLIF(TRIM(p_payload->>'customer_notes'), ''), 500),
    NOW() + make_interval(mins => COALESCE(v_minutes, v_settings.default_preparation_minutes)),
    encode(digest(v_token, 'sha256'), 'hex'),
    CASE WHEN v_discount > 0 THEN v_coupon_code ELSE NULL END,
    CASE WHEN v_method = 'CASH_ON_DELIVERY' THEN NULLIF((p_payload->>'cash_change_for_cents')::bigint, 0) ELSE NULL END
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_out) LOOP
    v_item_id := gen_random_uuid();
    INSERT INTO public.order_items (
      id, order_id, product_id, product_name_snapshot, product_image_snapshot,
      unit_price_cents, quantity, notes, line_total_cents
    ) VALUES (
      v_item_id, v_order_id, (v_item->'product'->>'id')::uuid, v_item->'product'->>'name',
      v_item->'product'->>'image_path', (v_item->>'unit')::bigint, (v_item->>'quantity')::int,
      v_item->>'notes', (v_item->>'unit')::bigint * (v_item->>'quantity')::int
    );

    INSERT INTO public.order_item_options (order_item_id, option_id, option_name_snapshot, unit_price_delta_cents, quantity, line_total_cents)
    SELECT v_item_id, o->>'option_id', o->>'option_name_snapshot',
           (o->>'unit_price_delta_cents')::bigint, (o->>'quantity')::int, (o->>'line_total_cents')::bigint
    FROM jsonb_array_elements(v_item->'options') o;

    IF COALESCE((v_item->'product'->>'track_stock')::boolean, FALSE) THEN
      UPDATE public.products SET stock_quantity = stock_quantity - (v_item->>'quantity')::int
      WHERE id = (v_item->'product'->>'id')::uuid;
    END IF;
  END LOOP;

  INSERT INTO public.payments (order_id, provider, method, status, amount_cents, cash_change_for_cents)
  VALUES (
    v_order_id,
    CASE WHEN v_method IN ('PIX_ONLINE', 'CARD_ONLINE') THEN 'MERCADOPAGO' ELSE 'MANUAL' END,
    v_method,
    CASE WHEN v_method IN ('PIX_ONLINE', 'CARD_ONLINE') THEN 'PENDENTE'::payment_status_enum
         ELSE 'PAGAMENTO_NA_ENTREGA'::payment_status_enum END,
    v_total,
    CASE WHEN v_method = 'CASH_ON_DELIVERY' THEN NULLIF((p_payload->>'cash_change_for_cents')::bigint, 0) ELSE NULL END
  );

  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, actor_type, reason)
  VALUES (v_order_id, NULL, 'AGUARDANDO_CONFIRMACAO', auth.uid(), 'CUSTOMER', 'Pedido criado pelo cliente');

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'CREATE_ORDER', 'orders', v_order_id::text,
          jsonb_build_object('order_number', v_order_number, 'total_cents', v_total));

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'guest_access_token', v_token);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. LEITURA DE PEDIDO POR TOKEN DE CONVIDADO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_to_json(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT to_jsonb(o) - 'guest_token_hash' || jsonb_build_object(
    'order_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(oi) || jsonb_build_object(
        'order_item_options', COALESCE((
          SELECT jsonb_agg(to_jsonb(oio)) FROM public.order_item_options oio WHERE oio.order_item_id = oi.id
        ), '[]'::jsonb)
      ) ORDER BY oi.created_at)
      FROM public.order_items oi WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.orders o WHERE o.id = p_order_id;
$$;
REVOKE ALL ON FUNCTION public.order_to_json(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_guest_order(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_id FROM public.orders
  WHERE guest_token_hash = encode(digest(p_token, 'sha256'), 'hex');
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.order_to_json(v_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. ALTERAÇÃO DE STATUS COM PERMISSÃO POR PAPEL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_new_status order_status_enum,
  p_reason TEXT DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role user_role_enum := public.get_current_user_role();
  v_is_owner BOOLEAN;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  v_is_owner := (auth.uid() IS NOT NULL AND v_order.customer_id = auth.uid())
    OR (p_guest_token IS NOT NULL AND v_order.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex'));

  IF v_role = 'ADMIN' THEN
    IF p_new_status = 'CANCELADO' AND length(COALESCE(TRIM(p_reason), '')) < 3 THEN
      RAISE EXCEPTION 'O motivo do cancelamento é obrigatório.';
    END IF;
  ELSIF v_role = 'KITCHEN' THEN
    IF p_new_status NOT IN ('CONFIRMADO', 'EM_PREPARACAO', 'PRONTO', 'AGUARDANDO_RETIRADA')
       AND NOT (p_new_status = 'CONCLUIDO' AND v_order.status = 'AGUARDANDO_RETIRADA') THEN
      RAISE EXCEPTION 'A cozinha não tem permissão para esta alteração de status.';
    END IF;
  ELSIF v_role = 'DELIVERY' THEN
    IF v_order.assigned_courier_id IS DISTINCT FROM public.current_courier_id() THEN
      RAISE EXCEPTION 'Não autorizado: esta entrega não está atribuída a você.';
    END IF;
    IF p_new_status NOT IN ('EM_ENTREGA', 'CONCLUIDO') THEN
      RAISE EXCEPTION 'O entregador só pode iniciar ou concluir entregas.';
    END IF;
  ELSIF v_is_owner THEN
    IF p_new_status <> 'CANCELADO' OR v_order.status NOT IN ('AGUARDANDO_CONFIRMACAO', 'CONFIRMADO') THEN
      RAISE EXCEPTION 'O pedido não pode mais ser cancelado pelo cliente. Fale com a loja.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  PERFORM set_config('burgerhub.status_reason', COALESCE(p_reason, ''), TRUE);

  UPDATE public.orders
  SET status = p_new_status,
      cancellation_reason = CASE WHEN p_new_status = 'CANCELADO'
                                 THEN COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelado a pedido do cliente')
                                 ELSE cancellation_reason END
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'UPDATE_ORDER_STATUS', 'orders', p_order_id::text,
          jsonb_build_object('previous', v_order.status, 'next', p_new_status, 'reason', p_reason));

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. ATRIBUIÇÃO DE ENTREGADOR (ADMIN)
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
    RAISE EXCEPTION 'Não é possível atribuir entregador a um pedido %.', v_order.status;
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
          jsonb_build_object('courier', v_courier.full_name, 'courier_id', v_courier.id));

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. AÇÕES DO ENTREGADOR
-- ------------------------------------------------------------------------------
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
    UPDATE public.deliveries SET status = 'EM_ROTA', picked_up_at = NOW(), out_for_delivery_at = NOW(), updated_at = NOW()
    WHERE order_id = p_order_id;
  ELSIF p_action = 'DELIVERED' THEN
    IF v_order.status <> 'EM_ENTREGA' THEN
      RAISE EXCEPTION 'A entrega precisa estar em rota para ser concluída.';
    END IF;
    IF v_order.payment_status = 'PAGAMENTO_NA_ENTREGA' AND NOT COALESCE(p_payment_collected, FALSE) THEN
      RAISE EXCEPTION 'Confirme o recebimento do pagamento antes de concluir a entrega.';
    END IF;
    PERFORM set_config('burgerhub.status_reason', 'Entrega confirmada no destino', TRUE);
    UPDATE public.orders
    SET status = 'CONCLUIDO',
        payment_status = CASE WHEN payment_status = 'PAGAMENTO_NA_ENTREGA' THEN 'PAGO_NA_ENTREGA'::payment_status_enum ELSE payment_status END
    WHERE id = p_order_id;
    UPDATE public.payments
    SET status = 'PAGO_NA_ENTREGA', confirmed_at = NOW(), updated_at = NOW()
    WHERE order_id = p_order_id AND status = 'PAGAMENTO_NA_ENTREGA';
    UPDATE public.deliveries SET status = 'ENTREGUE', delivered_at = NOW(), payment_collected = COALESCE(p_payment_collected, FALSE), updated_at = NOW()
    WHERE order_id = p_order_id;
    UPDATE public.couriers
    SET total_deliveries_count = total_deliveries_count + 1,
        completed_deliveries_count = completed_deliveries_count + 1,
        updated_at = NOW()
    WHERE id = v_order.assigned_courier_id;
  ELSE
    RAISE EXCEPTION 'Ação de entrega inválida.';
  END IF;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.courier_set_availability(p_available BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_courier_id UUID := public.current_courier_id();
BEGIN
  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum cadastro de entregador ativo vinculado a esta conta.';
  END IF;
  UPDATE public.couriers SET is_available_for_orders = p_available, updated_at = NOW() WHERE id = v_courier_id;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. PROVISIONAMENTO DE ADMINISTRADORES
-- ------------------------------------------------------------------------------
-- O primeiro admin só pode ser criado pelo console SQL / service_role.
-- Antes, qualquer usuário logado podia se promover enquanto não houvesse admin.
REVOKE ALL ON FUNCTION public.provision_initial_admin(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_promote_user(p_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas um administrador pode promover outros administradores.';
  END IF;
  SELECT id INTO v_user_id FROM public.profiles WHERE LOWER(email) = LOWER(TRIM(p_email));
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário com o e-mail % não encontrado. Crie a conta primeiro.', p_email;
  END IF;
  UPDATE public.profiles SET role = 'ADMIN', is_active = TRUE, updated_at = NOW() WHERE id = v_user_id;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'PROMOTE_ADMIN', 'profiles', v_user_id::text, jsonb_build_object('email', p_email));
  RETURN jsonb_build_object('success', TRUE, 'message', 'Usuário promovido a administrador.');
END;
$$;

-- Funcionários agora são criados pela Edge Function `admin-create-staff`
-- (precisa da service_role para criar o usuário em auth.users).
DROP FUNCTION IF EXISTS public.admin_create_staff_profile(UUID, TEXT, TEXT, TEXT, user_role_enum);

-- Vincular entregador: impede reaproveitar conta de admin/cozinha
CREATE OR REPLACE FUNCTION public.admin_link_courier_user(p_courier_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_courier_name TEXT;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem vincular entregadores a contas.';
  END IF;
  SELECT full_name INTO v_courier_name FROM public.couriers WHERE id = p_courier_id;
  IF v_courier_name IS NULL THEN
    RAISE EXCEPTION 'Entregador não encontrado.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado nos perfis.';
  END IF;
  IF v_profile.role IN ('ADMIN', 'KITCHEN') THEN
    RAISE EXCEPTION 'Contas de administrador ou cozinha não podem ser vinculadas como entregador.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.couriers WHERE user_id = p_user_id AND id <> p_courier_id) THEN
    RAISE EXCEPTION 'Esta conta já está vinculada a outro entregador.';
  END IF;

  UPDATE public.profiles SET role = 'DELIVERY', is_active = TRUE, updated_at = NOW() WHERE id = p_user_id;
  UPDATE public.couriers SET user_id = p_user_id, email = v_profile.email, updated_at = NOW() WHERE id = p_courier_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'LINK_COURIER_ACCOUNT', 'couriers', p_courier_id::text,
          jsonb_build_object('courier_name', v_courier_name, 'user_id', p_user_id, 'email', v_profile.email));
  RETURN jsonb_build_object('success', TRUE, 'message', 'Entregador vinculado à conta com sucesso.');
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. PERMISSÕES DE EXECUÇÃO
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_order(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, order_status_enum, TEXT, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_assign_courier(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_courier(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.courier_update_delivery(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_update_delivery(UUID, TEXT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.courier_set_availability(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_set_availability(BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_promote_user(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promote_user(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_order_status_transition() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 13. REALTIME: tabelas que o app escuta (RLS continua valendo)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['orders', 'products', 'categories', 'store_settings', 'delivery_zones', 'couriers'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

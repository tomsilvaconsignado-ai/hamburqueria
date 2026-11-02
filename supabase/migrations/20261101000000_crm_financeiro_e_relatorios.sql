-- ==============================================================================
-- BURGER HUB - CRM, FINANCEIRO, RELATÓRIOS NO SERVIDOR E PEDIDO SEM DUPLICIDADE
-- Só acrescenta: nenhuma tabela ou coluna existente é apagada ou tem dados alterados.
-- Idempotente: pode ser executada de novo sem efeito colateral.
-- ==============================================================================

SET timezone = 'America/Sao_Paulo';

-- ------------------------------------------------------------------------------
-- 1. AUXILIARES
-- ------------------------------------------------------------------------------

-- Chave do cliente pelo telefone: só dígitos, sem o 55 do Brasil (últimos 11 dígitos).
-- Assim "(11) 98888-1111", "11988881111" e "+55 11 98888-1111" são a mesma pessoa.
CREATE OR REPLACE FUNCTION public.phone_key(p_phone TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 11), '')
$$;

CREATE INDEX IF NOT EXISTS idx_orders_phone_key ON public.orders (public.phone_key(customer_phone));

-- Data do pedido no fuso da loja (relatórios "do dia" seguem o horário de Brasília)
CREATE OR REPLACE FUNCTION public.store_date(p_ts TIMESTAMPTZ)
RETURNS DATE LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (p_ts AT TIME ZONE COALESCE((SELECT timezone FROM public.store_settings LIMIT 1), 'America/Sao_Paulo'))::date
$$;

-- Registro de auditoria genérico para as tabelas novas
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    TG_OP || '_' || upper(TG_TABLE_NAME),
    TG_TABLE_NAME,
    COALESCE(to_jsonb(NEW) ->> TG_ARGV[0], to_jsonb(OLD) ->> TG_ARGV[0], ''),
    CASE WHEN TG_OP = 'DELETE' THEN jsonb_build_object('old', to_jsonb(OLD))
         ELSE jsonb_build_object('new', to_jsonb(NEW)) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. PEDIDO SEM DUPLICIDADE (clique duplo, internet instável, reenvio)
-- O checkout manda um client_request_id aleatório. Se o mesmo pedido chegar de novo,
-- devolvemos o pedido já criado em vez de criar outro.
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_request_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_token_salt TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_request_id_key
  ON public.orders (client_request_id) WHERE client_request_id IS NOT NULL;

-- A função original (validação de preços, cupom, taxa etc.) vira create_order_core,
-- sem nenhuma mudança; create_order passa a ser uma camada fina por cima dela.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'create_order_core' AND pronamespace = 'public'::regnamespace
  ) THEN
    ALTER FUNCTION public.create_order(JSONB) RENAME TO create_order_core;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.create_order_core(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_order(p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_req UUID;
  v_existing public.orders%ROWTYPE;
  v_result JSONB;
  v_salt TEXT;
  v_token TEXT;
BEGIN
  BEGIN
    v_req := NULLIF(p_payload->>'client_request_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_req := NULL;
  END;

  -- Sem identificador (versão antiga do site em cache): comportamento de antes
  IF v_req IS NULL THEN
    RETURN public.create_order_core(p_payload);
  END IF;

  -- Dois envios simultâneos do mesmo pedido esperam um pelo outro
  PERFORM pg_advisory_xact_lock(hashtextextended(v_req::text, 0));

  SELECT * INTO v_existing FROM public.orders WHERE client_request_id = v_req;
  IF FOUND THEN
    IF public.phone_key(v_existing.customer_phone) IS DISTINCT FROM public.phone_key(p_payload->>'customer_phone') THEN
      RAISE EXCEPTION 'Identificador de pedido inválido.';
    END IF;
    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'guest_access_token', 'gst_' || encode(digest(v_req::text || v_existing.guest_token_salt, 'sha256'), 'hex'),
      'duplicate', TRUE
    );
  END IF;

  v_result := public.create_order_core(p_payload);

  -- Token de acompanhamento reproduzível só por quem conhece o client_request_id
  v_salt := encode(gen_random_bytes(16), 'hex');
  v_token := 'gst_' || encode(digest(v_req::text || v_salt, 'sha256'), 'hex');
  UPDATE public.orders
  SET client_request_id = v_req,
      guest_token_salt = v_salt,
      guest_token_hash = encode(digest(v_token, 'sha256'), 'hex')
  WHERE id = (v_result->>'order_id')::uuid;

  RETURN v_result || jsonb_build_object('guest_access_token', v_token);
END;
$$;
REVOKE ALL ON FUNCTION public.create_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. CRM: FICHA DO CLIENTE
-- Os números (pedidos, gasto, ticket) vêm sempre dos pedidos; aqui fica o que a loja
-- anota: cadastro feito no balcão/telefone, endereços extras, aniversário, VIP, preferências.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_crm (
  phone_key TEXT PRIMARY KEY CHECK (phone_key ~ '^\d{10,11}$'),
  full_name TEXT NOT NULL DEFAULT '' CHECK (length(full_name) <= 120),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 30),
  whatsapp TEXT CHECK (whatsapp IS NULL OR length(whatsapp) <= 30),
  email TEXT CHECK (email IS NULL OR length(email) <= 160),
  birthday DATE,
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  addresses JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(addresses) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.touch_customer_crm()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_customer_crm ON public.customer_crm;
CREATE TRIGGER trg_touch_customer_crm BEFORE INSERT OR UPDATE ON public.customer_crm
  FOR EACH ROW EXECUTE FUNCTION public.touch_customer_crm();
DROP TRIGGER IF EXISTS trg_audit_customer_crm ON public.customer_crm;
CREATE TRIGGER trg_audit_customer_crm AFTER INSERT OR UPDATE OR DELETE ON public.customer_crm
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('phone_key');

ALTER TABLE public.customer_crm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia fichas de clientes" ON public.customer_crm;
CREATE POLICY "Admin gerencia fichas de clientes" ON public.customer_crm
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.customer_crm FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_crm TO authenticated;

-- Lista de clientes com métricas. Segmentos: ALL, FREQUENT (3+ pedidos concluídos em
-- 30 dias), INACTIVE (sem pedido há mais de 30 dias), VIP (marcado pela loja), BIRTHDAY
-- (aniversário neste mês).
CREATE OR REPLACE FUNCTION public.admin_customers(p_search TEXT DEFAULT NULL, p_segment TEXT DEFAULT 'ALL', p_limit INT DEFAULT 300)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_search TEXT := NULLIF(lower(TRIM(p_search)), '');
  v_digits TEXT := NULLIF(regexp_replace(COALESCE(p_search, ''), '\D', '', 'g'), '');
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores consultam clientes.';
  END IF;

  WITH stats AS (
    SELECT public.phone_key(o.customer_phone) AS phone_key,
           (array_agg(o.customer_name ORDER BY o.created_at DESC))[1] AS last_name,
           (array_agg(o.customer_phone ORDER BY o.created_at DESC))[1] AS last_phone,
           (array_agg(o.customer_id ORDER BY o.created_at DESC) FILTER (WHERE o.customer_id IS NOT NULL))[1] AS customer_id,
           (array_agg(o.delivery_address_snapshot ORDER BY o.created_at DESC) FILTER (WHERE o.delivery_address_snapshot IS NOT NULL))[1] AS last_address,
           count(*) FILTER (WHERE o.status <> 'CANCELADO') AS orders_count,
           count(*) FILTER (WHERE o.status = 'CONCLUIDO') AS completed_count,
           count(*) FILTER (WHERE o.status = 'CONCLUIDO' AND o.created_at > NOW() - interval '30 days') AS completed_30d,
           COALESCE(sum(o.total_cents) FILTER (WHERE o.status = 'CONCLUIDO'), 0) AS total_spent_cents,
           min(o.created_at) AS first_order_at,
           max(o.created_at) AS last_order_at
    FROM public.orders o
    WHERE public.phone_key(o.customer_phone) IS NOT NULL
    GROUP BY 1
  ),
  merged AS (
    SELECT COALESCE(c.phone_key, s.phone_key) AS phone_key,
           COALESCE(NULLIF(c.full_name, ''), s.last_name, '') AS full_name,
           COALESCE(NULLIF(c.phone, ''), s.last_phone, '') AS phone,
           c.whatsapp, COALESCE(c.email, p.email) AS email, c.birthday, COALESCE(c.notes, '') AS notes,
           COALESCE(c.is_vip, FALSE) AS is_vip, COALESCE(c.addresses, '[]'::jsonb) AS addresses,
           s.customer_id, s.last_address,
           COALESCE(s.orders_count, 0) AS orders_count,
           COALESCE(s.completed_count, 0) AS completed_count,
           COALESCE(s.completed_30d, 0) AS completed_30d,
           COALESCE(s.total_spent_cents, 0) AS total_spent_cents,
           s.first_order_at, s.last_order_at,
           (c.phone_key IS NOT NULL) AS has_crm
    FROM stats s
    FULL OUTER JOIN public.customer_crm c ON c.phone_key = s.phone_key
    LEFT JOIN public.profiles p ON p.id = s.customer_id
  )
  SELECT COALESCE(jsonb_agg(t.c ORDER BY (t.c->>'last_order_at') DESC NULLS LAST, t.c->>'full_name'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'phone_key', m.phone_key, 'full_name', m.full_name, 'phone', m.phone, 'whatsapp', m.whatsapp,
      'email', m.email, 'birthday', m.birthday, 'notes', m.notes, 'is_vip', m.is_vip,
      'addresses', m.addresses, 'last_address', m.last_address, 'customer_id', m.customer_id,
      'orders_count', m.orders_count, 'completed_count', m.completed_count,
      'total_spent_cents', m.total_spent_cents,
      'avg_ticket_cents', CASE WHEN m.completed_count > 0 THEN round(m.total_spent_cents::numeric / m.completed_count) ELSE 0 END,
      'first_order_at', m.first_order_at, 'last_order_at', m.last_order_at,
      'is_frequent', m.completed_30d >= 3,
      'is_inactive', m.last_order_at IS NOT NULL AND m.last_order_at < NOW() - interval '30 days',
      'birthday_this_month', m.birthday IS NOT NULL AND extract(month FROM m.birthday) = extract(month FROM NOW()),
      'has_crm', m.has_crm
    ) AS c
    FROM merged m
    WHERE (v_search IS NULL OR lower(m.full_name) LIKE '%' || v_search || '%'
           OR (v_digits IS NOT NULL AND m.phone_key LIKE '%' || v_digits || '%'))
      AND CASE upper(COALESCE(p_segment, 'ALL'))
            WHEN 'FREQUENT' THEN m.completed_30d >= 3
            WHEN 'INACTIVE' THEN m.last_order_at IS NOT NULL AND m.last_order_at < NOW() - interval '30 days'
            WHEN 'VIP' THEN m.is_vip
            WHEN 'BIRTHDAY' THEN m.birthday IS NOT NULL AND extract(month FROM m.birthday) = extract(month FROM NOW())
            ELSE TRUE
          END
    ORDER BY m.last_order_at DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000)
  ) t;

  RETURN v_result;
END;
$$;

-- Histórico de pedidos de um cliente (pelo telefone)
CREATE OR REPLACE FUNCTION public.admin_customer_orders(p_phone_key TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores consultam clientes.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'created_at', o.created_at, 'status', o.status,
      'fulfillment_type', o.fulfillment_type, 'payment_method', o.payment_method,
      'total_cents', o.total_cents,
      'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', i.product_name_snapshot, 'quantity', i.quantity)), '[]'::jsonb)
                FROM public.order_items i WHERE i.order_id = o.id)
    ) ORDER BY o.created_at DESC)
    FROM (SELECT * FROM public.orders WHERE public.phone_key(customer_phone) = public.phone_key(p_phone_key)
          ORDER BY created_at DESC LIMIT 100) o
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. FINANCEIRO: DESPESAS E FECHAMENTO DE CAIXA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'Outros' CHECK (length(category) BETWEEN 1 AND 60),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 200),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT NOT NULL DEFAULT 'OUTRO' CHECK (payment_method IN ('DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'TRANSFERENCIA', 'OUTRO')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses (expense_date DESC);
DROP TRIGGER IF EXISTS trg_audit_expenses ON public.expenses;
CREATE TRIGGER trg_audit_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('id');
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia despesas" ON public.expenses;
CREATE POLICY "Admin gerencia despesas" ON public.expenses
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.expenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;

CREATE TABLE IF NOT EXISTS public.cash_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE NOT NULL UNIQUE,
  opening_cash_cents BIGINT NOT NULL DEFAULT 0 CHECK (opening_cash_cents >= 0),
  counted_cash_cents BIGINT NOT NULL CHECK (counted_cash_cents >= 0),
  expected_cash_cents BIGINT NOT NULL,
  difference_cents BIGINT NOT NULL,
  summary JSONB NOT NULL,
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_audit_cash_closings ON public.cash_closings;
CREATE TRIGGER trg_audit_cash_closings AFTER INSERT OR UPDATE OR DELETE ON public.cash_closings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('business_date');
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin consulta fechamentos" ON public.cash_closings;
CREATE POLICY "Admin consulta fechamentos" ON public.cash_closings
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.cash_closings FROM anon;
GRANT SELECT ON public.cash_closings TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RELATÓRIO DE VENDAS E FINANCEIRO (por período, no fuso da loja)
-- Definições (iguais na tela e nos documentos):
--   Vendas de produtos     = soma dos subtotais dos pedidos CONCLUÍDOS
--   Faturamento bruto      = vendas de produtos + taxas de entrega
--   Descontos              = cupons aplicados
--   Faturamento líquido    = bruto − descontos (o que os clientes pagaram)
--   Saldo do período       = líquido − despesas lançadas. NÃO é lucro: não inclui custo das
--                            mercadorias, impostos nem taxas de cartão não lançadas.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_report(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from DATE := LEAST(p_from, p_to);
  v_to DATE := GREATEST(p_from, p_to);
  v_summary JSONB;
  v_expenses BIGINT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores consultam relatórios.';
  END IF;
  IF v_to - v_from > 731 THEN
    RAISE EXCEPTION 'Escolha um período de até 2 anos.';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _rep_orders ON COMMIT DROP AS SELECT * FROM public.orders WITH NO DATA;
  TRUNCATE _rep_orders;
  INSERT INTO _rep_orders SELECT * FROM public.orders o WHERE public.store_date(o.created_at) BETWEEN v_from AND v_to;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_expenses FROM public.expenses WHERE expense_date BETWEEN v_from AND v_to;

  SELECT jsonb_build_object(
    'orders_total', count(*),
    'orders_completed', count(*) FILTER (WHERE status = 'CONCLUIDO'),
    'orders_in_progress', count(*) FILTER (WHERE status NOT IN ('CONCLUIDO', 'CANCELADO')),
    'orders_cancelled', count(*) FILTER (WHERE status = 'CANCELADO'),
    'cancelled_cents', COALESCE(sum(total_cents) FILTER (WHERE status = 'CANCELADO'), 0),
    'in_progress_cents', COALESCE(sum(total_cents) FILTER (WHERE status NOT IN ('CONCLUIDO', 'CANCELADO')), 0),
    'products_cents', COALESCE(sum(subtotal_cents) FILTER (WHERE status = 'CONCLUIDO'), 0),
    'delivery_fees_cents', COALESCE(sum(delivery_fee_cents) FILTER (WHERE status = 'CONCLUIDO'), 0),
    'discounts_cents', COALESCE(sum(discount_cents) FILTER (WHERE status = 'CONCLUIDO'), 0),
    'gross_cents', COALESCE(sum(subtotal_cents + delivery_fee_cents) FILTER (WHERE status = 'CONCLUIDO'), 0),
    'net_cents', COALESCE(sum(total_cents) FILTER (WHERE status = 'CONCLUIDO'), 0),
    'avg_ticket_cents', COALESCE(round(avg(total_cents) FILTER (WHERE status = 'CONCLUIDO')), 0),
    'delivery_count', count(*) FILTER (WHERE status = 'CONCLUIDO' AND fulfillment_type = 'DELIVERY'),
    'pickup_count', count(*) FILTER (WHERE status = 'CONCLUIDO' AND fulfillment_type = 'PICKUP'),
    'unique_customers', count(DISTINCT public.phone_key(customer_phone)) FILTER (WHERE status = 'CONCLUIDO'),
    'returning_customers', (
      SELECT count(DISTINCT public.phone_key(r.customer_phone)) FROM _rep_orders r
      WHERE r.status = 'CONCLUIDO' AND EXISTS (
        SELECT 1 FROM public.orders prev
        WHERE public.phone_key(prev.customer_phone) = public.phone_key(r.customer_phone)
          AND prev.status = 'CONCLUIDO' AND prev.created_at < r.created_at)
    )
  ) INTO v_summary FROM _rep_orders;

  v_summary := v_summary || jsonb_build_object(
    'expenses_cents', v_expenses,
    'balance_cents', (v_summary->>'net_cents')::bigint - v_expenses
  );

  RETURN jsonb_build_object(
    'from', v_from, 'to', v_to,
    'summary', v_summary,
    'by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', d::date,
        'orders', (SELECT count(*) FROM _rep_orders o WHERE public.store_date(o.created_at) = d::date AND o.status = 'CONCLUIDO'),
        'net_cents', (SELECT COALESCE(sum(total_cents), 0) FROM _rep_orders o WHERE public.store_date(o.created_at) = d::date AND o.status = 'CONCLUIDO'),
        'cancelled', (SELECT count(*) FROM _rep_orders o WHERE public.store_date(o.created_at) = d::date AND o.status = 'CANCELADO')
      ) ORDER BY d), '[]'::jsonb)
      FROM generate_series(v_from, v_to, interval '1 day') d
    ),
    'by_hour', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'orders', n) ORDER BY h), '[]'::jsonb)
      FROM (SELECT extract(hour FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS h, count(*) AS n
            FROM _rep_orders WHERE status = 'CONCLUIDO' GROUP BY 1) x
    ),
    'by_payment', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('method', payment_method, 'orders', n, 'net_cents', v) ORDER BY v DESC), '[]'::jsonb)
      FROM (SELECT payment_method, count(*) AS n, sum(total_cents) AS v FROM _rep_orders WHERE status = 'CONCLUIDO' GROUP BY 1) x
    ),
    'by_product', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'quantity', q, 'revenue_cents', v) ORDER BY q DESC, v DESC), '[]'::jsonb)
      FROM (SELECT i.product_name_snapshot AS name, sum(i.quantity) AS q, sum(i.line_total_cents) AS v
            FROM public.order_items i JOIN _rep_orders o ON o.id = i.order_id
            WHERE o.status = 'CONCLUIDO' GROUP BY 1 ORDER BY 2 DESC LIMIT 50) x
    ),
    'by_category', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'quantity', q, 'revenue_cents', v) ORDER BY v DESC), '[]'::jsonb)
      FROM (SELECT COALESCE(c.name, 'Sem categoria') AS name, sum(i.quantity) AS q, sum(i.line_total_cents) AS v
            FROM public.order_items i JOIN _rep_orders o ON o.id = i.order_id
            LEFT JOIN public.products p ON p.id = i.product_id
            LEFT JOIN public.categories c ON c.id = p.category_id
            WHERE o.status = 'CONCLUIDO' GROUP BY 1) x
    ),
    'expenses_by_category', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'amount_cents', v) ORDER BY v DESC), '[]'::jsonb)
      FROM (SELECT category, sum(amount_cents) AS v FROM public.expenses WHERE expense_date BETWEEN v_from AND v_to GROUP BY 1) x
    ),
    'cancellations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('order_number', order_number, 'total_cents', total_cents,
               'reason', cancellation_reason, 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM _rep_orders WHERE status = 'CANCELADO' ORDER BY created_at DESC LIMIT 100) x
    )
  );
END;
$$;

-- Fechamento de caixa do dia: dinheiro esperado = troco inicial + vendas em dinheiro
-- concluídas no dia − despesas pagas em dinheiro no dia. Refazer o fechamento do mesmo dia
-- atualiza o registro (fica na auditoria).
CREATE OR REPLACE FUNCTION public.admin_close_cash(p_date DATE, p_opening_cents BIGINT, p_counted_cents BIGINT, p_notes TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report JSONB;
  v_cash_sales BIGINT;
  v_cash_expenses BIGINT;
  v_expected BIGINT;
  v_row public.cash_closings%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores fecham o caixa.';
  END IF;
  IF p_date IS NULL OR p_date > public.store_date(NOW()) THEN
    RAISE EXCEPTION 'Data de fechamento inválida.';
  END IF;
  IF COALESCE(p_opening_cents, 0) < 0 OR COALESCE(p_counted_cents, -1) < 0 THEN
    RAISE EXCEPTION 'Informe valores de caixa válidos.';
  END IF;

  v_report := public.admin_report(p_date, p_date);
  SELECT COALESCE(sum(total_cents), 0) INTO v_cash_sales FROM public.orders
  WHERE public.store_date(created_at) = p_date AND status = 'CONCLUIDO' AND payment_method = 'CASH_ON_DELIVERY';
  SELECT COALESCE(sum(amount_cents), 0) INTO v_cash_expenses FROM public.expenses
  WHERE expense_date = p_date AND payment_method = 'DINHEIRO';
  v_expected := COALESCE(p_opening_cents, 0) + v_cash_sales - v_cash_expenses;

  INSERT INTO public.cash_closings (business_date, opening_cash_cents, counted_cash_cents, expected_cash_cents,
                                    difference_cents, summary, notes, closed_by, closed_at)
  VALUES (p_date, COALESCE(p_opening_cents, 0), p_counted_cents, v_expected, p_counted_cents - v_expected,
          jsonb_build_object('report', v_report, 'cash_sales_cents', v_cash_sales, 'cash_expenses_cents', v_cash_expenses),
          LEFT(COALESCE(p_notes, ''), 1000), auth.uid(), NOW())
  ON CONFLICT (business_date) DO UPDATE
  SET opening_cash_cents = EXCLUDED.opening_cash_cents, counted_cash_cents = EXCLUDED.counted_cash_cents,
      expected_cash_cents = EXCLUDED.expected_cash_cents, difference_cents = EXCLUDED.difference_cents,
      summary = EXCLUDED.summary, notes = EXCLUDED.notes, closed_by = EXCLUDED.closed_by, closed_at = NOW()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. ENTREGADORES: HISTÓRICO E VALORES POR PERÍODO
-- O "valor de entrega" é a taxa de entrega cobrada do cliente em cada pedido entregue.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_courier_report(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores consultam entregas.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'courier_id', c.id, 'full_name', c.full_name, 'phone', c.phone,
      'delivered_count', x.delivered, 'in_route_count', x.in_route, 'fees_cents', x.fees,
      'deliveries', x.list
    ) ORDER BY x.delivered DESC, c.full_name)
    FROM public.couriers c
    JOIN LATERAL (
      SELECT count(*) FILTER (WHERE d.status = 'ENTREGUE') AS delivered,
             count(*) FILTER (WHERE d.status IN ('ATRIBUIDA', 'COLETADA', 'EM_ROTA')) AS in_route,
             COALESCE(sum(o.delivery_fee_cents) FILTER (WHERE d.status = 'ENTREGUE'), 0) AS fees,
             COALESCE(jsonb_agg(jsonb_build_object(
               'order_id', o.id, 'order_number', o.order_number, 'customer_name', o.customer_name,
               'neighborhood', o.delivery_address_snapshot->>'neighborhood',
               'status', d.status, 'total_cents', o.total_cents, 'fee_cents', o.delivery_fee_cents,
               'assigned_at', d.assigned_at, 'out_for_delivery_at', d.out_for_delivery_at,
               'delivered_at', d.delivered_at, 'payment_collected', d.payment_collected,
               'assigned_by_name', ab.full_name
             ) ORDER BY d.assigned_at DESC), '[]'::jsonb) AS list
      FROM public.deliveries d
      JOIN public.orders o ON o.id = d.order_id
      LEFT JOIN public.profiles ab ON ab.id = d.assigned_by
      WHERE d.courier_id = c.id AND public.store_date(d.assigned_at) BETWEEN LEAST(p_from, p_to) AND GREATEST(p_from, p_to)
    ) x ON TRUE
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. PERMISSÕES DAS FUNÇÕES NOVAS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_customers(TEXT, TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_customer_orders(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_close_cash(DATE, BIGINT, BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_courier_report(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_customers(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_orders(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_report(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_cash(DATE, BIGINT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_courier_report(DATE, DATE) TO authenticated;

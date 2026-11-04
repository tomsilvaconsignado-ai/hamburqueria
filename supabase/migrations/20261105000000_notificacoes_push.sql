-- ==============================================================================
-- BURGER HUB - NOTIFICAÇÕES PUSH NO CELULAR (equipe: admin, cozinha e entregador)
-- O banco detecta o evento (pedido novo, pagamento aprovado, entregador acionado) e chama,
-- sem esperar resposta (pg_net), a Edge Function `send-push`, que envia o Web Push.
-- Só acrescenta; idempotente.
--
-- Depois de rodar e publicar a função, cadastre o endereço dela e o segredo compartilhado:
--
--   INSERT INTO private.app_secrets (name, value) VALUES
--     ('push_function_url', 'https://<projeto>.supabase.co/functions/v1/send-push'),
--     ('push_webhook_secret', '<mesmo valor de PUSH_WEBHOOK_SECRET na função>')
--   ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
--
-- Sem esses dois valores nada é enviado (e nada quebra).
-- ==============================================================================

-- Requisições HTTP assíncronas (não atrasam a criação do pedido)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- (criados na migração do Mapbox; repetidos para esta poder rodar sozinha)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.app_secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON private.app_secrets FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 1. INSCRIÇÕES (um registro por aparelho/navegador que ativou as notificações)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
  p256dh TEXT NOT NULL CHECK (length(p256dh) BETWEEN 20 AND 200),
  auth TEXT NOT NULL CHECK (length(auth) BETWEEN 8 AND 100),
  user_agent TEXT CHECK (user_agent IS NULL OR length(user_agent) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada pessoa vê os próprios aparelhos" ON public.push_subscriptions;
CREATE POLICY "Cada pessoa vê os próprios aparelhos" ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
-- Escrita só pelas funções abaixo
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.push_subscriptions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_current_user_role() NOT IN ('ADMIN', 'KITCHEN', 'DELIVERY') THEN
    RAISE EXCEPTION 'Notificações no celular são para a equipe da loja.';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, LEFT(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent, created_at = NOW();
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_subscription(p_endpoint TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid();
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. ENVIO: chama a Edge Function sem esperar (falha aqui nunca derruba o pedido)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_push(p_user_ids UUID[], p_title TEXT, p_body TEXT, p_url TEXT, p_tag TEXT, p_sound TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN;
  END IF;
  -- Ninguém com aparelho inscrito: não chama a função
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = ANY (p_user_ids)) THEN
    RETURN;
  END IF;
  SELECT value INTO v_url FROM private.app_secrets WHERE name = 'push_function_url';
  SELECT value INTO v_secret FROM private.app_secrets WHERE name = 'push_webhook_secret';
  IF COALESCE(v_url, '') = '' OR COALESCE(v_secret, '') = '' THEN
    RETURN;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body,
                                 'url', p_url, 'tag', p_tag, 'sound', p_sound),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 8000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Notificação push não enviada: %', SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_user_ids(p_roles TEXT[])
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id), '{}') FROM public.profiles
  WHERE role::text = ANY (p_roles) AND COALESCE(is_active, TRUE)
$$;

-- Texto curto do pedido: "Ana Souza · R$ 45,90 · Entrega"
CREATE OR REPLACE FUNCTION public.order_push_summary(o public.orders)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT o.customer_name || ' · R$ ' || replace(to_char(o.total_cents / 100.0, 'FM999990.00'), '.', ',')
         || ' · ' || CASE WHEN o.fulfillment_type = 'DELIVERY' THEN 'Entrega' ELSE 'Retirada' END
$$;

-- ------------------------------------------------------------------------------
-- 3. EVENTOS DO PEDIDO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_on_order_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_awaiting_online BOOLEAN;
  v_courier_user UUID;
  v_addr JSONB;
BEGIN
  v_awaiting_online := NEW.payment_method IN ('PIX_ONLINE', 'CARD_ONLINE') AND NEW.payment_status <> 'PAGO';

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

  -- Entregador acionado
  IF NEW.assigned_courier_id IS NOT NULL AND NEW.assigned_courier_id IS DISTINCT FROM OLD.assigned_courier_id THEN
    SELECT user_id INTO v_courier_user FROM public.couriers WHERE id = NEW.assigned_courier_id;
    IF v_courier_user IS NOT NULL THEN
      v_addr := NEW.delivery_address_snapshot;
      PERFORM public.notify_push(ARRAY[v_courier_user],
        '🛵 Nova entrega ' || NEW.order_number,
        COALESCE(concat_ws(' – ', NULLIF(concat_ws(', ', v_addr->>'street', v_addr->>'number'), ''), v_addr->>'neighborhood'), NEW.customer_name)
          || CASE WHEN NEW.payment_status = 'PAGAMENTO_NA_ENTREGA'
                  THEN ' · cobrar R$ ' || replace(to_char(NEW.total_cents / 100.0, 'FM999990.00'), '.', ',') ELSE '' END,
        '/entregador', 'entrega-' || NEW.id, 'entregador-acionado');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_on_order_insert ON public.orders;
CREATE TRIGGER trg_push_on_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.push_on_order_change();

DROP TRIGGER IF EXISTS trg_push_on_order_update ON public.orders;
CREATE TRIGGER trg_push_on_order_update
  AFTER UPDATE OF payment_status, assigned_courier_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.push_on_order_change();

-- Botão "Enviar teste" do app
CREATE OR REPLACE FUNCTION public.send_test_push()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_devices INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para testar.';
  END IF;
  SELECT count(*) INTO v_devices FROM public.push_subscriptions WHERE user_id = auth.uid();
  IF v_devices = 0 THEN
    RAISE EXCEPTION 'Nenhum aparelho com notificações ativadas nesta conta.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.app_secrets WHERE name = 'push_function_url' AND value <> '')
     OR NOT EXISTS (SELECT 1 FROM private.app_secrets WHERE name = 'push_webhook_secret' AND value <> '') THEN
    RAISE EXCEPTION 'O envio de notificações ainda não foi configurado no servidor (função send-push).';
  END IF;
  PERFORM public.notify_push(ARRAY[auth.uid()], '🔔 Teste de notificação',
    'Tudo certo! Este aparelho vai receber os avisos da hamburgueria.', '/', 'teste', 'novo-pedido');
  RETURN jsonb_build_object('success', TRUE, 'devices', v_devices);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. PERMISSÕES
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.notify_push(UUID[], TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_user_ids(TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_order_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.unregister_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_push_subscription(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.send_test_push() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_test_push() TO authenticated;

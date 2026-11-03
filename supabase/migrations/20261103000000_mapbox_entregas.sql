-- ==============================================================================
-- BURGER HUB - MAPAS (MAPBOX): TAXA POR DISTÂNCIA, ROTA E RASTREIO AO VIVO
-- Só acrescenta: nenhuma tabela ou coluna existente é apagada ou tem dados alterados.
-- Idempotente: pode ser executada de novo sem efeito colateral.
--
-- Depois de rodar, cadastre o token do Mapbox usado pelo servidor (um token público
-- "pk." SEM restrição de URL; ele fica só no banco e nunca vai para o navegador):
--
--   INSERT INTO private.app_secrets (name, value) VALUES ('mapbox_server_token', 'pk.SEU_TOKEN')
--   ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
--
-- Sem token, sem a localização da loja ou com o Mapbox fora do ar, a taxa volta a ser
-- a da zona do bairro. O modo padrão continua sendo por bairro.
-- ==============================================================================

-- Requisições HTTP síncronas a partir do banco (extensão "http" do Supabase)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- ------------------------------------------------------------------------------
-- 1. SEGREDOS E CACHE (schema "private": fora da API, o app não lê)
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distância e tempo de rota por endereço (24 h), para não consultar o Mapbox duas vezes
-- (prévia no checkout + criação do pedido). As coordenadas não são guardadas.
CREATE TABLE IF NOT EXISTS private.delivery_route_cache (
  address_key TEXT PRIMARY KEY,
  distance_m INT NOT NULL,
  duration_s INT NOT NULL,
  approximate BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma linha por chamada ao Mapbox: limite por minuto para proteger a cota gratuita
CREATE TABLE IF NOT EXISTS private.mapbox_calls (
  id BIGSERIAL PRIMARY KEY,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mapbox_calls_called_at_idx ON private.mapbox_calls (called_at);

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. CONFIGURAÇÃO DA TAXA E DADOS DA ROTA NO PEDIDO
-- ------------------------------------------------------------------------------
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS delivery_pricing_mode TEXT NOT NULL DEFAULT 'ZONE';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS store_latitude DOUBLE PRECISION;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS store_longitude DOUBLE PRECISION;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS delivery_base_fee_cents BIGINT NOT NULL DEFAULT 500;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS delivery_included_km NUMERIC(5, 2) NOT NULL DEFAULT 2;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS delivery_fee_per_km_cents BIGINT NOT NULL DEFAULT 150;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS delivery_max_km NUMERIC(5, 2) NOT NULL DEFAULT 8;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_delivery_pricing_check') THEN
    ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_delivery_pricing_check CHECK (
      delivery_pricing_mode IN ('ZONE', 'DISTANCE')
      AND delivery_base_fee_cents >= 0 AND delivery_fee_per_km_cents >= 0
      AND delivery_included_km >= 0 AND delivery_max_km > 0
      AND (store_latitude IS NULL OR store_latitude BETWEEN -90 AND 90)
      AND (store_longitude IS NULL OR store_longitude BETWEEN -180 AND 180)
    );
  END IF;
END $$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_distance_m INT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_duration_s INT;

-- ------------------------------------------------------------------------------
-- 3. CONSULTA AO MAPBOX (geocodificação + rota de carro)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.haversine_m(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION, lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- GET com tempo limite. Devolve NULL se o Mapbox falhar (quem chama usa a zona do bairro).
CREATE OR REPLACE FUNCTION public.mapbox_get(p_url TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_status INT;
  v_content TEXT;
BEGIN
  INSERT INTO private.mapbox_calls DEFAULT VALUES;
  BEGIN
    PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '6');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- versão da extensão sem essa opção: segue com o tempo padrão
  END;
  BEGIN
    SELECT status, content INTO v_status, v_content FROM http_get(p_url);
    IF v_status IS DISTINCT FROM 200 THEN
      RAISE WARNING 'Mapbox respondeu HTTP %', v_status;
      RETURN NULL;
    END IF;
    RETURN v_content::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Mapbox indisponível: %', SQLERRM;
    RETURN NULL;
  END;
END;
$$;

-- Rota da loja até o endereço. Devolve:
--   NULL                                    → Mapbox não configurado ou fora do ar
--   { "error": "..." }                      → endereço não encontrado / limite de consultas
--   { distance_m, duration_s, approximate } → rota calculada
CREATE OR REPLACE FUNCTION public.delivery_route(p_address JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
  v_slat DOUBLE PRECISION;
  v_slng DOUBLE PRECISION;
  v_query TEXT;
  v_key TEXT;
  v_cached private.delivery_route_cache%ROWTYPE;
  v_geo JSONB;
  v_feature JSONB;
  v_dir JSONB;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_distance INT;
  v_duration INT;
  v_approx BOOLEAN;
BEGIN
  SELECT value INTO v_token FROM private.app_secrets WHERE name = 'mapbox_server_token';
  SELECT store_latitude, store_longitude INTO v_slat, v_slng FROM public.store_settings LIMIT 1;
  IF COALESCE(v_token, '') = '' OR v_slat IS NULL OR v_slng IS NULL THEN
    RETURN NULL;
  END IF;

  -- "Rua X 10, Bairro, Cidade - UF, 01000-000" (mesmo formato de src/lib/mapbox.ts)
  v_query := concat_ws(', ',
    NULLIF(TRIM(concat_ws(' ', TRIM(p_address->>'street'), TRIM(p_address->>'number'))), ''),
    NULLIF(TRIM(p_address->>'neighborhood'), ''),
    NULLIF(concat_ws(' - ', NULLIF(TRIM(p_address->>'city'), ''), NULLIF(TRIM(p_address->>'state'), '')), ''),
    NULLIF(TRIM(p_address->>'postal_code'), '')
  );
  v_key := md5(lower(v_query) || '|' || v_slat::text || ',' || v_slng::text);

  SELECT * INTO v_cached FROM private.delivery_route_cache
  WHERE address_key = v_key AND created_at > NOW() - INTERVAL '1 day';
  IF FOUND THEN
    RETURN jsonb_build_object('distance_m', v_cached.distance_m, 'duration_s', v_cached.duration_s, 'approximate', v_cached.approximate);
  END IF;

  DELETE FROM private.mapbox_calls WHERE called_at < NOW() - INTERVAL '1 day';
  IF (SELECT count(*) FROM private.mapbox_calls WHERE called_at > NOW() - INTERVAL '1 minute') >= 60 THEN
    RETURN jsonb_build_object('error', 'Muitas consultas de endereço neste momento. Tente de novo em um minuto.');
  END IF;

  v_geo := public.mapbox_get(
    'https://api.mapbox.com/search/geocode/v6/forward?country=br&language=pt&limit=1'
    || '&proximity=' || v_slng::text || ',' || v_slat::text
    || '&q=' || urlencode(v_query)
    || '&access_token=' || urlencode(v_token)
  );
  IF v_geo IS NULL THEN
    RETURN NULL;
  END IF;
  v_feature := v_geo->'features'->0;
  IF v_feature IS NULL THEN
    RETURN jsonb_build_object('error', 'Não encontramos esse endereço no mapa. Confira a rua, o número e o CEP.');
  END IF;
  v_lng := (v_feature->'geometry'->'coordinates'->>0)::double precision;
  v_lat := (v_feature->'geometry'->'coordinates'->>1)::double precision;
  -- Achou só a rua, o CEP ou o bairro (não o número exato)
  v_approx := COALESCE(v_feature->'properties'->>'feature_type', '') <> 'address';

  v_dir := public.mapbox_get(
    'https://api.mapbox.com/directions/v5/mapbox/driving/'
    || v_slng::text || ',' || v_slat::text || ';' || v_lng::text || ',' || v_lat::text
    || '?overview=false&access_token=' || urlencode(v_token)
  );
  IF v_dir->'routes'->0 IS NOT NULL THEN
    v_distance := round((v_dir->'routes'->0->>'distance')::numeric);
    v_duration := round((v_dir->'routes'->0->>'duration')::numeric);
  ELSE
    -- Sem rota: linha reta + 35% (as ruas não são retas), a ~22 km/h
    v_distance := round(public.haversine_m(v_slat, v_slng, v_lat, v_lng) * 1.35);
    v_duration := round(v_distance / 6.0);
  END IF;

  INSERT INTO private.delivery_route_cache (address_key, distance_m, duration_s, approximate)
  VALUES (v_key, v_distance, v_duration, v_approx)
  ON CONFLICT (address_key) DO UPDATE
  SET distance_m = EXCLUDED.distance_m, duration_s = EXCLUDED.duration_s,
      approximate = EXCLUDED.approximate, created_at = NOW();

  RETURN jsonb_build_object('distance_m', v_distance, 'duration_s', v_duration, 'approximate', v_approx);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. TAXA DE ENTREGA (usada pela prévia do checkout e pela criação do pedido)
-- Devolve { ok: true, mode, fee_cents, minutes, minimum_cents, distance_m, duration_s, ... }
-- ou { ok: false, error }.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_delivery(p_address JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_settings public.store_settings%ROWTYPE;
  v_zone public.delivery_zones%ROWTYPE;
  v_neighborhood TEXT;
  v_route JSONB;
  v_km NUMERIC;
  v_fee BIGINT;
BEGIN
  IF p_address IS NULL OR jsonb_typeof(p_address) <> 'object' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Preencha rua, número e bairro para a entrega.');
  END IF;
  v_neighborhood := LOWER(TRIM(p_address->>'neighborhood'));
  IF COALESCE(v_neighborhood, '') = ''
     OR COALESCE(TRIM(p_address->>'street'), '') = ''
     OR COALESCE(TRIM(p_address->>'number'), '') = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Preencha rua, número e bairro para a entrega.');
  END IF;

  SELECT * INTO v_settings FROM public.store_settings LIMIT 1;
  SELECT z.* INTO v_zone FROM public.delivery_zones z
  WHERE z.is_active AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(z.neighborhoods) n WHERE LOWER(TRIM(n)) = v_neighborhood
  )
  ORDER BY z.fee_cents
  LIMIT 1;

  IF v_settings.delivery_pricing_mode = 'DISTANCE' THEN
    v_route := public.delivery_route(p_address);
    IF v_route ? 'error' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', v_route->>'error');
    END IF;
    IF v_route IS NOT NULL THEN
      v_km := (v_route->>'distance_m')::numeric / 1000;
      IF v_km > v_settings.delivery_max_km THEN
        RETURN jsonb_build_object(
          'ok', FALSE,
          'distance_m', (v_route->>'distance_m')::int,
          'error', format('Esse endereço fica a %s km da loja e entregamos até %s km. Escolha retirada no balcão.',
                          replace(to_char(v_km, 'FM9990.0'), '.', ','),
                          replace(to_char(v_settings.delivery_max_km, 'FM9990.0'), '.', ','))
        );
      END IF;
      v_fee := v_settings.delivery_base_fee_cents
               + ceil(GREATEST(0, v_km - v_settings.delivery_included_km) * v_settings.delivery_fee_per_km_cents);
      v_fee := ceil(v_fee / 10.0) * 10; -- arredonda para os 10 centavos de cima
      RETURN jsonb_build_object(
        'ok', TRUE,
        'mode', 'DISTANCE',
        'fee_cents', v_fee,
        'minutes', v_settings.default_preparation_minutes + ceil((v_route->>'duration_s')::numeric / 60)::int,
        'minimum_cents', v_settings.minimum_order_cents,
        'distance_m', (v_route->>'distance_m')::int,
        'duration_s', (v_route->>'duration_s')::int,
        'approximate', COALESCE((v_route->>'approximate')::boolean, FALSE)
      );
    END IF;
    -- Mapbox indisponível: vale a zona do bairro, se houver
    IF v_zone.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Não foi possível calcular a distância até esse endereço agora. Tente de novo em instantes ou escolha retirada no balcão.');
    END IF;
  END IF;

  IF v_zone.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Ainda não entregamos no bairro informado. Escolha retirada no balcão.');
  END IF;
  RETURN jsonb_build_object(
    'ok', TRUE,
    'mode', 'ZONE',
    'zone_name', v_zone.name,
    'fee_cents', v_zone.fee_cents,
    'minutes', v_zone.estimated_minutes,
    'minimum_cents', GREATEST(v_settings.minimum_order_cents, v_zone.minimum_order_cents)
  );
END;
$$;

-- Prévia da taxa no checkout (qualquer visitante). O pedido recalcula tudo no servidor.
CREATE OR REPLACE FUNCTION public.quote_delivery(p_address JSONB)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.compute_delivery(p_address) $$;

-- ------------------------------------------------------------------------------
-- 5. CRIAÇÃO DE PEDIDO: igual à anterior, com a taxa vinda de compute_delivery
-- e a distância/tempo de rota gravados no pedido.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_core(p_payload JSONB)
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
  v_delivery JSONB;
  v_coupon public.coupons%ROWTYPE;
  v_coupon_code TEXT;
  v_order_id UUID := gen_random_uuid();
  v_item_id UUID;
  v_order_number TEXT;
  v_token TEXT;
  v_name TEXT := NULLIF(TRIM(p_payload->>'customer_name'), '');
  v_phone TEXT := NULLIF(TRIM(p_payload->>'customer_phone'), '');
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

  -- Taxa de entrega: por distância (Mapbox) ou pela zona do bairro (ver compute_delivery)
  IF v_fulfillment = 'DELIVERY' THEN
    IF p_payload->'delivery_address' IS NULL OR jsonb_typeof(p_payload->'delivery_address') <> 'object' THEN
      RAISE EXCEPTION 'Endereço de entrega obrigatório para Delivery.';
    END IF;
    v_delivery := public.compute_delivery(p_payload->'delivery_address');
    IF NOT (v_delivery->>'ok')::boolean THEN
      RAISE EXCEPTION '%', v_delivery->>'error';
    END IF;
    v_fee := (v_delivery->>'fee_cents')::bigint;
    v_minutes := (v_delivery->>'minutes')::int;
    IF (v_subtotal - v_discount) < (v_delivery->>'minimum_cents')::bigint THEN
      RAISE EXCEPTION 'O valor mínimo para entrega é R$ %.',
        to_char((v_delivery->>'minimum_cents')::bigint / 100.0, 'FM999990D00');
    END IF;
  END IF;

  v_total := GREATEST(0, v_subtotal - v_discount + v_fee);
  v_order_number := '#BH-' || nextval('public.order_number_seq');
  v_token := 'gst_' || encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.orders (
    id, order_number, customer_id, customer_name, customer_phone, fulfillment_type,
    status, payment_status, payment_method, delivery_address_snapshot,
    subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
    customer_notes, estimated_delivery_time, guest_token_hash, coupon_code, cash_change_for_cents,
    delivery_distance_m, delivery_duration_s
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
    CASE WHEN v_method = 'CASH_ON_DELIVERY' THEN NULLIF((p_payload->>'cash_change_for_cents')::bigint, 0) ELSE NULL END,
    (v_delivery->>'distance_m')::int, (v_delivery->>'duration_s')::int
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
-- 6. RASTREIO AO VIVO: última posição do entregador em rota
-- Só existe enquanto ele tem pedido EM_ENTREGA; o cliente vê só a do seu pedido.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courier_locations (
  courier_id UUID PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m REAL,
  heading REAL,
  speed_mps REAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin e o próprio entregador veem a posição" ON public.courier_locations;
CREATE POLICY "Admin e o próprio entregador veem a posição" ON public.courier_locations
  FOR SELECT USING (public.is_admin() OR courier_id = public.current_courier_id());
-- Escrita só pela função courier_report_location
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.courier_locations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.courier_report_location(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy REAL DEFAULT NULL,
  p_heading REAL DEFAULT NULL,
  p_speed REAL DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_courier_id UUID := public.current_courier_id();
BEGIN
  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'Apenas entregadores ativos compartilham localização.';
  END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas.';
  END IF;

  -- Fora de rota a posição não é guardada
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE assigned_courier_id = v_courier_id AND status = 'EM_ENTREGA') THEN
    DELETE FROM public.courier_locations WHERE courier_id = v_courier_id;
    RETURN jsonb_build_object('tracking', FALSE);
  END IF;

  INSERT INTO public.courier_locations (courier_id, latitude, longitude, accuracy_m, heading, speed_mps, updated_at)
  VALUES (v_courier_id, p_latitude, p_longitude, p_accuracy, p_heading, p_speed, NOW())
  ON CONFLICT (courier_id) DO UPDATE
  SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, accuracy_m = EXCLUDED.accuracy_m,
      heading = EXCLUDED.heading, speed_mps = EXCLUDED.speed_mps, updated_at = NOW();
  RETURN jsonb_build_object('tracking', TRUE);
END;
$$;

-- Ao terminar a última entrega em rota, a posição do entregador é apagada
CREATE OR REPLACE FUNCTION public.clear_courier_location()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'EM_ENTREGA' AND NEW.status <> 'EM_ENTREGA' AND OLD.assigned_courier_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.orders
       WHERE assigned_courier_id = OLD.assigned_courier_id AND status = 'EM_ENTREGA' AND id <> NEW.id
     ) THEN
    DELETE FROM public.courier_locations WHERE courier_id = OLD.assigned_courier_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_courier_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clear_courier_location ON public.orders;
CREATE TRIGGER trg_clear_courier_location
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.clear_courier_location();

-- Posição do entregador para quem pode ver o pedido (cliente logado, link do convidado,
-- equipe). Só durante a entrega e só se a posição tiver menos de 10 minutos.
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order_id UUID, p_guest_token TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_loc public.courier_locations%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT (
    public.can_read_order(p_order_id)
    OR (p_guest_token IS NOT NULL AND length(p_guest_token) >= 20
        AND v_order.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex'))
  ) THEN
    RETURN NULL;
  END IF;

  IF v_order.status <> 'EM_ENTREGA' OR v_order.assigned_courier_id IS NULL THEN
    RETURN jsonb_build_object('active', FALSE, 'status', v_order.status);
  END IF;

  SELECT * INTO v_loc FROM public.courier_locations
  WHERE courier_id = v_order.assigned_courier_id AND updated_at > NOW() - INTERVAL '10 minutes';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', TRUE, 'status', v_order.status, 'courier_name', v_order.assigned_courier_name,
                              'has_location', FALSE);
  END IF;
  RETURN jsonb_build_object(
    'active', TRUE,
    'status', v_order.status,
    'courier_name', v_order.assigned_courier_name,
    'has_location', TRUE,
    'latitude', v_loc.latitude,
    'longitude', v_loc.longitude,
    'heading', v_loc.heading,
    'updated_at', v_loc.updated_at
  );
END;
$$;

-- Painel: o servidor já tem o token? A loja já está no mapa?
CREATE OR REPLACE FUNCTION public.admin_mapbox_status()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores.';
  END IF;
  RETURN jsonb_build_object(
    'server_token', EXISTS (SELECT 1 FROM private.app_secrets WHERE name = 'mapbox_server_token' AND value <> ''),
    'store_location', EXISTS (SELECT 1 FROM public.store_settings WHERE store_latitude IS NOT NULL AND store_longitude IS NOT NULL),
    'calls_today', (SELECT count(*) FROM private.mapbox_calls WHERE called_at > NOW() - INTERVAL '1 day')
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. PERMISSÕES E REALTIME
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mapbox_get(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_route(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_delivery(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order_core(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_delivery(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_delivery(JSONB) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.courier_report_location(DOUBLE PRECISION, DOUBLE PRECISION, REAL, REAL, REAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_report_location(DOUBLE PRECISION, DOUBLE PRECISION, REAL, REAL, REAL) TO authenticated;
REVOKE ALL ON FUNCTION public.get_order_tracking(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(UUID, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_mapbox_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mapbox_status() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'courier_locations'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_locations;
  END IF;
END $$;

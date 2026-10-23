-- ==============================================================================
-- BURGER HUB - EXPANSÃO DO PAINEL ADMINISTRATIVO, ENTREGADORES E STORAGE
-- Migração: 20261023000003_couriers_and_catalog_expansion.sql
-- ==============================================================================

-- 1. ENUMS OPERACIONAIS DE ENTREGADORES
DO $$ BEGIN
  CREATE TYPE courier_vehicle_enum AS ENUM ('MOTO', 'BICICLETA', 'CARRO', 'OUTRO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE courier_status_enum AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA DEDICADA DE ENTREGADORES (COURIERS)
CREATE TABLE IF NOT EXISTS public.couriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  photo_url TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT DEFAULT 'São Paulo',
  state TEXT DEFAULT 'SP',
  admin_notes TEXT,
  vehicle_type courier_vehicle_enum NOT NULL DEFAULT 'MOTO',
  vehicle_model TEXT,
  vehicle_color TEXT,
  vehicle_plate TEXT,
  status courier_status_enum NOT NULL DEFAULT 'ATIVO',
  is_available_for_orders BOOLEAN NOT NULL DEFAULT TRUE,
  service_areas TEXT[] NOT NULL DEFAULT '{}',
  total_deliveries_count INT NOT NULL DEFAULT 0,
  completed_deliveries_count INT NOT NULL DEFAULT 0,
  average_rating NUMERIC(3, 2) DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta de entregadores
CREATE INDEX IF NOT EXISTS idx_couriers_user_id ON public.couriers(user_id);
CREATE INDEX IF NOT EXISTS idx_couriers_status ON public.couriers(status);
CREATE INDEX IF NOT EXISTS idx_couriers_available ON public.couriers(is_available_for_orders);

-- 3. EXPANSÃO DA TABELA DE PRODUTOS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ingredients TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS promotional_price_cents BIGINT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INT DEFAULT 0;

-- 4. EXPANSÃO DA TABELA DE CONFIGURAÇÕES DA HAMBURGUERIA
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS store_status TEXT DEFAULT 'OPEN';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS pickup_instructions TEXT DEFAULT 'Apresente o número do seu pedido no balcão principal na entrada da loja.';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS detailed_hours JSONB;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS accepted_payment_methods TEXT[] DEFAULT '{"PIX_ONLINE", "CARD_ONLINE", "CARD_ON_DELIVERY", "CASH_ON_DELIVERY"}';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS customer_announcement JSONB;

-- 5. ATIVAÇÃO DE RLS NA TABELA DE ENTREGADORES
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

-- Política 1: Administradores têm controle total sobre entregadores
DROP POLICY IF EXISTS "Admins possuem controle total de entregadores" ON public.couriers;
CREATE POLICY "Admins possuem controle total de entregadores"
  ON public.couriers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Política 2: Entregador autenticado pode consultar seu próprio cadastro
DROP POLICY IF EXISTS "Entregadores consultam seu próprio cadastro" ON public.couriers;
CREATE POLICY "Entregadores consultam seu próprio cadastro"
  ON public.couriers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 6. CONFIGURAÇÃO DE BUCKETS DO SUPABASE STORAGE
-- Insere os buckets se não existirem
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('couriers', 'couriers', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Políticas de Storage para Produtos (Público lê fotos de cardápio, apenas Admin altera)
DROP POLICY IF EXISTS "Public pode ver imagens de produtos" ON storage.objects;
CREATE POLICY "Public pode ver imagens de produtos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'products');

DROP POLICY IF EXISTS "Admin gerencia imagens de produtos" ON storage.objects;
CREATE POLICY "Admin gerencia imagens de produtos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'products' AND public.is_admin())
  WITH CHECK (bucket_id = 'products' AND public.is_admin());

-- Políticas de Storage para Entregadores (Apenas Admin e o próprio entregador)
DROP POLICY IF EXISTS "Admin gerencia fotos de entregadores" ON storage.objects;
CREATE POLICY "Admin gerencia fotos de entregadores"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'couriers' AND (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1])))
  WITH CHECK (bucket_id = 'couriers' AND (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1])));

-- 7. FUNÇÃO RPC PARA VINCULAR CONTA DE USUÁRIO A ENTREGADOR
CREATE OR REPLACE FUNCTION public.admin_link_courier_user(
  p_courier_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_courier_name TEXT;
  v_user_email TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem vincular entregadores a contas.';
  END IF;

  SELECT full_name INTO v_courier_name FROM public.couriers WHERE id = p_courier_id;
  IF v_courier_name IS NULL THEN
    RAISE EXCEPTION 'Entregador com ID % não encontrado.', p_courier_id;
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = p_user_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Usuário com ID % não encontrado nos perfis.', p_user_id;
  END IF;

  -- Atualiza o perfil para DELIVERY
  UPDATE public.profiles
  SET role = 'DELIVERY', is_active = TRUE, updated_at = NOW()
  WHERE id = p_user_id;

  -- Vincula ao entregador
  UPDATE public.couriers
  SET user_id = p_user_id, email = v_user_email, updated_at = NOW()
  WHERE id = p_courier_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'LINK_COURIER_ACCOUNT',
    'couriers',
    p_courier_id::text,
    jsonb_build_object('courier_name', v_courier_name, 'user_id', p_user_id, 'email', v_user_email)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Entregador vinculado à conta com sucesso.');
END;
$$;

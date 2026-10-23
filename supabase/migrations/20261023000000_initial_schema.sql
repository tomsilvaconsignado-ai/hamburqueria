-- ==============================================================================
-- BURGER HUB & PITTU - BANCO DE DADOS POSTGRESQL (SUPABASE)
-- Migração Inicial: Tabelas, Tipos Enumerados, Chaves Estrangeiras e Índices
-- Fuso Horário Padrão: America/Sao_Paulo
-- ==============================================================================

SET timezone = 'America/Sao_Paulo';

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS
CREATE TYPE user_role_enum AS ENUM ('CUSTOMER', 'ADMIN', 'KITCHEN', 'DELIVERY');
CREATE TYPE order_status_enum AS ENUM (
  'AGUARDANDO_CONFIRMACAO',
  'CONFIRMADO',
  'EM_PREPARACAO',
  'PRONTO',
  'AGUARDANDO_RETIRADA',
  'EM_ENTREGA',
  'CONCLUIDO',
  'CANCELADO'
);
CREATE TYPE fulfillment_type_enum AS ENUM ('DELIVERY', 'PICKUP');
CREATE TYPE payment_method_enum AS ENUM ('PIX_ONLINE', 'CARD_ONLINE', 'CARD_ON_DELIVERY', 'CASH_ON_DELIVERY');
CREATE TYPE payment_status_enum AS ENUM (
  'PENDENTE',
  'EM_PROCESSAMENTO',
  'PAGO',
  'RECUSADO',
  'CANCELADO',
  'REEMBOLSO_PENDENTE',
  'REEMBOLSADO',
  'PAGAMENTO_NA_ENTREGA',
  'PAGO_NA_ENTREGA'
);
CREATE TYPE delivery_status_enum AS ENUM ('ATRIBUIDA', 'COLETADA', 'EM_ROTA', 'ENTREGUE', 'FALHOU', 'CANCELADA');

-- 2. TABELA: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role user_role_enum NOT NULL DEFAULT 'CUSTOMER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: customer_addresses
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Casa',
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'São Paulo',
  state VARCHAR(2) NOT NULL DEFAULT 'SP',
  reference TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABELA: categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_path TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABELA: products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  preparation_time_minutes INT NOT NULL DEFAULT 20,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TABELA: option_groups
CREATE TABLE IF NOT EXISTS public.option_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL CHECK (selection_type IN ('SINGLE', 'MULTIPLE')),
  min_selections INT NOT NULL DEFAULT 0,
  max_selections INT NOT NULL DEFAULT 1,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TABELA: product_option_groups
CREATE TABLE IF NOT EXISTS public.product_option_groups (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  option_group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, option_group_id)
);

-- 8. TABELA: product_options
CREATE TABLE IF NOT EXISTS public.product_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  option_group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta_cents BIGINT NOT NULL DEFAULT 0 CHECK (price_delta_cents >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TABELA: orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  fulfillment_type fulfillment_type_enum NOT NULL DEFAULT 'DELIVERY',
  status order_status_enum NOT NULL DEFAULT 'AGUARDANDO_CONFIRMACAO',
  payment_status payment_status_enum NOT NULL DEFAULT 'PENDENTE',
  payment_method payment_method_enum NOT NULL,
  delivery_address_snapshot JSONB,
  subtotal_cents BIGINT NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents BIGINT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  delivery_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
  customer_notes TEXT,
  cancellation_reason TEXT,
  estimated_delivery_time TIMESTAMPTZ,
  guest_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. TABELA: order_items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  quantity INT NOT NULL CHECK (quantity > 0),
  notes TEXT,
  line_total_cents BIGINT NOT NULL CHECK (line_total_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. TABELA: order_item_options
CREATE TABLE IF NOT EXISTS public.order_item_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  option_id UUID REFERENCES public.product_options(id) ON DELETE SET NULL,
  option_name_snapshot TEXT NOT NULL,
  unit_price_delta_cents BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_delta_cents >= 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total_cents BIGINT NOT NULL CHECK (line_total_cents >= 0)
);

-- 12. TABELA: payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'MANUAL',
  provider_payment_id TEXT UNIQUE,
  method payment_method_enum NOT NULL,
  status payment_status_enum NOT NULL DEFAULT 'PENDENTE',
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  external_reference TEXT,
  checkout_url TEXT,
  pix_qr_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. TABELA: deliveries
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status delivery_status_enum NOT NULL DEFAULT 'ATRIBUIDA',
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_at TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. TABELA: delivery_zones
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  neighborhoods JSONB NOT NULL DEFAULT '[]'::jsonb,
  fee_cents BIGINT NOT NULL CHECK (fee_cents >= 0),
  minimum_order_cents BIGINT NOT NULL DEFAULT 0 CHECK (minimum_order_cents >= 0),
  estimated_minutes INT NOT NULL DEFAULT 35,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 15. TABELA: store_settings
CREATE TABLE IF NOT EXISTS public.store_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_name TEXT NOT NULL DEFAULT 'Burger Hub',
  logo_path TEXT,
  phone TEXT NOT NULL DEFAULT '+55 (11) 98765-4321',
  address TEXT NOT NULL DEFAULT 'Rua dos Hamburgers, 100 - São Paulo, SP',
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  accepting_orders BOOLEAN NOT NULL DEFAULT TRUE,
  opening_hours JSONB NOT NULL DEFAULT '{"weekdays": "18:00 - 23:30", "weekends": "18:00 - 00:30"}'::jsonb,
  minimum_order_cents BIGINT NOT NULL DEFAULT 2000,
  default_preparation_minutes INT NOT NULL DEFAULT 25,
  delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo'
);

-- 16. TABELA: order_status_history
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status order_status_enum,
  new_status order_status_enum NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. TABELA: notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. TABELA: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier ON public.deliveries(courier_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_available ON public.products(is_available);

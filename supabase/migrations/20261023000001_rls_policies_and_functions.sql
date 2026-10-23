-- ==============================================================================
-- BURGER HUB & PITTU - POLÍTICAS DE SEGURANÇA (RLS) E FUNÇÕES SEGURAS
-- ==============================================================================

-- 1. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO (SECURITY DEFINER sem recursão)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role_enum
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role user_role_enum;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid() AND is_active = TRUE;
  
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.get_current_user_role() = 'ADMIN';
$$;

CREATE OR REPLACE FUNCTION public.is_kitchen()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.get_current_user_role() IN ('ADMIN', 'KITCHEN');
$$;

CREATE OR REPLACE FUNCTION public.is_courier()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.get_current_user_role() IN ('ADMIN', 'DELIVERY');
$$;

-- 2. ATIVAÇÃO DE RLS EM TODAS AS TABELAS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS DE CATÁLOGO (PÚBLICO LEITURA, ADMIN ESCRITA)
CREATE POLICY "Catalogo público para todos" ON public.categories
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Admin gerencia categorias" ON public.categories
  FOR ALL USING (public.is_admin());

CREATE POLICY "Produtos públicos para todos" ON public.products
  FOR SELECT USING (is_available = TRUE OR public.is_admin());

CREATE POLICY "Admin gerencia produtos" ON public.products
  FOR ALL USING (public.is_admin());

CREATE POLICY "Grupos de opcionais públicos" ON public.option_groups
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Admin gerencia grupos opcionais" ON public.option_groups
  FOR ALL USING (public.is_admin());

CREATE POLICY "Opcionais de produto públicos" ON public.product_options
  FOR SELECT USING (is_available = TRUE OR public.is_admin());

CREATE POLICY "Admin gerencia opcionais de produto" ON public.product_options
  FOR ALL USING (public.is_admin());

-- 4. POLÍTICAS DE PERFIS
CREATE POLICY "Usuário consulta seu próprio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Usuário atualiza dados pessoais" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())); -- Impede auto-promoção

CREATE POLICY "Admin gerencia todos os perfis" ON public.profiles
  FOR ALL USING (public.is_admin());

-- 5. POLÍTICAS DE ENDEREÇOS
CREATE POLICY "Cliente administra seus endereços" ON public.customer_addresses
  FOR ALL USING (auth.uid() = customer_id OR public.is_admin());

-- 6. POLÍTICAS DE PEDIDOS (ORDERS)
CREATE POLICY "Cliente consulta seus próprios pedidos" ON public.orders
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND customer_id = auth.uid()) OR
    public.is_kitchen() OR
    public.is_courier() OR
    public.is_admin()
  );

CREATE POLICY "Admin administra pedidos" ON public.orders
  FOR ALL USING (public.is_admin());

CREATE POLICY "Cozinha atualiza status de preparo" ON public.orders
  FOR UPDATE USING (public.is_kitchen())
  WITH CHECK (public.is_kitchen());

-- 7. POLÍTICAS DE ITENS DE PEDIDO
CREATE POLICY "Leitura de itens de pedido autorizada" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND (
        o.customer_id = auth.uid() OR
        public.is_kitchen() OR
        public.is_courier() OR
        public.is_admin()
      )
    )
  );

-- 8. POLÍTICAS DE ENTREGAS (DELIVERIES)
CREATE POLICY "Entregador consulta apenas suas entregas" ON public.deliveries
  FOR SELECT USING (
    (courier_id = auth.uid() AND public.is_courier()) OR
    public.is_admin()
  );

CREATE POLICY "Entregador atualiza status de suas entregas" ON public.deliveries
  FOR UPDATE USING (
    courier_id = auth.uid() AND public.is_courier()
  ) WITH CHECK (
    courier_id = auth.uid() AND public.is_courier()
  );

CREATE POLICY "Admin gerencia todas as entregas" ON public.deliveries
  FOR ALL USING (public.is_admin());

-- 9. POLÍTICAS DE CONFIGURAÇÕES E ZONAS (LEITURA PÚBLICA, ESCRITA ADMIN)
CREATE POLICY "Configurações públicas para leitura" ON public.store_settings
  FOR SELECT USING (TRUE);

CREATE POLICY "Admin gerencia configurações" ON public.store_settings
  FOR ALL USING (public.is_admin());

CREATE POLICY "Zonas de entrega públicas para leitura" ON public.delivery_zones
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "Admin gerencia zonas de entrega" ON public.delivery_zones
  FOR ALL USING (public.is_admin());

-- 10. POLÍTICAS DE NOTIFICAÇÕES
CREATE POLICY "Usuário consulta suas notificações" ON public.notifications
  FOR SELECT USING (
    recipient_id = auth.uid() OR
    public.is_admin()
  );

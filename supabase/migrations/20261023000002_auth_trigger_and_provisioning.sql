-- ==============================================================================
-- BURGER HUB - AUTENTICAÇÃO, TRIGGER DE PERFIS E PROVISIONAMENTO SEGURO
-- Migração: 20261023000002_auth_trigger_and_provisioning.sql
-- ==============================================================================

-- 1. Garante coluna email em public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

-- 2. TRIGGER SEGURO: Criação automática de perfil no cadastro público
-- REGRA DE SEGURANÇA CRÍTICA:
-- O cadastro público SEMPRE recebe role = 'CUSTOMER'.
-- NUNCA confia em role ou privilégios passados no payload do cliente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'Cliente'), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'CUSTOMER', -- Forçado estritamente no banco de dados!
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Vincula a trigger à tabela auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. PROCEDIMENTO SEGURO: Provisionar o Primeiro Administrador
-- Esta função só pode ser executada por administradores ou via console SQL com privilégios.
CREATE OR REPLACE FUNCTION public.provision_initial_admin(admin_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_count INT;
BEGIN
  -- Se já existirem administradores ativos, exige que o autor da chamada seja ADMIN
  SELECT COUNT(*) INTO v_current_count
  FROM public.profiles
  WHERE role = 'ADMIN' AND is_active = TRUE;

  IF v_current_count > 0 THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Acesso negado: apenas um administrador existente pode promover outros administradores.';
    END IF;
  END IF;

  -- Localiza o usuário cadastrado pelo e-mail
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(admin_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário com o e-mail % não foi encontrado no Supabase Auth. Crie a conta primeiro.', admin_email;
  END IF;

  -- Atualiza o perfil para ADMIN
  UPDATE public.profiles
  SET
    role = 'ADMIN',
    is_active = TRUE,
    updated_at = NOW()
  WHERE id = v_user_id;

  -- Log de auditoria
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'PROVISION_ADMIN',
    'profiles',
    v_user_id::text,
    jsonb_build_object('email', admin_email, 'promoted_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Administrador provisionado com sucesso.', 'user_id', v_user_id);
END;
$$;

-- 4. PROCEDIMENTO SEGURO: Administrador Cadastrar Membro da Equipe (Cozinha ou Entregador)
CREATE OR REPLACE FUNCTION public.admin_create_staff_profile(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role user_role_enum
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem cadastrar funcionários.';
  END IF;

  IF p_role NOT IN ('KITCHEN', 'DELIVERY') THEN
    RAISE EXCEPTION 'Função inválida para membro da equipe. Apenas KITCHEN ou DELIVERY são permitidos.';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, role, is_active, created_at, updated_at)
  VALUES (p_user_id, LOWER(TRIM(p_email)), p_full_name, p_phone, p_role, TRUE, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    is_active = TRUE,
    updated_at = NOW();

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'CREATE_STAFF_MEMBER',
    'profiles',
    p_user_id::text,
    jsonb_build_object('email', p_email, 'role', p_role, 'name', p_full_name)
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$$;

-- 5. PROCEDIMENTO SEGURO: Ativar / Desativar Usuário
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(p_user_id UUID, p_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role user_role_enum;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar o status de usuários.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Operação inválida: um administrador não pode desativar a própria conta.';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;

  UPDATE public.profiles
  SET is_active = p_active, updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'TOGGLE_USER_ACTIVE',
    'profiles',
    p_user_id::text,
    jsonb_build_object('is_active', p_active, 'role', v_target_role)
  );

  RETURN jsonb_build_object('success', true, 'is_active', p_active);
END;
$$;

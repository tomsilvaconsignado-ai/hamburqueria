import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import {
  IS_DEMO_MODE,
  getProfiles,
  getActiveProfile,
  setActiveProfile,
  saveProfile,
  toggleUserStatus,
  provisionFirstAdmin,
  getProfileByEmail,
} from './storage';
import type { Result } from './remote';
import { appUrl } from '../lib/appUrl';
import { UserProfile, UserRole } from '../types';

export interface SignUpParams {
  email: string;
  password: string;
  full_name: string;
  phone: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface CreateStaffParams {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: 'KITCHEN' | 'DELIVERY';
}

type AuthResult = { success: boolean; profile?: UserProfile; error?: string };

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) return null;
  return data as UserProfile;
}

export const authService = {
  /**
   * Retorna o perfil do usuário logado na sessão ativa.
   * No Supabase o perfil vem sempre do banco (nunca de dados locais).
   */
  async getCurrentProfile(): Promise<UserProfile | null> {
    if (isSupabaseConfigured && supabase) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setActiveProfile(null);
        return null;
      }

      const profile = await fetchProfile(session.user.id);
      if (!profile || !profile.is_active) {
        if (profile && !profile.is_active) await supabase.auth.signOut();
        setActiveProfile(null);
        return null;
      }

      setActiveProfile(profile);
      return profile;
    }

    return getActiveProfile();
  },

  /**
   * Cadastro público de clientes: sempre role = 'CUSTOMER'
   * (forçado pela trigger handle_new_user no banco).
   */
  async signUp(params: SignUpParams): Promise<AuthResult> {
    const cleanEmail = params.email.trim().toLowerCase();

    if (!cleanEmail || !params.full_name.trim() || !params.phone.trim()) {
      return { success: false, error: 'Por favor, preencha todos os campos obrigatórios.' };
    }
    if (!params.password || params.password.length < 6) {
      return { success: false, error: 'A senha deve ter no mínimo 6 caracteres.' };
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: params.password,
        options: {
          data: { full_name: params.full_name.trim(), phone: params.phone.trim() },
          emailRedirectTo: appUrl('/login'),
        },
      });

      if (error) return { success: false, error: error.message };
      if (!data.user) return { success: false, error: 'Não foi possível concluir o cadastro.' };

      // Confirmação de e-mail habilitada: ainda não há sessão
      if (!data.session) {
        return {
          success: false,
          error: 'Cadastro realizado! Confirme seu e-mail pelo link que enviamos e depois faça login.',
        };
      }

      const profile = await fetchProfile(data.user.id);
      if (!profile) return { success: false, error: 'Conta criada, mas o perfil ainda não está disponível. Faça login.' };
      setActiveProfile(profile);
      return { success: true, profile };
    }

    // Modo demonstração
    if (getProfileByEmail(cleanEmail)) {
      return { success: false, error: 'Já existe uma conta cadastrada com este e-mail. Faça login.' };
    }

    const now = new Date().toISOString();
    const newProfile: UserProfile = {
      id: `usr-${Date.now()}`,
      email: cleanEmail,
      full_name: params.full_name.trim(),
      phone: params.phone.trim(),
      role: 'CUSTOMER',
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    saveProfile(newProfile);
    setActiveProfile(newProfile);
    return { success: true, profile: newProfile };
  },

  /**
   * Login por e-mail e senha.
   */
  async signIn(params: SignInParams): Promise<AuthResult> {
    const cleanEmail = params.email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      if (!params.password) return { success: false, error: 'Informe sua senha.' };

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: params.password,
      });
      if (error || !data.user) {
        return { success: false, error: 'Credenciais inválidas. Verifique seu e-mail e senha.' };
      }

      const profile = await fetchProfile(data.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        return { success: false, error: 'Perfil não encontrado no banco de dados.' };
      }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        setActiveProfile(null);
        return {
          success: false,
          error: 'Sua conta está desativada pela administração. Entre em contato com a hamburgueria.',
        };
      }

      setActiveProfile(profile);
      return { success: true, profile };
    }

    // Modo demonstração: contas fictícias locais, sem verificação de senha
    const found = getProfileByEmail(cleanEmail);
    if (!found) {
      return { success: false, error: 'Nenhuma conta encontrada com este e-mail. Cadastre-se primeiro.' };
    }
    if (!found.is_active) {
      return {
        success: false,
        error: 'Sua conta está desativada pela administração. Entre em contato com a hamburgueria.',
      };
    }

    setActiveProfile(found);
    return { success: true, profile: found };
  },

  async signOut(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error('Supabase signout error:', e);
      }
    }
    setActiveProfile(null);
  },

  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: appUrl('/recuperar-senha'),
      });
      if (error) return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `Se houver uma conta associada a ${cleanEmail}, você receberá instruções para redefinir sua senha.`,
    };
  },

  /**
   * Administrador cadastra membro da equipe (COZINHA ou ENTREGADOR).
   * No Supabase usa a Edge Function `admin-create-staff`, que valida o papel do chamador.
   */
  async createStaffMember(params: CreateStaffParams): Promise<AuthResult> {
    const currentUser = getActiveProfile();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem cadastrar funcionários.' };
    }
    if (params.role !== 'KITCHEN' && params.role !== 'DELIVERY') {
      return { success: false, error: 'Função de equipe inválida. Apenas COZINHA ou ENTREGADOR.' };
    }

    const cleanEmail = params.email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      if (!params.password || params.password.length < 8) {
        return { success: false, error: 'A senha inicial precisa ter pelo menos 8 caracteres.' };
      }
      const { data, error } = await supabase.functions.invoke('admin-create-staff', {
        body: {
          email: cleanEmail,
          password: params.password,
          full_name: params.full_name.trim(),
          phone: params.phone.trim(),
          role: params.role,
        },
      });
      if (error) {
        let message = 'Falha ao cadastrar funcionário.';
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) message = body.error;
        } catch {
          // mantém mensagem padrão
        }
        return { success: false, error: message };
      }
      return { success: true, profile: data?.profile as UserProfile };
    }

    if (getProfileByEmail(cleanEmail)) {
      return { success: false, error: 'Já existe uma conta com este e-mail.' };
    }
    const now = new Date().toISOString();
    const newStaff: UserProfile = {
      id: `staff-${Date.now()}`,
      email: cleanEmail,
      full_name: params.full_name.trim(),
      phone: params.phone.trim(),
      role: params.role,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    saveProfile(newStaff);
    return { success: true, profile: newStaff };
  },

  async toggleUserActive(userId: string, isActive: boolean): Promise<Result> {
    const currentUser = getActiveProfile();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem ativar ou desativar contas.' };
    }
    return toggleUserStatus(userId, isActive);
  },

  /**
   * Promove uma conta existente a ADMIN. No Supabase exige que o chamador já seja
   * ADMIN; o primeiro administrador é criado pelo SQL Editor (ver README).
   */
  provisionFirstAdmin(email: string): Promise<{ success: boolean; message: string }> {
    return provisionFirstAdmin(email);
  },

  getRedirectPathForRole(role: UserRole): string {
    switch (role) {
      case 'CUSTOMER':
        return '/minha-conta';
      case 'ADMIN':
        return '/admin';
      case 'KITCHEN':
        return '/cozinha';
      case 'DELIVERY':
        return '/entregador';
      default:
        return '/';
    }
  },

  /** Somente modo demonstração: troca rápida de perfil sem login. */
  switchRole(role: UserRole): UserProfile | null {
    if (!IS_DEMO_MODE) return null;
    const profiles = getProfiles();
    const found = profiles.find((p) => p.role === role && p.is_active) || null;
    setActiveProfile(found);
    return found;
  },

  getAllProfiles(): UserProfile[] {
    return getProfiles();
  },
};

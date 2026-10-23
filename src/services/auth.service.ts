import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import {
  getProfiles,
  getActiveProfile,
  setActiveProfile,
  saveProfile,
  toggleUserStatus,
  provisionFirstAdmin,
  getProfileByEmail,
} from './storage';
import { UserProfile, UserRole } from '../types';

export interface SignUpParams {
  email: string;
  password?: string;
  full_name: string;
  phone: string;
}

export interface SignInParams {
  email: string;
  password?: string;
}

export interface CreateStaffParams {
  email: string;
  password?: string;
  full_name: string;
  phone: string;
  role: 'KITCHEN' | 'DELIVERY';
}

export const authService = {
  /**
   * Retorna o perfil do usuário logado na sessão ativa
   */
  async getCurrentProfile(): Promise<UserProfile | null> {
    if (isSupabaseConfigured && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setActiveProfile(null);
        return null;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error || !profile) {
        // Se a trigger ainda não tiver criado ou falhar, fallback de busca local
        const local = getProfileByEmail(session.user.email || '');
        if (local) return local;
        return null;
      }

      setActiveProfile(profile as UserProfile);
      return profile as UserProfile;
    }

    return getActiveProfile();
  },

  /**
   * Cadastro público de clientes:
   * REGRA DE SEGURANÇA: Todo cadastro público recebe role = 'CUSTOMER'.
   * O frontend e o banco forçam isso estritamente.
   */
  async signUp(params: SignUpParams): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    const cleanEmail = params.email.trim().toLowerCase();

    if (!cleanEmail || !params.full_name.trim() || !params.phone.trim()) {
      return { success: false, error: 'Por favor, preencha todos os campos obrigatórios.' };
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: params.password || 'SenhaP@ss123!',
        options: {
          data: {
            full_name: params.full_name.trim(),
            phone: params.phone.trim(),
            // NUNCA envia role administrativa pelo cliente
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Busca o perfil gerado pela trigger handle_new_user
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        const userProfile: UserProfile = (profile as UserProfile) || {
          id: data.user.id,
          email: cleanEmail,
          full_name: params.full_name.trim(),
          phone: params.phone.trim(),
          role: 'CUSTOMER',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        setActiveProfile(userProfile);
        return { success: true, profile: userProfile };
      }
    }

    // Modo local / Fallback
    const existing = getProfileByEmail(cleanEmail);
    if (existing) {
      return { success: false, error: 'Já existe uma conta cadastrada com este e-mail. Faça login.' };
    }

    const newProfile: UserProfile = {
      id: `usr-${Date.now()}`,
      email: cleanEmail,
      full_name: params.full_name.trim(),
      phone: params.phone.trim(),
      role: 'CUSTOMER', // Restrição estrita: sempre cliente!
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveProfile(newProfile);
    setActiveProfile(newProfile);

    return { success: true, profile: newProfile };
  },

  /**
   * Login por e-mail e senha
   */
  async signIn(params: SignInParams): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    const cleanEmail = params.email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: params.password || 'SenhaP@ss123!',
      });

      if (error) {
        return { success: false, error: 'Credenciais inválidas. Verifique seu e-mail e senha.' };
      }

      if (data.user) {
        const { data: profile, error: pError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (pError || !profile) {
          return { success: false, error: 'Perfil não encontrado no banco de dados.' };
        }

        // Bloqueio rigoroso de conta inativa
        if (!profile.is_active) {
          await supabase.auth.signOut();
          setActiveProfile(null);
          return {
            success: false,
            error: 'Sua conta está desativada pela administração. Entre em contato com a hamburgueria.',
          };
        }

        const userProfile = profile as UserProfile;
        setActiveProfile(userProfile);
        return { success: true, profile: userProfile };
      }
    }

    // Modo local / Fallback
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

  /**
   * Logout do usuário
   */
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

  /**
   * Recuperação de senha
   */
  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/recuperar-senha`,
      });
      if (error) {
        return { success: false, message: error.message };
      }
    }

    return {
      success: true,
      message: `Se houver uma conta associada a ${cleanEmail}, você receberá instruções para redefinir sua senha.`,
    };
  },

  /**
   * Administrador cadastra membro da equipe (COZINHA ou ENTREGADOR)
   * NUNCA pode ser chamado por clientes comuns.
   */
  async createStaffMember(params: CreateStaffParams): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    const currentUser = getActiveProfile();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem cadastrar funcionários.' };
    }

    if (params.role !== 'KITCHEN' && params.role !== 'DELIVERY') {
      return { success: false, error: 'Função de equipe inválida. Apenas COZINHA ou ENTREGADOR.' };
    }

    const cleanEmail = params.email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      // Chama a função segura RPC admin_create_staff_profile
      const { data, error } = await supabase.rpc('admin_create_staff_profile', {
        p_user_id: crypto.randomUUID(),
        p_email: cleanEmail,
        p_full_name: params.full_name.trim(),
        p_phone: params.phone.trim(),
        p_role: params.role,
      });

      if (error) {
        return { success: false, error: error.message };
      }
    }

    const newStaff: UserProfile = {
      id: `staff-${Date.now()}`,
      email: cleanEmail,
      full_name: params.full_name.trim(),
      phone: params.phone.trim(),
      role: params.role,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveProfile(newStaff);
    return { success: true, profile: newStaff };
  },

  /**
   * Administrador ativa ou desativa um usuário
   */
  async toggleUserActive(userId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    const currentUser = getActiveProfile();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem ativar ou desativar contas.' };
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.rpc('admin_toggle_user_status', {
        p_user_id: userId,
        p_active: isActive,
      });
      if (error) {
        return { success: false, error: error.message };
      }
    }

    return toggleUserStatus(userId, isActive);
  },

  /**
   * Procedimento seguro para provisionar o primeiro Administrador
   */
  async provisionFirstAdmin(email: string): Promise<{ success: boolean; message: string }> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc('provision_initial_admin', {
        admin_email: email.trim().toLowerCase(),
      });
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: data.message };
    }

    return provisionFirstAdmin(email);
  },

  /**
   * Rota de redirecionamento por perfil após o login
   */
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

  /**
   * Utilitário para troca rápida de perfil em modo de teste/demonstração
   */
  switchRole(role: UserRole): UserProfile {
    const profiles = getProfiles();
    const found = profiles.find((p) => p.role === role) || profiles[0];
    setActiveProfile(found);
    return found;
  },

  getAllProfiles(): UserProfile[] {
    return getProfiles();
  },
};

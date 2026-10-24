import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../../types';
import { authService, SignInParams, SignUpParams } from '../../services/auth.service';
import { IS_DEMO_MODE, subscribeToRealtime } from '../../services/storage';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (params: SignInParams) => Promise<{ success: boolean; profile?: UserProfile; error?: string }>;
  register: (params: SignUpParams) => Promise<{ success: boolean; profile?: UserProfile; error?: string }>;
  logout: () => Promise<void>;
  switchDemoRole: (role: UserRole) => UserProfile | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCurrentSession = async () => {
    try {
      const profile = await authService.getCurrentProfile();
      setUser(profile);
    } catch (e) {
      console.error('Session load error:', e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentSession();

    if (isSupabaseConfigured && supabase) {
      // Não chamar o Supabase de dentro do callback (pode travar o client); adia para o próximo tick
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          setUser(null);
        } else {
          setTimeout(loadCurrentSession, 0);
        }
      });
      return () => subscription.unsubscribe();
    }

    // Modo demonstração: perfil ativo pode mudar em outra aba ou pelo seletor de perfis
    if (IS_DEMO_MODE) {
      return subscribeToRealtime(() => {
        loadCurrentSession();
      });
    }
  }, []);

  const login = async (params: SignInParams) => {
    setLoading(true);
    const res = await authService.signIn(params);
    if (res.success && res.profile) setUser(res.profile);
    setLoading(false);
    return res;
  };

  const register = async (params: SignUpParams) => {
    setLoading(true);
    const res = await authService.signUp(params);
    if (res.success && res.profile) setUser(res.profile);
    setLoading(false);
    return res;
  };

  const logout = async () => {
    setLoading(true);
    await authService.signOut();
    setUser(null);
    setLoading(false);
  };

  const switchDemoRole = (role: UserRole) => {
    const updated = authService.switchRole(role);
    setUser(updated);
    return updated;
  };

  const refreshProfile = async () => {
    await loadCurrentSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : null,
        loading,
        isAuthenticated: Boolean(user && user.is_active),
        login,
        register,
        logout,
        switchDemoRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  return ctx;
};

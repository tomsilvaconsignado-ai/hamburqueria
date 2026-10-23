import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { UserRole } from '../../types';
import { ShieldAlert, Lock, ArrowLeft, RefreshCw } from 'lucide-react';
import { authService } from '../../services/auth.service';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  children,
}) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c12] flex flex-col items-center justify-center p-4 text-white space-y-4">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        <p className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
          Verificando credenciais e permissões de segurança...
        </p>
      </div>
    );
  }

  // Não autenticado -> redireciona para login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Usuário desativado -> bloqueio imediato
  if (!user.is_active) {
    return (
      <div className="min-h-screen bg-[#0a0c12] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="p-8 max-w-md w-full rounded-3xl bg-[#141622] border border-rose-500/40 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] text-rose-400">
            CONTA DESATIVADA
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Seu perfil de usuário foi desativado pela gerência da hamburgueria. O acesso a esta área restrita está temporariamente bloqueado.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Cardápio Público</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Permissão de perfil insuficiente -> bloqueio 403
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    const userDefaultPath = authService.getRedirectPathForRole(user.role);

    return (
      <div className="min-h-screen bg-[#0a0c12] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="p-8 max-w-md w-full rounded-3xl bg-[#141622] border border-amber-500/40 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] text-amber-400">
            ACESSO NÃO AUTORIZADO (403)
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Seu perfil de <strong>{user.role}</strong> não possui autorização para acessar esta página.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Link
              to={userDefaultPath}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition"
            >
              Ir para Minha Área ({user.role})
            </Link>
            <Link
              to="/"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-300 transition"
            >
              Cardápio Público
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

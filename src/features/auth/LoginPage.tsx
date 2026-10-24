import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Flame, Mail, Lock, AlertCircle, ArrowRight, Sparkles, User, ChefHat, Bike, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { IS_DEMO_MODE } from '../../services/storage';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await login({ email, password });
      if (!res.success || !res.profile) {
        setErrorMessage(res.error || 'Falha no login. Verifique seu e-mail e senha.');
        setLoading(false);
        return;
      }

      // Redirecionamento por perfil
      const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      const targetPath = fromPath || authService.getRedirectPathForRole(res.profile.role);
      navigate(targetPath, { replace: true });
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro inesperado ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('senha123');
    setLoading(true);
    const res = await login({ email: demoEmail, password: 'senha123' });
    setLoading(false);
    if (res.success && res.profile) {
      navigate(authService.getRedirectPathForRole(res.profile.role), { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center space-y-4">
        {/* Brand Logo */}
        <Link to="/" className="inline-flex items-center space-x-3 group">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-red-600 to-amber-700 p-0.5 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition">
            <div className="w-full h-full bg-[#0e1017] rounded-[14px] flex items-center justify-center">
              <Flame className="w-7 h-7 text-amber-500 fill-amber-500" />
            </div>
          </div>
          <div className="text-left">
            <span className="font-extrabold text-2xl tracking-wider text-white uppercase font-['Bebas_Neue',sans-serif]">
              BURGER HUB
            </span>
            <span className="block text-[10px] tracking-widest text-amber-400 font-semibold uppercase">
              Fast • Fresh • Delicious
            </span>
          </div>
        </Link>

        <div>
          <h2 className="text-2xl sm:text-3xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white">
            ENTRAR NA SUA CONTA
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Acesse seus pedidos, KDS de cozinha, entregas ou painel de gestão
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-[#12141d] border border-zinc-800/90 py-8 px-6 shadow-2xl rounded-3xl sm:px-10 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-3.5 py-3 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Senha
                </label>
                <Link
                  to="/recuperar-senha"
                  className="text-[11px] text-amber-400 hover:text-amber-300 transition"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-3.5 py-3 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-red-600/30 transition transform active:scale-98 cursor-pointer mt-2"
            >
              <span>{loading ? 'Entrando...' : 'Entrar'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Links for registration and guest */}
          <div className="pt-2 text-center text-xs text-zinc-400 space-y-2 border-t border-zinc-800/80">
            <p>
              Não tem uma conta ainda?{' '}
              <Link to="/cadastro" className="text-amber-400 font-bold hover:underline">
                Cadastre-se grátis
              </Link>
            </p>
            <p>
              Ou prefere pedir sem cadastro?{' '}
              <Link to="/" className="text-zinc-300 font-medium hover:text-white underline">
                Ver cardápio como visitante
              </Link>
            </p>
          </div>

          {/* Quick Demo Access Switcher (somente sem Supabase configurado) */}
          {IS_DEMO_MODE && (
          <div className="pt-4 border-t border-zinc-800/80 space-y-3">
            <div className="flex items-center space-x-1.5 text-xs text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-zinc-300">Acesso Rápido de Demonstração:</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('lucas.cliente@burgerhub.com.br')}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center space-x-2"
              >
                <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="truncate">
                  <p className="font-bold text-white">Cliente</p>
                  <p className="text-[10px] text-zinc-500 truncate">Lucas Ferreira</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('chef.andre@burgerhub.com.br')}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center space-x-2"
              >
                <ChefHat className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <div className="truncate">
                  <p className="font-bold text-white">Cozinha KDS</p>
                  <p className="text-[10px] text-zinc-500 truncate">Chef André</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('carlos.motoboy@burgerhub.com.br')}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center space-x-2"
              >
                <Bike className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <p className="font-bold text-white">Entregador</p>
                  <p className="text-[10px] text-zinc-500 truncate">Carlos Motoboy</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('admin@burgerhub.com.br')}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center space-x-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <div className="truncate">
                  <p className="font-bold text-white">Admin Geral</p>
                  <p className="text-[10px] text-zinc-500 truncate">Mariana Souza</p>
                </div>
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

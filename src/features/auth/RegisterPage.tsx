import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Flame, Mail, Lock, User, Phone, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 6) {
      setErrorMessage('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As senhas digitadas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      const res = await register({
        full_name: fullName,
        email,
        phone,
        password,
      });

      if (!res.success || !res.profile) {
        setErrorMessage(res.error || 'Erro ao realizar cadastro.');
        setLoading(false);
        return;
      }

      // Redireciona cliente registrado para /minha-conta
      navigate('/minha-conta', { replace: true });
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha na conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center space-y-4">
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
            CRIE SUA CONTA DE CLIENTE
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Cadastre-se para acompanhar pedidos, salvar endereços e ganhar 20% OFF
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-[#12141d] border border-zinc-800/90 py-8 px-6 shadow-2xl rounded-3xl sm:px-10 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                Nome Completo
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: Lucas Ferreira"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                WhatsApp / Telefone
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-500" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mín. 6 dígitos"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Seu cadastro garante <strong>perfil exclusivo de Cliente</strong> com acesso seguro aos seus pedidos e cupons da hamburgueria.
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-red-600/30 transition transform active:scale-98 cursor-pointer"
            >
              <span>{loading ? 'Cadastrando...' : 'Criar Minha Conta'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-zinc-400 space-y-2 border-t border-zinc-800/80">
            <p>
              Já possui uma conta cadastrada?{' '}
              <Link to="/login" className="text-amber-400 font-bold hover:underline">
                Faça login
              </Link>
            </p>
            <p>
              <Link to="/" className="text-zinc-400 hover:text-white underline">
                Voltar ao Cardápio sem login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

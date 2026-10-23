import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { authService } from '../../services/auth.service';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await authService.resetPassword(email);
      setSuccessMessage(res.message);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao solicitar recuperação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />

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
            RECUPERAÇÃO DE SENHA
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Informe o e-mail cadastrado para enviarmos as instruções de redefinição
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

          {successMessage ? (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{successMessage}</p>
              <Link
                to="/login"
                className="inline-flex items-center space-x-2 py-3 px-6 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para o Login</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                  Seu E-mail
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-red-600/30 transition transform active:scale-98 cursor-pointer"
              >
                <span>{loading ? 'Enviando...' : 'Enviar Link de Redefinição'}</span>
              </button>

              <div className="pt-2 text-center text-xs text-zinc-400">
                <Link to="/login" className="text-amber-400 font-bold hover:underline">
                  ← Lembrou sua senha? Fazer login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

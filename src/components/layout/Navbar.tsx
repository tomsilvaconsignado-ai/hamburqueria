import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Phone, Clock, Flame, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useCart } from '../../features/cart/CartContext';
import { authService } from '../../services/auth.service';
import { formatCentsToBRL } from '../../lib/formatters/currency';
import { StoreSettings } from '../../types';

interface NavbarProps {
  settings: StoreSettings;
  activeView?: 'store' | 'kitchen' | 'courier' | 'admin' | 'tracking';
  setActiveView?: (view: 'store' | 'kitchen' | 'courier' | 'admin' | 'tracking') => void;
  onOpenTracking: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  activeView = 'store',
  setActiveView,
  onOpenTracking,
}) => {
  const { totalItemsCount, subtotalCents, setIsCartOpen } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleUserAreaClick = () => {
    if (!user) {
      navigate('/login');
    } else {
      navigate(authService.getRedirectPathForRole(user.role));
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0d0f14]/95 backdrop-blur-md border-b border-zinc-800/80 text-white shadow-2xl">
      {/* Top microbar */}
      <div className="hidden md:flex items-center justify-between px-6 py-1.5 text-xs text-zinc-400 border-b border-zinc-800/50 bg-[#090a0e]">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>{settings.opening_hours.weekdays}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                settings.is_open ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className={settings.is_open ? 'text-emerald-400 font-medium' : 'text-rose-400'}>
              {settings.is_open ? 'Hamburgueria Aberta Agora' : 'Fechada no Momento'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-5">
          <a
            href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 text-zinc-300 hover:text-amber-400 transition"
          >
            <Phone className="w-3.5 h-3.5 text-amber-500" />
            <span>{settings.whatsapp}</span>
          </a>
          <button
            onClick={onOpenTracking}
            className="text-amber-400 hover:text-amber-300 font-medium transition cursor-pointer"
          >
            Acompanhar Meu Pedido →
          </button>
        </div>
      </div>

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <div
          onClick={() => {
            if (setActiveView) setActiveView('store');
            else navigate('/');
          }}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-red-600 to-amber-700 p-0.5 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition">
            <div className="w-full h-full bg-[#0e1017] rounded-[14px] flex items-center justify-center">
              <Flame className="w-7 h-7 text-amber-500 fill-amber-500 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-2xl tracking-wider text-white uppercase font-['Bebas_Neue',sans-serif]">
                BURGER HUB
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white tracking-widest">
                PITTU
              </span>
            </div>
            <p className="text-[10px] tracking-widest text-amber-400/90 font-semibold uppercase">
              Fast • Fresh • Delicious
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center space-x-8 text-sm font-medium">
          <button
            onClick={() => {
              if (setActiveView) setActiveView('store');
              else navigate('/');
            }}
            className={`transition cursor-pointer ${
              activeView === 'store'
                ? 'text-amber-400 font-semibold'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Início
          </button>
          <a
            href="#cardapio"
            onClick={() => {
              if (setActiveView) setActiveView('store');
              else navigate('/');
            }}
            className="text-zinc-300 hover:text-white transition"
          >
            Cardápio
          </a>
          <a
            href="#bestsellers"
            onClick={() => {
              if (setActiveView) setActiveView('store');
              else navigate('/');
            }}
            className="text-zinc-300 hover:text-white transition"
          >
            Mais Pedidos
          </a>
          <a
            href="#promocoes"
            onClick={() => {
              if (setActiveView) setActiveView('store');
              else navigate('/');
            }}
            className="text-amber-400/90 hover:text-amber-300 transition flex items-center space-x-1"
          >
            <span>Ofertas 20% OFF</span>
          </a>
          <button
            onClick={onOpenTracking}
            className="text-zinc-300 hover:text-white transition cursor-pointer"
          >
            Meus Pedidos
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center space-x-2.5">
          {/* User Account or Login button */}
          {isAuthenticated && user ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleUserAreaClick}
                className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 text-xs font-bold text-white transition cursor-pointer"
                title={`Acessar área de ${user.role}`}
              >
                <div className="w-6 h-6 rounded-lg bg-amber-500 text-zinc-950 font-black flex items-center justify-center text-[11px]">
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <span className="block text-[11px] font-bold text-zinc-200 leading-none truncate max-w-[90px]">
                    {user.full_name.split(' ')[0]}
                  </span>
                  <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">
                    {user.role}
                  </span>
                </div>
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center space-x-2">
              <Link
                to="/login"
                className="px-3 py-2 rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-850 transition"
              >
                Entrar
              </Link>
              <Link
                to="/cadastro"
                className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition"
              >
                Cadastrar
              </Link>
            </div>
          )}

          {/* Quick Tracking Button */}
          <button
            onClick={onOpenTracking}
            className="hidden sm:inline-flex items-center space-x-1 px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition cursor-pointer"
          >
            <span>Rastrear Pedido</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Cart Button */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center space-x-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition transform active:scale-95 cursor-pointer"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              {totalItemsCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-amber-400 text-zinc-950 font-black rounded-full text-[11px] flex items-center justify-center shadow-md animate-bounce">
                  {totalItemsCount}
                </span>
              )}
            </div>
            <div className="text-left hidden xs:block">
              <span className="block text-[10px] text-rose-200 leading-none">CARRINHO</span>
              <span className="text-xs font-bold leading-none">
                {subtotalCents > 0 ? formatCentsToBRL(subtotalCents) : 'R$ 0,00'}
              </span>
            </div>
          </button>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden px-4 pt-2 pb-6 bg-[#10121a] border-b border-zinc-800 space-y-3">
          <button
            onClick={() => {
              if (setActiveView) setActiveView('store');
              else navigate('/');
              setMobileMenuOpen(false);
            }}
            className="w-full text-left py-2 text-zinc-200 font-medium"
          >
            Início / Cardápio
          </button>
          <button
            onClick={() => {
              onOpenTracking();
              setMobileMenuOpen(false);
            }}
            className="w-full text-left py-2 text-amber-400 font-medium"
          >
            Acompanhar Meu Pedido
          </button>
          <div className="pt-2 border-t border-zinc-800 text-xs text-zinc-400 space-y-1">
            <p>Horário: {settings.opening_hours.weekdays}</p>
            <p>WhatsApp: {settings.whatsapp}</p>
          </div>
        </div>
      )}
    </header>
  );
};

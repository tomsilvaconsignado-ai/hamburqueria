import React from 'react';
import { Flame, Phone, Mail, MapPin, Instagram, Facebook, Clock, ShieldCheck } from 'lucide-react';
import { StoreSettings } from '../../types';

interface FooterProps {
  settings: StoreSettings;
  onOpenTracking: () => void;
  onScrollToMenu: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  settings,
  onOpenTracking,
  onScrollToMenu,
}) => {
  return (
    <footer className="bg-[#090b10] border-t border-zinc-800/80 text-zinc-400 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand & About */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center p-0.5">
                <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                  <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
                </div>
              </div>
              <span className="font-extrabold text-2xl tracking-wider text-white uppercase font-['Bebas_Neue',sans-serif]">
                BURGER HUB
              </span>
            </div>

            <p className="text-xs leading-relaxed text-zinc-400">
              Servimos hambúrgueres artesanais preparados com as melhores carnes nobres grelhadas na brasa, ingredientes 100% frescos e molhos autorais exclusivos.
            </p>

            <div className="flex items-center space-x-3 pt-2">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 flex items-center justify-center transition"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 flex items-center justify-center transition"
              >
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Navegação Rápida</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={onScrollToMenu}
                  className="hover:text-amber-400 transition cursor-pointer text-left"
                >
                  Cardápio Completo
                </button>
              </li>
              <li>
                <a href="#bestsellers" className="hover:text-amber-400 transition">
                  Mais Pedidos (Bestsellers)
                </a>
              </li>
              <li>
                <a href="#promocoes" className="hover:text-amber-400 transition">
                  Ofertas & Cupons (20% OFF)
                </a>
              </li>
              <li>
                <button onClick={onOpenTracking} className="hover:text-amber-400 transition cursor-pointer text-left">
                  Rastrear Meu Pedido Live
                </button>
              </li>
            </ul>
          </div>

          {/* Customer Care */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Atendimento ao Cliente</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <span className="flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>{settings.opening_hours.weekdays}</span>
                </span>
              </li>
              <li>
                <span className="flex items-center space-x-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Pagamento Seguro (PIX & Cartão)</span>
                </span>
              </li>
              <li>
                <a
                  href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:underline block pt-1"
                >
                  Suporte Direto no WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* Contact details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Endereço & Contato</h4>
            <div className="space-y-2 text-xs">
              <p className="flex items-start space-x-2">
                <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>{settings.address}</span>
              </p>
              <p className="flex items-center space-x-2">
                <Phone className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{settings.phone}</span>
              </p>
              <p className="flex items-center space-x-2">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>contato@burgerhub.com.br</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 space-y-3 sm:space-y-0">
          <p>© {new Date().getFullYear()} Burger Hub & Pittu. Todos os direitos reservados.</p>
          <p className="flex items-center space-x-3 text-[11px]">
            <span>Segurança SSL 256-bit</span>
            <span>•</span>
            <span>Fuso Horário America/Sao_Paulo</span>
            <span>•</span>
            <span>Supabase PostgreSQL + RLS</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

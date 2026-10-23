import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Flame,
  Bike,
  BarChart3,
  Settings,
  Users,
  ShieldAlert,
  Store,
  ChevronRight,
  X,
  ExternalLink,
} from 'lucide-react';
import { StoreSettings } from '../../../types';

export type AdminTab =
  | 'dashboard'
  | 'pedidos'
  | 'produtos'
  | 'entregadores'
  | 'relatorios'
  | 'configuracoes'
  | 'usuarios'
  | 'auditoria';

interface AdminSidebarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  settings: StoreSettings;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  onSelectTab,
  settings,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navigate = useNavigate();

  const navItems = [
    {
      id: 'dashboard' as AdminTab,
      label: 'Visão Geral',
      path: '/admin',
      icon: LayoutDashboard,
      badge: undefined,
    },
    {
      id: 'pedidos' as AdminTab,
      label: 'Gestão de Pedidos',
      path: '/admin/pedidos',
      icon: ShoppingBag,
      badge: 'Ao Vivo',
    },
    {
      id: 'produtos' as AdminTab,
      label: 'Cardápio & Preços',
      path: '/admin/produtos',
      icon: Flame,
      badge: undefined,
    },
    {
      id: 'entregadores' as AdminTab,
      label: 'Entregadores & Frotas',
      path: '/admin/entregadores',
      icon: Bike,
      badge: undefined,
    },
    {
      id: 'relatorios' as AdminTab,
      label: 'Relatórios & Vendas',
      path: '/admin/relatorios',
      icon: BarChart3,
      badge: undefined,
    },
    {
      id: 'configuracoes' as AdminTab,
      label: 'Configurações da Loja',
      path: '/admin/configuracoes',
      icon: Settings,
      badge: undefined,
    },
    {
      id: 'usuarios' as AdminTab,
      label: 'Equipe & Permissões',
      path: '/admin/usuarios',
      icon: Users,
      badge: undefined,
    },
    {
      id: 'auditoria' as AdminTab,
      label: 'Auditoria & Segurança',
      path: '/admin/auditoria',
      icon: ShieldAlert,
      badge: undefined,
    },
  ];

  const handleNav = (tab: AdminTab, path: string) => {
    onSelectTab(tab);
    navigate(path);
    onCloseMobile();
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-72 bg-[#10121a] border-r border-zinc-800 flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Header */}
        <div>
          <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-amber-500/20 font-black text-white font-['Bebas_Neue',sans-serif] text-xl">
                BH
              </div>
              <div>
                <h2 className="text-base font-extrabold tracking-wide text-white font-['Bebas_Neue',sans-serif]">
                  BURGER HUB ADMIN
                </h2>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      settings.is_open && settings.store_status !== 'PAUSED'
                        ? 'bg-emerald-400 animate-pulse'
                        : settings.store_status === 'PAUSED'
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                    {settings.store_status === 'PAUSED'
                      ? 'Pausada'
                      : settings.is_open
                      ? 'Loja Aberta'
                      : 'Loja Fechada'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1.5">
            <span className="px-3 text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-2">
              Menu Principal
            </span>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id, item.path)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-black shadow-lg shadow-amber-500/20'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        isActive
                          ? 'bg-zinc-950 text-amber-400'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : isActive ? (
                    <ChevronRight className="w-4 h-4 text-zinc-950" />
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-zinc-800/80 space-y-2 bg-[#0c0e14]/50">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold transition"
          >
            <div className="flex items-center space-x-2">
              <Store className="w-4 h-4 text-amber-400" />
              <span>Ver Cardápio Público</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>

          <div className="px-3 py-2 text-[10px] text-zinc-400 flex items-center justify-between">
            <span>Burger Hub &copy; 2026</span>
            <span className="font-mono text-zinc-400">v2.4 Pro</span>
          </div>
        </div>
      </aside>
    </>
  );
};

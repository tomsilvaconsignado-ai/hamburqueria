import { reportResult } from '../../lib/reportResult';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Bell,
  Store,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Shield,
  PlayCircle,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import {
  Order,
  Product,
  Category,
  DeliveryZone,
  StoreSettings,
  UserProfile,
  Courier,
  AuditLog,
} from '../../types';
import {
  getOrders,
  getProducts,
  getCategories,
  getDeliveryZones,
  getStoreSettings,
  getProfiles,
  getCouriers,
  getAuditLogs,
  toggleStoreOpen,
  setStoreStatus,
  subscribeToRealtime,
  getActiveProfile,
} from '../../services/storage';
import { AdminSidebar, AdminTab } from './components/AdminSidebar';
import { AdminOverview } from './pages/AdminOverview';
import { AdminMenuManager } from './pages/AdminMenuManager';
import { AdminCouriersManager } from './pages/AdminCouriersManager';
import { AdminOrdersManager } from './pages/AdminOrdersManager';
import { AdminReportsPage } from './pages/AdminReportsPage';
import { AdminSettingsPage } from './pages/AdminSettingsPage';
import { AdminStaffUsersPage } from './pages/AdminStaffUsersPage';
import { AdminAuditLogsPage } from './pages/AdminAuditLogsPage';

export interface AdminDashboardProps {
  subpage?:
    | 'dashboard'
    | 'pedidos'
    | 'produtos'
    | 'entregadores'
    | 'relatorios'
    | 'configuracoes'
    | 'usuarios'
    | 'auditoria';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ subpage = 'dashboard' }) => {
  const navigate = useNavigate();

  const getInitialTab = (): AdminTab => {
    if (subpage === 'pedidos') return 'pedidos';
    if (subpage === 'produtos') return 'produtos';
    if (subpage === 'entregadores') return 'entregadores';
    if (subpage === 'relatorios') return 'relatorios';
    if (subpage === 'configuracoes') return 'configuracoes';
    if (subpage === 'usuarios') return 'usuarios';
    if (subpage === 'auditoria') return 'auditoria';
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getInitialTab());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Quick Action Modal Triggers
  const [openNewProductModal, setOpenNewProductModal] = useState(false);
  const [openNewCourierModal, setOpenNewCourierModal] = useState(false);

  // Live Data State
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(getStoreSettings());
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminProfile, setAdminProfile] = useState<UserProfile | null>(getActiveProfile());

  const loadData = () => {
    setOrders(getOrders());
    setProducts(getProducts());
    setCategories(getCategories());
    setZones(getDeliveryZones());
    setSettings(getStoreSettings());
    const profs = getProfiles();
    setAllUsers(profs);
    setCouriers(getCouriers());
    setAuditLogs(getAuditLogs());
    setAdminProfile(getActiveProfile());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToRealtime(() => {
      loadData();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (subpage) {
      setActiveTab(subpage as AdminTab);
    }
  }, [subpage]);

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    if (tab === 'dashboard') navigate('/admin');
    else navigate(`/admin/${tab}`);
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white flex flex-col lg:flex-row font-sans">
      {/* Sidebar Navigation */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        settings={settings}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Admin Content Body */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[#0e1017]/95 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500 font-bold block">
                Painel Administrativo &bull; Burger Hub Pro
              </span>
              <h2 className="text-sm font-extrabold text-white">
                {activeTab === 'dashboard' && 'Visão Geral & Indicadores'}
                {activeTab === 'pedidos' && 'Gestão de Pedidos em Tempo Real'}
                {activeTab === 'produtos' && 'Cardápio & Catálogo de Produtos'}
                {activeTab === 'entregadores' && 'Gestão de Entregadores & Frota'}
                {activeTab === 'relatorios' && 'Relatórios de Vendas & Desempenho'}
                {activeTab === 'configuracoes' && 'Configurações da Hamburgueria'}
                {activeTab === 'usuarios' && 'Equipe, Colaboradores & Acessos'}
                {activeTab === 'auditoria' && 'Registro Imutável de Auditoria'}
              </h2>
            </div>
          </div>

          {/* Top Right Quick Controls */}
          <div className="flex items-center space-x-3">
            {/* Store Status Toggle */}
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  settings.store_status === 'PAUSED'
                    ? 'bg-amber-400'
                    : settings.is_open
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-[11px] font-bold text-zinc-300">
                {settings.store_status === 'PAUSED'
                  ? 'Loja Pausada'
                  : settings.is_open
                  ? 'Loja Aberta'
                  : 'Loja Fechada'}
              </span>

              <button
                onClick={() => {
                  toggleStoreOpen().then(reportResult);
                }}
                className="text-amber-400 hover:text-amber-300 ml-1 transition cursor-pointer"
                title="Alternar rápida de loja aberta/fechada"
              >
                {settings.is_open ? (
                  <ToggleRight className="w-6 h-6 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-zinc-600" />
                )}
              </button>
            </div>

            {/* Admin Profile Chip */}
            {adminProfile && (
              <div className="flex items-center space-x-2.5 pl-2 border-l border-zinc-800">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
                  {adminProfile.avatar_url ? (
                    <img
                      src={adminProfile.avatar_url}
                      alt={adminProfile.full_name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    adminProfile.full_name.charAt(0)
                  )}
                </div>
                <div className="hidden md:block text-left text-xs">
                  <span className="font-bold text-white block leading-tight">
                    {adminProfile.full_name}
                  </span>
                  <span className="text-[10px] text-amber-400 font-semibold uppercase">
                    Administrador
                  </span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Subpage Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8">
          {activeTab === 'dashboard' && (
            <AdminOverview
              orders={orders}
              products={products}
              couriers={couriers}
              onNavigateTab={(tab) => handleTabChange(tab as AdminTab)}
              onOpenNewProductModal={() => {
                handleTabChange('produtos');
                setOpenNewProductModal(true);
              }}
              onOpenNewCourierModal={() => {
                handleTabChange('entregadores');
                setOpenNewCourierModal(true);
              }}
            />
          )}

          {activeTab === 'pedidos' && (
            <AdminOrdersManager
              orders={orders}
              couriers={couriers}
              onReloadData={loadData}
            />
          )}

          {activeTab === 'produtos' && (
            <AdminMenuManager
              products={products}
              categories={categories}
              onReloadData={loadData}
              openCreateModal={openNewProductModal}
              onCloseCreateModal={() => setOpenNewProductModal(false)}
            />
          )}

          {activeTab === 'entregadores' && (
            <AdminCouriersManager
              couriers={couriers}
              profiles={allUsers}
              onReloadData={loadData}
              openCreateModal={openNewCourierModal}
              onCloseCreateModal={() => setOpenNewCourierModal(false)}
            />
          )}

          {activeTab === 'relatorios' && (
            <AdminReportsPage
              orders={orders}
              products={products}
              couriers={couriers}
              categories={categories}
            />
          )}

          {activeTab === 'configuracoes' && (
            <AdminSettingsPage
              settings={settings}
              zones={zones}
              onReloadData={loadData}
            />
          )}

          {activeTab === 'usuarios' && (
            <AdminStaffUsersPage
              allUsers={allUsers}
              onReloadData={loadData}
            />
          )}

          {activeTab === 'auditoria' && (
            <AdminAuditLogsPage auditLogs={auditLogs} />
          )}
        </main>
      </div>
    </div>
  );
};

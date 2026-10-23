import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  User,
  ShoppingBag,
  MapPin,
  LogOut,
  Phone,
  Mail,
  Clock,
  ChevronRight,
  ShieldCheck,
  Plus,
  Trash2,
} from 'lucide-react';
import { Order, CustomerAddress } from '../../types';
import { getOrders, subscribeToRealtime } from '../../services/storage';
import { formatCentsToBRL } from '../../lib/formatters/currency';
import { formatDateTimeBR } from '../../lib/formatters/date';

export const CustomerAccountPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'profile'>('orders');
  const [addresses, setAddresses] = useState<CustomerAddress[]>([
    {
      id: 'addr-1',
      customer_id: user?.id || 'usr-customer-1',
      label: 'Casa',
      recipient_name: user?.full_name || 'Lucas Ferreira',
      recipient_phone: user?.phone || '(11) 99876-5432',
      postal_code: '01311-000',
      street: 'Av. Paulista',
      number: '1200',
      complement: 'Apt 142',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      reference: 'Próximo ao MASP',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  // New address form state
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newLabel, setNewLabel] = useState('Trabalho');
  const [newStreet, setNewStreet] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newComplement, setNewComplement] = useState('');
  const [newNeighborhood, setNewNeighborhood] = useState('Pinheiros');
  const [newPostalCode, setNewPostalCode] = useState('05407-002');
  const [newReference, setNewReference] = useState('');

  const loadCustomerOrders = () => {
    if (!user) return;
    const all = getOrders();
    // Filtro seguro: somente pedidos deste cliente
    const myOrders = all.filter(
      (o) =>
        o.customer_id === user.id ||
        o.customer_phone.replace(/\D/g, '') === user.phone.replace(/\D/g, '') ||
        o.customer_name.toLowerCase() === user.full_name.toLowerCase()
    );
    setOrders(myOrders);
  };

  useEffect(() => {
    loadCustomerOrders();
    const unsub = subscribeToRealtime(() => {
      loadCustomerOrders();
    });
    return unsub;
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStreet.trim() || !newNumber.trim() || !newNeighborhood.trim()) return;

    const newAddr: CustomerAddress = {
      id: `addr-${Date.now()}`,
      customer_id: user?.id || '',
      label: newLabel,
      recipient_name: user?.full_name || '',
      recipient_phone: user?.phone || '',
      postal_code: newPostalCode,
      street: newStreet,
      number: newNumber,
      complement: newComplement,
      neighborhood: newNeighborhood,
      city: 'São Paulo',
      state: 'SP',
      reference: newReference,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setAddresses((prev) => [...prev, newAddr]);
    setShowAddAddress(false);
    setNewStreet('');
    setNewNumber('');
    setNewComplement('');
  };

  const handleDeleteAddress = (id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Customer Header */}
        <div className="p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center font-black text-xl shadow-lg shadow-amber-500/20">
              <User className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-black text-white font-['Bebas_Neue',sans-serif] tracking-wide">
                  OLÁ, {user.full_name}
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  CLIENTE VERIFICADO
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {user.email} • {user.phone}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              to="/"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition cursor-pointer"
            >
              Fazer Novo Pedido
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-red-400 text-xs font-bold transition cursor-pointer"
              title="Encerrar sessão"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'orders'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Meus Pedidos ({orders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('addresses')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'addresses'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Meus Endereços ({addresses.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'profile'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Dados da Conta</span>
          </button>
        </div>

        {/* Tab 1: Orders */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="p-12 text-center text-zinc-400 bg-[#141620] rounded-3xl border border-zinc-800 space-y-3">
                <ShoppingBag className="w-12 h-12 text-zinc-600 mx-auto" />
                <h3 className="text-base font-bold text-zinc-200">Você ainda não realizou pedidos</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Aproveite nossos hambúrgueres artesanais na brasa e use o cupom <strong>BEMVINDO20</strong> no checkout.
                </p>
                <Link
                  to="/"
                  className="inline-block mt-2 px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider"
                >
                  Explorar Cardápio
                </Link>
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className="p-5 rounded-3xl bg-[#141622] border border-zinc-800 hover:border-zinc-700 transition space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl font-black font-['Bebas_Neue',sans-serif] text-amber-400">
                          {order.order_number}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            order.status === 'CONCLUIDO'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : order.status === 'CANCELADO'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        {formatDateTimeBR(order.created_at)} • {order.fulfillment_type === 'DELIVERY' ? '🛵 Delivery' : '🏪 Retirada'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-black text-white font-['Bebas_Neue',sans-serif]">
                        {formatCentsToBRL(order.total_cents)}
                      </span>
                      <span className="block text-[10px] text-zinc-400">
                        {order.payment_method.replace(/_/g, ' ')} • {order.payment_status}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-1.5 text-xs text-zinc-300">
                    {order.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span>
                          {it.quantity}x {it.product_name_snapshot}
                        </span>
                        <span className="text-zinc-400">{formatCentsToBRL(it.line_total_cents)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Action */}
                  <div className="pt-2 flex justify-between items-center border-t border-zinc-800/60">
                    <span className="text-[11px] text-zinc-500">
                      {order.items.length} itens no pedido
                    </span>
                    <button
                      onClick={() => navigate(`/acompanhar/${order.id}`)}
                      className="flex items-center space-x-1 text-xs font-bold text-amber-400 hover:text-amber-300"
                    >
                      <span>Acompanhar Pedido Live</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Addresses */}
        {activeTab === 'addresses' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Endereços Salvos</h3>
              <button
                onClick={() => setShowAddAddress(!showAddAddress)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Novo Endereço</span>
              </button>
            </div>

            {/* Add Address Form */}
            {showAddAddress && (
              <form onSubmit={handleAddAddress} className="p-5 rounded-3xl bg-[#141622] border border-amber-500/40 space-y-3">
                <h4 className="text-xs font-bold text-amber-400 uppercase">Novo Endereço</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-zinc-400 block mb-1">Identificação</label>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Ex: Casa, Trabalho"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-zinc-400 block mb-1">Rua / Avenida</label>
                    <input
                      type="text"
                      required
                      value={newStreet}
                      onChange={(e) => setNewStreet(e.target.value)}
                      placeholder="Nome da rua"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-zinc-400 block mb-1">Número</label>
                    <input
                      type="text"
                      required
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      placeholder="123"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Complemento</label>
                    <input
                      type="text"
                      value={newComplement}
                      onChange={(e) => setNewComplement(e.target.value)}
                      placeholder="Apt, Bloco..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Bairro</label>
                    <input
                      type="text"
                      required
                      value={newNeighborhood}
                      onChange={(e) => setNewNeighborhood(e.target.value)}
                      placeholder="Bairro"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black"
                  >
                    Salvar Endereço
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  className="p-4 rounded-2xl bg-[#141622] border border-zinc-800 flex items-start justify-between"
                >
                  <div className="space-y-1 text-xs">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-zinc-800 text-amber-400">
                      {addr.label}
                    </span>
                    <p className="font-bold text-white text-sm pt-1">
                      {addr.street}, {addr.number} {addr.complement}
                    </p>
                    <p className="text-zinc-400">
                      {addr.neighborhood} - {addr.city}/{addr.state}
                    </p>
                    {addr.reference && (
                      <p className="text-[11px] text-zinc-500 italic">Ref: {addr.reference}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="text-zinc-500 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Profile Info */}
        {activeTab === 'profile' && (
          <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 max-w-xl space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Informações Cadastrais
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-zinc-400 block mb-1">Nome Completo</label>
                <input
                  type="text"
                  disabled
                  value={user.full_name}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-zinc-300"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">E-mail</label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-zinc-300"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Telefone / WhatsApp</label>
                <input
                  type="tel"
                  disabled
                  value={user.phone}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-zinc-300"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Perfil no Sistema</label>
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-bold">
                    {user.role}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Definido estritamente pelo servidor e RLS
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

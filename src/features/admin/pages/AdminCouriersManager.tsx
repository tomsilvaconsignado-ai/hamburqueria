import React, { useState } from 'react';
import { reportResult } from '../../../lib/reportResult';
import {
  Bike,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  ShieldAlert,
  Phone,
  MessageCircle,
  MapPin,
  Star,
  CheckCircle,
  Link,
  Download,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Courier, CourierStatus, VehicleType, UserProfile } from '../../../types';
import {
  saveCourier,
  deleteCourier,
  toggleCourierStatus,
  toggleCourierAvailability,
  linkCourierToUser,
  exportCouriersToCSV,
  downloadCSV,
} from '../../../services/storage';

interface AdminCouriersManagerProps {
  couriers: Courier[];
  profiles: UserProfile[];
  onReloadData: () => void;
  openCreateModal?: boolean;
  onCloseCreateModal?: () => void;
}

export const AdminCouriersManager: React.FC<AdminCouriersManagerProps> = ({
  couriers,
  profiles,
  onReloadData,
  openCreateModal = false,
  onCloseCreateModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CourierStatus>('ALL');
  const [vehicleFilter, setVehicleFilter] = useState<'ALL' | VehicleType>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(openCreateModal);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formWhatsapp, setFormWhatsapp] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNeighborhood, setFormNeighborhood] = useState('');
  const [formCity, setFormCity] = useState('São Paulo');
  const [formState, setFormState] = useState('SP');
  const [formVehicleType, setFormVehicleType] = useState<VehicleType>('MOTO');
  const [formVehicleModel, setFormVehicleModel] = useState('');
  const [formVehicleColor, setFormVehicleColor] = useState('');
  const [formVehiclePlate, setFormVehiclePlate] = useState('');
  const [formStatus, setFormStatus] = useState<CourierStatus>('ATIVO');
  const [formIsAvailable, setFormIsAvailable] = useState(true);
  const [formServiceAreasStr, setFormServiceAreasStr] = useState('');
  const [formAdminNotes, setFormAdminNotes] = useState('');
  const [formSelectedUserId, setFormSelectedUserId] = useState('');

  // Link User Modal State
  const [linkingCourier, setLinkingCourier] = useState<Courier | null>(null);
  const [selectedUserIdToLink, setSelectedUserIdToLink] = useState('');

  // Delete Confirm Modal State
  const [courierToDelete, setCourierToDelete] = useState<Courier | null>(null);

  const openNewCourierModal = () => {
    setEditingCourier(null);
    setFormName('');
    setFormPhotoUrl('');
    setFormPhone('');
    setFormWhatsapp('');
    setFormEmail('');
    setFormAddress('');
    setFormNeighborhood('');
    setFormCity('São Paulo');
    setFormState('SP');
    setFormVehicleType('MOTO');
    setFormVehicleModel('');
    setFormVehicleColor('');
    setFormVehiclePlate('');
    setFormStatus('ATIVO');
    setFormIsAvailable(true);
    setFormServiceAreasStr('Centro, Bela Vista, Consolação');
    setFormAdminNotes('');
    setFormSelectedUserId('');
    setIsModalOpen(true);
  };

  const openEditCourierModal = (c: Courier) => {
    setEditingCourier(c);
    setFormName(c.full_name);
    setFormPhotoUrl(c.photo_url || '');
    setFormPhone(c.phone);
    setFormWhatsapp(c.whatsapp);
    setFormEmail(c.email || '');
    setFormAddress(c.address || '');
    setFormNeighborhood(c.neighborhood || '');
    setFormCity(c.city || 'São Paulo');
    setFormState(c.state || 'SP');
    setFormVehicleType(c.vehicle_type);
    setFormVehicleModel(c.vehicle_model || '');
    setFormVehicleColor(c.vehicle_color || '');
    setFormVehiclePlate(c.vehicle_plate || '');
    setFormStatus(c.status);
    setFormIsAvailable(c.is_available_for_orders);
    setFormServiceAreasStr((c.service_areas || []).join(', '));
    setFormAdminNotes(c.admin_notes || '');
    setFormSelectedUserId(c.user_id || '');
    setIsModalOpen(true);
  };

  const handleSaveCourierForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const serviceAreas = formServiceAreasStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const courierId = editingCourier ? editingCourier.id : `cour-${Date.now()}`;

    const courierData: Courier = {
      id: courierId,
      user_id: formSelectedUserId || undefined,
      full_name: formName.trim(),
      photo_url: formPhotoUrl.trim() || undefined,
      phone: formPhone.trim(),
      whatsapp: formWhatsapp.trim() || formPhone.trim(),
      email: formEmail.trim() || undefined,
      address: formAddress.trim() || undefined,
      neighborhood: formNeighborhood.trim() || undefined,
      city: formCity.trim() || 'São Paulo',
      state: formState.trim() || 'SP',
      vehicle_type: formVehicleType,
      vehicle_model: formVehicleModel.trim() || undefined,
      vehicle_color: formVehicleColor.trim() || undefined,
      vehicle_plate: formVehiclePlate.trim().toUpperCase() || undefined,
      status: formStatus,
      is_available_for_orders: formStatus === 'ATIVO' ? formIsAvailable : false,
      service_areas: serviceAreas,
      admin_notes: formAdminNotes.trim() || undefined,
      total_deliveries_count: editingCourier ? editingCourier.total_deliveries_count : 0,
      completed_deliveries_count: editingCourier ? editingCourier.completed_deliveries_count : 0,
      average_rating: editingCourier ? editingCourier.average_rating : 5.0,
      created_at: editingCourier ? editingCourier.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const saved = await saveCourier(courierData);
    if (!saved.success) {
      alert(saved.error);
      return;
    }

    // Se houver usuário selecionado para vincular (e o vínculo mudou)
    if (formSelectedUserId && saved.id && formSelectedUserId !== editingCourier?.user_id) {
      const linked = await linkCourierToUser(saved.id, formSelectedUserId);
      if (!linked.success) alert(linked.error);
    }

    setIsModalOpen(false);
    if (onCloseCreateModal) onCloseCreateModal();
    onReloadData();
  };

  const handleConfirmLink = async () => {
    if (!linkingCourier || !selectedUserIdToLink) return;
    const res = await linkCourierToUser(linkingCourier.id, selectedUserIdToLink);
    if (!res.success) {
      alert(res.error);
    } else {
      setLinkingCourier(null);
      setSelectedUserIdToLink('');
      onReloadData();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!courierToDelete) return;
    const res = await deleteCourier(courierToDelete.id);
    if (!res.success) {
      alert(res.error);
    } else {
      setCourierToDelete(null);
      onReloadData();
    }
  };

  // Filtered Couriers
  const filteredCouriers = couriers.filter((c) => {
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesVehicle = vehicleFilter === 'ALL' || c.vehicle_type === vehicleFilter;
    const matchesSearch =
      !searchQuery ||
      c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.whatsapp.includes(searchQuery) ||
      (c.service_areas && c.service_areas.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())));

    return matchesStatus && matchesVehicle && matchesSearch;
  });

  const activeCount = couriers.filter((c) => c.status === 'ATIVO').length;
  const availableCount = couriers.filter((c) => c.status === 'ATIVO' && c.is_available_for_orders).length;
  const blockedCount = couriers.filter((c) => c.status === 'BLOQUEADO' || c.status === 'INATIVO').length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center space-x-2">
            <Bike className="w-6 h-6 text-amber-500" />
            <span>CADASTRO & GERENCIAMENTO COMPLETO DE ENTREGADORES</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Controle de motoboys oficiais, veículos, placas, regiões de atendimento, situação e vinculação de contas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openNewCourierModal}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Entregador</span>
          </button>

          <button
            onClick={() => {
              const csv = exportCouriersToCSV(couriers);
              downloadCSV(`entregadores-burgerhub-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            }}
            className="flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs border border-zinc-800 transition cursor-pointer"
            title="Exportar Entregadores em CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#141620] border border-zinc-800">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Total de Entregadores</span>
          <p className="text-2xl font-black text-white font-['Bebas_Neue',sans-serif]">{couriers.length}</p>
          <span className="text-[10px] text-zinc-400">Cadastrados no sistema</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#141620] border border-emerald-500/30">
          <span className="text-[10px] font-bold text-emerald-400 uppercase block">Entregadores Ativos</span>
          <p className="text-2xl font-black text-emerald-400 font-['Bebas_Neue',sans-serif]">{activeCount}</p>
          <span className="text-[10px] text-zinc-400">Aptos a trabalhar</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#141620] border border-blue-500/30">
          <span className="text-[10px] font-bold text-blue-400 uppercase block">Disponíveis Agora</span>
          <p className="text-2xl font-black text-blue-400 font-['Bebas_Neue',sans-serif]">{availableCount}</p>
          <span className="text-[10px] text-zinc-400">Prontos para receber corridas</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#141620] border border-rose-500/30">
          <span className="text-[10px] font-bold text-rose-400 uppercase block">Inativos ou Bloqueados</span>
          <p className="text-2xl font-black text-rose-400 font-['Bebas_Neue',sans-serif]">{blockedCount}</p>
          <span className="text-[10px] text-zinc-400">Não recebem pedidos</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#141620] border border-zinc-800">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, telefone, WhatsApp ou região..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1">
            <Filter className="w-4 h-4 text-zinc-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Todas as Situações</option>
              <option value="ATIVO">Ativos</option>
              <option value="INATIVO">Inativos</option>
              <option value="BLOQUEADO">Bloqueados</option>
            </select>
          </div>

          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value as any)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Todos os Veículos</option>
            <option value="MOTO">Motocicleta</option>
            <option value="BICICLETA">Bicicleta</option>
            <option value="CARRO">Carro</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
      </div>

      {/* Couriers Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCouriers.length === 0 ? (
          <div className="col-span-full p-12 text-center text-zinc-400 bg-zinc-900/40 rounded-3xl border border-zinc-800">
            Nenhum entregador encontrado com estes critérios.
          </div>
        ) : (
          filteredCouriers.map((c) => {
            const linkedProfile = profiles.find((p) => p.id === c.user_id);
            return (
              <div
                key={c.id}
                className={`p-5 rounded-3xl border transition-all duration-200 flex flex-col justify-between shadow-lg ${
                  c.status === 'BLOQUEADO'
                    ? 'bg-rose-950/20 border-rose-500/40'
                    : c.status === 'INATIVO'
                    ? 'bg-zinc-950/70 border-zinc-800/80 opacity-75'
                    : 'bg-[#141622] border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  {/* Top Header */}
                  <div className="flex items-start justify-between pb-3 border-b border-zinc-800 mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        {c.photo_url ? (
                          <img
                            src={c.photo_url}
                            alt={c.full_name}
                            className="w-12 h-12 rounded-2xl object-cover border border-zinc-700"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black">
                            <Bike className="w-6 h-6" />
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-zinc-900 ${
                            c.status === 'ATIVO' && c.is_available_for_orders
                              ? 'bg-emerald-400'
                              : c.status === 'ATIVO'
                              ? 'bg-amber-400'
                              : 'bg-rose-500'
                          }`}
                        />
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-white line-clamp-1">{c.full_name}</h3>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              c.status === 'ATIVO'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : c.status === 'BLOQUEADO'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {c.status}
                          </span>
                          {c.status === 'ATIVO' && (
                            <span className="text-[10px] text-zinc-400 font-bold">
                              {c.is_available_for_orders ? '• Livre' : '• Ocupado'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 text-amber-400 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{c.average_rating || 5.0}</span>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-1.5 text-xs text-zinc-300 py-1">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 flex items-center space-x-1">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Telefone:</span>
                      </span>
                      <a href={`tel:${c.phone}`} className="hover:text-amber-400">
                        {c.phone}
                      </a>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 flex items-center space-x-1">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp:</span>
                      </span>
                      <a
                        href={`https://wa.me/55${c.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        {c.whatsapp}
                      </a>
                    </div>

                    {/* Vehicle */}
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                      <span className="text-zinc-400">Veículo:</span>
                      <span className="font-bold text-white">
                        {c.vehicle_type === 'MOTO'
                          ? '🏍️ Motocicleta'
                          : c.vehicle_type === 'BICICLETA'
                          ? '🚲 Bicicleta'
                          : '🚗 Carro'}{' '}
                        {c.vehicle_model ? `(${c.vehicle_model})` : ''}
                      </span>
                    </div>

                    {c.vehicle_plate && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Placa:</span>
                        <span className="font-mono font-bold text-amber-300">{c.vehicle_plate}</span>
                      </div>
                    )}

                    {/* Service areas */}
                    {c.service_areas && c.service_areas.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] text-zinc-400 block mb-1">Regiões:</span>
                        <div className="flex flex-wrap gap-1">
                          {c.service_areas.map((area, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300"
                            >
                              {area}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Linked User status */}
                    <div className="pt-2 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Conta de Acesso:</span>
                      {linkedProfile ? (
                        <span className="text-emerald-400 font-bold flex items-center space-x-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>{linkedProfile.email}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setLinkingCourier(c);
                            setSelectedUserIdToLink('');
                          }}
                          className="text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer"
                        >
                          + Vincular Conta
                        </button>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Total de Entregas:</span>
                      <span className="font-bold text-white">
                        {c.completed_deliveries_count} concluídas
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-1 mt-3">
                  {/* Status Toggle Quick Buttons */}
                  <div className="flex items-center space-x-1">
                    {c.status === 'ATIVO' ? (
                      <>
                        <button
                          onClick={() => {
                            toggleCourierAvailability(c.id).then(reportResult);
                            onReloadData();
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                            c.is_available_for_orders
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                          title="Alternar se o entregador está pronto para novas corridas"
                        >
                          {c.is_available_for_orders ? 'Livre' : 'Ocupado'}
                        </button>

                        <button
                          onClick={() => {
                            toggleCourierStatus(c.id, 'INATIVO').then(reportResult);
                            onReloadData();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-[10px] font-bold transition"
                          title="Desativar temporariamente"
                        >
                          Desativar
                        </button>

                        <button
                          onClick={() => {
                            toggleCourierStatus(c.id, 'BLOQUEADO').then(reportResult);
                            onReloadData();
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold transition"
                          title="Bloquear entregador"
                        >
                          Bloquear
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          toggleCourierStatus(c.id, 'ATIVO').then(reportResult);
                          onReloadData();
                        }}
                        className="px-3 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase transition cursor-pointer"
                      >
                        Reativar Entregador
                      </button>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openEditCourierModal(c)}
                      className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-400 transition"
                      title="Editar Dados Completos"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setCourierToDelete(c)}
                      className="p-1.5 rounded-xl bg-zinc-900 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 transition"
                      title="Excluir Cadastro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Add/Edit Courier */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-lg font-black text-white flex items-center space-x-2">
                <Bike className="w-5 h-5 text-amber-400" />
                <span>
                  {editingCourier ? 'Editar Cadastro do Entregador' : 'Cadastrar Novo Entregador'}
                </span>
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  if (onCloseCreateModal) onCloseCreateModal();
                }}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCourierForm} className="space-y-4 text-xs">
              {/* Personal Data */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  1. Dados Pessoais & Contato
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ex: Carlos Eduardo de Oliveira"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">E-mail (opcional)</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="carlos.motoboy@exemplo.com"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Telefone Principal *</label>
                    <input
                      type="tel"
                      required
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="(11) 98888-7777"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">WhatsApp de Contato</label>
                    <input
                      type="tel"
                      value={formWhatsapp}
                      onChange={(e) => setFormWhatsapp(e.target.value)}
                      placeholder="(11) 98888-7777"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">URL da Foto de Perfil (opcional)</label>
                  <input
                    type="url"
                    value={formPhotoUrl}
                    onChange={(e) => setFormPhotoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>

              {/* Vehicle & Operational Info */}
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  2. Informações Operacionais & Veículo
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Tipo de Veículo *</label>
                    <select
                      value={formVehicleType}
                      onChange={(e) => setFormVehicleType(e.target.value as VehicleType)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    >
                      <option value="MOTO">🏍️ Motocicleta</option>
                      <option value="BICICLETA">🚲 Bicicleta</option>
                      <option value="CARRO">🚗 Carro</option>
                      <option value="OUTRO">Outro Veículo</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">Modelo do Veículo</label>
                    <input
                      type="text"
                      value={formVehicleModel}
                      onChange={(e) => setFormVehicleModel(e.target.value)}
                      placeholder="Ex: Honda CG 160 Fan"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Cor do Veículo</label>
                    <input
                      type="text"
                      value={formVehicleColor}
                      onChange={(e) => setFormVehicleColor(e.target.value)}
                      placeholder="Ex: Preta, Vermelha"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">Placa (quando aplicável)</label>
                    <input
                      type="text"
                      value={formVehiclePlate}
                      onChange={(e) => setFormVehiclePlate(e.target.value)}
                      placeholder="BRA2E19"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">
                    Regiões / Bairros de Atendimento (separados por vírgula)
                  </label>
                  <input
                    type="text"
                    value={formServiceAreasStr}
                    onChange={(e) => setFormServiceAreasStr(e.target.value)}
                    placeholder="Centro, Bela Vista, Pinheiros, Jardins..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>

              {/* Status and Notes */}
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  3. Situação Cadastral & Acesso
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Situação Cadastral</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as CourierStatus)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    >
                      <option value="ATIVO">ATIVO (Permitido receber pedidos)</option>
                      <option value="INATIVO">INATIVO (Suspenso temporariamente)</option>
                      <option value="BLOQUEADO">BLOQUEADO (Acesso restrito)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">
                      Vincular Conta de Usuário (Supabase Auth)
                    </label>
                    <select
                      value={formSelectedUserId}
                      onChange={(e) => setFormSelectedUserId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                    >
                      <option value="">Nenhuma conta vinculada</option>
                      {profiles
                        .filter((p) => p.role === 'DELIVERY' || p.role === 'CUSTOMER')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name} ({p.email}) - {p.role}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Observações Internas da Administração</label>
                  <textarea
                    rows={2}
                    value={formAdminNotes}
                    onChange={(e) => setFormAdminNotes(e.target.value)}
                    placeholder="Informações contratuais, taxa acordada, maquineta própria..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wider shadow-lg shadow-amber-500/20"
                >
                  Salvar Entregador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Link Courier to Auth User */}
      {linkingCourier && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Link className="w-5 h-5 text-amber-400" />
              <span>Vincular Conta de Usuário ao Entregador</span>
            </h3>
            <p className="text-xs text-zinc-300">
              Vincule a conta de login de <strong>{linkingCourier.full_name}</strong> para que ele possa
              fazer login e acessar o painel exclusivo em <code>/entregador</code>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Selecione o Usuário Cadastrado</label>
                <select
                  value={selectedUserIdToLink}
                  onChange={(e) => setSelectedUserIdToLink(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-2.5 text-white text-xs"
                >
                  <option value="">Selecione um usuário...</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.email}) - Perfil atual: {p.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setLinkingCourier(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLink}
                disabled={!selectedUserIdToLink}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase disabled:opacity-50"
              >
                Confirmar Vínculo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {courierToDelete && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-rose-500/40 rounded-3xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold">Excluir Cadastro</h3>
            </div>
            <p className="text-xs text-zinc-300">
              Deseja remover permanentemente o entregador <strong>"{courierToDelete.full_name}"</strong>{' '}
              do sistema?
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setCourierToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

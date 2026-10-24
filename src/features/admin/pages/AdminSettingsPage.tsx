import React, { useState } from 'react';
import { reportResult } from '../../../lib/reportResult';
import {
  Settings,
  Store,
  Clock,
  MapPin,
  DollarSign,
  CreditCard,
  Bell,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
} from 'lucide-react';
import { StoreSettings, DeliveryZone, PaymentMethod } from '../../../types';
import {
  updateStoreSettings,
  setStoreStatus,
  saveDeliveryZone,
  deleteDeliveryZone,
} from '../../../services/storage';
import { formatCentsToBRL } from '../../../lib/formatters/currency';

interface AdminSettingsPageProps {
  settings: StoreSettings;
  zones: DeliveryZone[];
  onReloadData: () => void;
}

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({
  settings,
  zones,
  onReloadData,
}) => {
  // Store Info State
  const [storeName, setStoreName] = useState(settings.store_name);
  const [tagline, setTagline] = useState(settings.tagline);
  const [phone, setPhone] = useState(settings.phone);
  const [whatsapp, setWhatsapp] = useState(settings.whatsapp);
  const [address, setAddress] = useState(settings.address);
  const [prepMinutes, setPrepMinutes] = useState(settings.default_preparation_minutes || 25);
  const [minOrderStr, setMinOrderStr] = useState(
    (settings.minimum_order_cents / 100).toFixed(2).replace('.', ',')
  );
  const [pickupInstructions, setPickupInstructions] = useState(
    settings.pickup_instructions || 'Apresente o número do seu pedido no balcão principal.'
  );

  // Status & Acceptance
  const [currentStatus, setCurrentStatus] = useState<'OPEN' | 'CLOSED' | 'PAUSED'>(
    settings.store_status || (settings.is_open ? 'OPEN' : 'CLOSED')
  );

  // Announcement Banner
  const [announcementEnabled, setAnnouncementEnabled] = useState(
    settings.customer_announcement?.enabled ?? true
  );
  const [announcementMessage, setAnnouncementMessage] = useState(
    settings.customer_announcement?.message ??
      '🔥 Peça hoje com entrega rápida! Use o cupom BEMVINDO20 para 20% OFF no seu primeiro pedido.'
  );

  // Opening Hours by Day of Week
  const defaultHours = [
    { day: 'Segunda-feira', open: '12:00', close: '23:00', is_closed: false },
    { day: 'Terça-feira', open: '12:00', close: '23:00', is_closed: false },
    { day: 'Quarta-feira', open: '12:00', close: '23:00', is_closed: false },
    { day: 'Quinta-feira', open: '12:00', close: '23:00', is_closed: false },
    { day: 'Sexta-feira', open: '12:00', close: '00:00', is_closed: false },
    { day: 'Sábado', open: '12:00', close: '00:30', is_closed: false },
    { day: 'Domingo', open: '12:00', close: '23:00', is_closed: false },
  ];
  const [detailedHours, setDetailedHours] = useState(settings.detailed_hours || defaultHours);

  // Payment Methods
  const [acceptedPayments, setAcceptedPayments] = useState<PaymentMethod[]>(
    settings.accepted_payment_methods || [
      'PIX_ONLINE',
      'CARD_ONLINE',
      'CARD_ON_DELIVERY',
      'CASH_ON_DELIVERY',
    ]
  );

  // Delivery Zones Modal State
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneNeighborhoodsStr, setZoneNeighborhoodsStr] = useState('');
  const [zoneFeeStr, setZoneFeeStr] = useState('');
  const [zoneEstimatedMin, setZoneEstimatedMin] = useState(35);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    const minCents = Math.round(parseFloat(minOrderStr.replace(',', '.')) * 100);

    const res = await updateStoreSettings({
      store_name: storeName.trim(),
      tagline: tagline.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim(),
      address: address.trim(),
      default_preparation_minutes: Number(prepMinutes) || 25,
      minimum_order_cents: isNaN(minCents) ? 2000 : minCents,
      pickup_instructions: pickupInstructions.trim(),
      store_status: currentStatus,
      is_open: currentStatus === 'OPEN',
      accepting_orders: currentStatus === 'OPEN',
      detailed_hours: detailedHours,
      accepted_payment_methods: acceptedPayments,
      customer_announcement: {
        enabled: announcementEnabled,
        message: announcementMessage.trim(),
        type: 'INFO',
      },
    });

    setFeedbackMsg(res.success ? 'Configurações salvas com sucesso!' : `Erro ao salvar: ${res.error}`);
    setTimeout(() => setFeedbackMsg(null), 3000);
    onReloadData();
  };

  const handleQuickStatusChange = (status: 'OPEN' | 'CLOSED' | 'PAUSED') => {
    setCurrentStatus(status);
    setStoreStatus(status).then(reportResult);
    onReloadData();
  };

  const togglePaymentMethod = (method: PaymentMethod) => {
    if (acceptedPayments.includes(method)) {
      if (acceptedPayments.length === 1) {
        alert('É necessário manter pelo menos uma forma de pagamento habilitada.');
        return;
      }
      setAcceptedPayments(acceptedPayments.filter((m) => m !== method));
    } else {
      setAcceptedPayments([...acceptedPayments, method]);
    }
  };

  // Zones Handler
  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const feeCents = Math.round(parseFloat(zoneFeeStr.replace(',', '.')) * 100);
    if (isNaN(feeCents) || feeCents < 0) {
      alert('Taxa de entrega inválida.');
      return;
    }

    const neighborhoods = zoneNeighborhoodsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const zoneId = editingZone ? editingZone.id : `zone-${Date.now()}`;
    const zoneData: DeliveryZone = {
      id: zoneId,
      name: zoneName.trim(),
      neighborhoods,
      fee_cents: feeCents,
      minimum_order_cents: editingZone ? editingZone.minimum_order_cents : 2000,
      estimated_minutes: Number(zoneEstimatedMin) || 35,
      is_active: editingZone ? editingZone.is_active : true,
    };

    const res = await saveDeliveryZone(zoneData);
    if (!res.success) {
      alert(res.error || 'Erro ao salvar zona de entrega.');
      return;
    }
    setIsZoneModalOpen(false);
    onReloadData();
  };

  const handleDeleteZone = (id: string) => {
    if (confirm('Deseja excluir esta zona de entrega?')) {
      deleteDeliveryZone(id).then(reportResult);
      onReloadData();
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center space-x-2">
            <Settings className="w-6 h-6 text-amber-500" />
            <span>CONFIGURAÇÕES OPERACIONAIS DA HAMBURGUERIA</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Horários de funcionamento, taxas por bairro, status de atendimento e avisos ao cliente
          </p>
        </div>

        {feedbackMsg && (
          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1.5">
            <CheckCircle className="w-4 h-4" />
            <span>{feedbackMsg}</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSaveGeneralSettings} className="space-y-6">
        {/* Section 1: Store Operating Status Banner */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2">
            <Store className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Situação Operacional da Hamburgueria
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            Alterne o status da loja para controlar o recebimento de pedidos no cardápio público
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleQuickStatusChange('OPEN')}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                currentStatus === 'OPEN'
                  ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs uppercase mb-1 text-emerald-400">
                <PlayCircle className="w-4 h-4" />
                <span>Loja Aberta</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Aceitando pedidos normalmente pelo cardápio e WhatsApp.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleQuickStatusChange('PAUSED')}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                currentStatus === 'PAUSED'
                  ? 'bg-amber-950/40 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs uppercase mb-1 text-amber-400">
                <PauseCircle className="w-4 h-4" />
                <span>Pausada Temporariamente</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Cozinha sobrecarregada ou intervalo. Avisa o cliente com mensagem clara.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleQuickStatusChange('CLOSED')}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                currentStatus === 'CLOSED'
                  ? 'bg-rose-950/40 border-rose-500 text-white shadow-lg shadow-rose-500/10'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs uppercase mb-1 text-rose-400">
                <ShieldAlert className="w-4 h-4" />
                <span>Loja Fechada</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Fora do expediente. Não permite finalização de novos pedidos.
              </p>
            </button>
          </div>
        </div>

        {/* Section 2: Store Information */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            2. Informações Cadastrais da Hamburgueria
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Nome Fantasia do Estabelecimento</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Slogan / Chamada Principal</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Telefone Fixo</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">WhatsApp Oficial de Atendimento</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-zinc-400 block mb-1">Endereço Físico Completo</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Detailed Hours of Operation */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Horário de Funcionamento por Dia da Semana
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            Defina os horários de abertura e fechamento para cada dia
          </p>

          <div className="space-y-2 text-xs">
            {detailedHours.map((h, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 gap-2"
              >
                <div className="w-36 font-bold text-white">{h.day}</div>

                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={h.is_closed}
                      onChange={(e) => {
                        const copy = [...detailedHours];
                        copy[idx].is_closed = e.target.checked;
                        setDetailedHours(copy);
                      }}
                      className="rounded accent-rose-500"
                    />
                    <span className="text-zinc-400 text-[11px]">Fechado o dia todo</span>
                  </label>

                  {!h.is_closed && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="time"
                        value={h.open}
                        onChange={(e) => {
                          const copy = [...detailedHours];
                          copy[idx].open = e.target.value;
                          setDetailedHours(copy);
                        }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs"
                      />
                      <span className="text-zinc-500">até</span>
                      <input
                        type="time"
                        value={h.close}
                        onChange={(e) => {
                          const copy = [...detailedHours];
                          copy[idx].close = e.target.value;
                          setDetailedHours(copy);
                        }}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Operational Rules & Minimums */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            4. Regras Operacionais, Pedido Mínimo & Retirada
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Tempo Padrão de Preparo (minutos)</label>
              <input
                type="number"
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(parseInt(e.target.value) || 25)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Valor do Pedido Mínimo (R$)</label>
              <input
                type="text"
                value={minOrderStr}
                onChange={(e) => setMinOrderStr(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-zinc-400 block mb-1">Instruções para Retirada no Balcão</label>
              <input
                type="text"
                value={pickupInstructions}
                onChange={(e) => setPickupInstructions(e.target.value)}
                placeholder="Ex: Dirija-se ao balcão principal e informe o número do pedido."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Delivery Zones & Fees by Neighborhood */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-amber-500" />
                <span>5. Taxas de Entrega por Bairro / Região</span>
              </h3>
              <p className="text-xs text-zinc-400">
                Configure zonas de atendimento com taxas específicas e estimativas de tempo
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingZone(null);
                setZoneName('');
                setZoneNeighborhoodsStr('');
                setZoneFeeStr('');
                setZoneEstimatedMin(35);
                setIsZoneModalOpen(true);
              }}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Nova Zona</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {zones.map((z) => (
              <div
                key={z.id}
                className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex justify-between items-start"
              >
                <div>
                  <h4 className="font-bold text-white text-sm">{z.name}</h4>
                  <p className="text-amber-400 font-black text-sm mt-0.5">
                    {formatCentsToBRL(z.fee_cents)} &bull;{' '}
                    <span className="text-xs text-zinc-400 font-normal">
                      ~{z.estimated_minutes} min
                    </span>
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Bairros: {z.neighborhoods.join(', ')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteZone(z.id)}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400"
                  title="Excluir Zona"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Section 6: Accepted Payment Methods */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              6. Formas de Pagamento Aceitas
            </h3>
          </div>
          <p className="text-[11px] text-amber-300/80">
            Pix e Cartão Online só funcionam com as Edge Functions do Mercado Pago publicadas (create-payment e
            mercadopago-webhook). Habilite-os somente depois disso.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {[
              { id: 'PIX_ONLINE' as PaymentMethod, label: 'Pix Online Automático (com QR Code)' },
              { id: 'CARD_ONLINE' as PaymentMethod, label: 'Cartão de Crédito Online' },
              { id: 'CARD_ON_DELIVERY' as PaymentMethod, label: 'Cartão na Entrega (Maquininha do Motoboy)' },
              { id: 'CASH_ON_DELIVERY' as PaymentMethod, label: 'Dinheiro na Entrega (com Troco)' },
            ].map((method) => {
              const isChecked = acceptedPayments.includes(method.id);
              return (
                <label
                  key={method.id}
                  className={`p-3.5 rounded-2xl border flex items-center space-x-3 cursor-pointer transition ${
                    isChecked
                      ? 'bg-amber-500/10 border-amber-500/40 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => togglePaymentMethod(method.id)}
                    className="rounded accent-amber-500"
                  />
                  <span className="font-bold">{method.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Section 7: Customer Announcement Banner */}
        <div className="p-6 rounded-3xl bg-[#141620] border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              7. Mensagens & Banners Exibidos ao Cliente
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={announcementEnabled}
                onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span className="text-white font-bold">
                Exibir banner de aviso no topo da loja
              </span>
            </label>

            {announcementEnabled && (
              <div>
                <label className="text-zinc-400 block mb-1">Texto da Mensagem</label>
                <input
                  type="text"
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  placeholder="Ex: Devido à chuva, as entregas podem levar 10 minutos adicionais."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* Save Changes Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-8 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            Salvar Todas as Configurações
          </button>
        </div>
      </form>

      {/* Modal: Add Delivery Zone */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Cadastrar Zona de Entrega</h3>
            <form onSubmit={handleSaveZone} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Nome da Zona / Região *</label>
                <input
                  type="text"
                  required
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="Ex: Zona Oeste - Perdizes & Pompeia"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Taxa de Entrega (R$) *</label>
                <input
                  type="text"
                  required
                  value={zoneFeeStr}
                  onChange={(e) => setZoneFeeStr(e.target.value)}
                  placeholder="Ex: 11,90"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Tempo Estimado de Entrega (min)</label>
                <input
                  type="number"
                  value={zoneEstimatedMin}
                  onChange={(e) => setZoneEstimatedMin(parseInt(e.target.value) || 35)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Bairros Atendidos (separados por vírgula)</label>
                <textarea
                  required
                  rows={2}
                  value={zoneNeighborhoodsStr}
                  onChange={(e) => setZoneNeighborhoodsStr(e.target.value)}
                  placeholder="Perdizes, Pompeia, Sumaré, Barra Funda..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsZoneModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase"
                >
                  Salvar Zona
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

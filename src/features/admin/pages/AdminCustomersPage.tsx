import React, { useEffect, useMemo, useState } from 'react';
import {
  Contact,
  Search,
  Star,
  Repeat,
  Moon,
  Cake,
  MessageCircle,
  Phone,
  Plus,
  Pencil,
  X,
  Loader2,
  Printer,
  MapPin,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import type { StoreSettings } from '../../../types';
import { formatCentsToBRL } from '../../../lib/formatters/currency';
import { formatDateTimeBR } from '../../../lib/formatters/date';
import { STATUS_LABEL, STATUS_STYLE } from '../../../lib/labels';
import { waLink } from '../../../lib/whatsapp';
import { formatCep, lookupCep } from '../../../lib/viacep';
import { printCustomersReport } from '../../../lib/documents/templates';
import {
  ADMIN_DATA_AVAILABLE,
  CrmAddress,
  CrmInput,
  CustomerOrder,
  CustomerRow,
  CustomerSegment,
  fetchCustomerOrders,
  fetchCustomers,
  saveCustomerCrm,
} from '../../../services/admin.service';

const SEGMENTS: { id: CustomerSegment; label: string; icon: React.ElementType; hint: string }[] = [
  { id: 'ALL', label: 'Todos', icon: Contact, hint: '' },
  { id: 'FREQUENT', label: 'Frequentes', icon: Repeat, hint: '3 ou mais pedidos concluídos nos últimos 30 dias' },
  { id: 'INACTIVE', label: 'Inativos', icon: Moon, hint: 'Sem pedido há mais de 30 dias' },
  { id: 'VIP', label: 'VIP', icon: Star, hint: 'Marcados como VIP pela loja' },
  { id: 'BIRTHDAY', label: 'Aniversariantes', icon: Cake, hint: 'Fazem aniversário neste mês' },
];

const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500';
const emptyAddress = (): CrmAddress => ({ label: 'Casa', postal_code: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', reference: '' });

const formatBirthday = (d?: string | null) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');

/** Ficha do cliente: cria ou edita os dados que a loja anota (os números vêm dos pedidos). */
const CustomerForm: React.FC<{ initial?: CustomerRow; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState<CrmInput>(() => ({
    full_name: initial?.full_name ?? '',
    phone: initial?.phone ?? '',
    whatsapp: initial?.whatsapp ?? '',
    email: initial?.email ?? '',
    birthday: initial?.birthday ?? '',
    notes: initial?.notes ?? '',
    is_vip: initial?.is_vip ?? false,
    addresses: initial?.addresses?.length
      ? initial.addresses
      : initial?.last_address
        ? [{ ...emptyAddress(), ...initial.last_address, label: 'Último pedido' }]
        : [],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cepStatus, setCepStatus] = useState<Record<number, string>>({});

  const set = <K extends keyof CrmInput>(k: K, v: CrmInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setAddr = (i: number, patch: Partial<CrmAddress>) =>
    setForm((f) => ({ ...f, addresses: f.addresses.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));

  const fillCep = async (i: number, cep: string) => {
    setAddr(i, { postal_code: formatCep(cep) });
    if (cep.replace(/\D/g, '').length !== 8) return;
    setCepStatus((s) => ({ ...s, [i]: 'Buscando CEP…' }));
    try {
      const found = await lookupCep(cep);
      if (!found) setCepStatus((s) => ({ ...s, [i]: 'CEP não encontrado. Preencha à mão.' }));
      else {
        setAddr(i, { street: found.street, neighborhood: found.neighborhood, city: found.city, state: found.state });
        setCepStatus((s) => ({ ...s, [i]: 'Endereço preenchido; confira e complete o número.' }));
      }
    } catch {
      setCepStatus((s) => ({ ...s, [i]: 'Sem conexão com o ViaCEP. Preencha à mão.' }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) return setError('Informe o nome do cliente.');
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Informe o telefone com DDD.');
    if (initial && initial.phone_key !== form.phone.replace(/\D/g, '').slice(-11)) {
      return setError('O telefone identifica o cliente e não pode ser trocado aqui. Cadastre um novo cliente com o outro número.');
    }
    setSaving(true);
    const r = await saveCustomerCrm({ ...form, addresses: form.addresses.filter((a) => a.street.trim() || a.postal_code.trim()) });
    setSaving(false);
    if (r.error) return setError(r.error);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/85 flex items-start sm:items-center justify-center p-3 z-50 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={initial ? 'Editar cliente' : 'Novo cliente'}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 space-y-4 my-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-white">{initial ? 'Editar ficha do cliente' : 'Novo cliente'}</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="text-[11px] text-zinc-400 space-y-1">Nome *<input className={input} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} maxLength={120} required /></label>
          <label className="text-[11px] text-zinc-400 space-y-1">Telefone (com DDD) *<input className={input} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} maxLength={30} required disabled={Boolean(initial)} /></label>
          <label className="text-[11px] text-zinc-400 space-y-1">WhatsApp (se for outro número)<input className={input} type="tel" value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} maxLength={30} /></label>
          <label className="text-[11px] text-zinc-400 space-y-1">E-mail<input className={input} type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} maxLength={160} /></label>
          <label className="text-[11px] text-zinc-400 space-y-1">Aniversário<input className={`${input} [color-scheme:dark]`} type="date" value={form.birthday ?? ''} onChange={(e) => set('birthday', e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs text-white self-end pb-2 cursor-pointer">
            <input type="checkbox" checked={form.is_vip} onChange={(e) => set('is_vip', e.target.checked)} className="accent-amber-500 w-4 h-4" />
            <Star className="w-4 h-4 text-amber-400" /> Cliente VIP
          </label>
        </div>
        <label className="block text-[11px] text-zinc-400 space-y-1">
          Preferências e observações
          <textarea className={input} rows={3} maxLength={2000} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex: sem cebola, prefere pão australiano, portão azul…" />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Endereços</h4>
            <button type="button" onClick={() => set('addresses', [...form.addresses, emptyAddress()])} className="flex items-center gap-1 text-[11px] font-bold text-amber-300 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Adicionar endereço
            </button>
          </div>
          {form.addresses.length === 0 && <p className="text-[11px] text-zinc-500">Nenhum endereço salvo.</p>}
          {form.addresses.map((a, i) => (
            <div key={i} className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input className={input} aria-label="Apelido do endereço" value={a.label} onChange={(e) => setAddr(i, { label: e.target.value })} placeholder="Casa, trabalho…" />
                <input className={input} aria-label="CEP" inputMode="numeric" value={a.postal_code} onChange={(e) => fillCep(i, e.target.value)} placeholder="CEP" />
                <input className={`${input} col-span-2`} aria-label="Rua" value={a.street} onChange={(e) => setAddr(i, { street: e.target.value })} placeholder="Rua" />
                <input className={input} aria-label="Número" value={a.number} onChange={(e) => setAddr(i, { number: e.target.value })} placeholder="Número" />
                <input className={input} aria-label="Complemento" value={a.complement ?? ''} onChange={(e) => setAddr(i, { complement: e.target.value })} placeholder="Complemento" />
                <input className={input} aria-label="Bairro" value={a.neighborhood} onChange={(e) => setAddr(i, { neighborhood: e.target.value })} placeholder="Bairro" />
                <input className={input} aria-label="Cidade/UF" value={a.city ? `${a.city}${a.state ? `/${a.state}` : ''}` : ''} onChange={(e) => { const [city, state = ''] = e.target.value.split('/'); setAddr(i, { city, state }); }} placeholder="Cidade/UF" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">{cepStatus[i] ?? ''}</span>
                <button type="button" onClick={() => set('addresses', form.addresses.filter((_, idx) => idx !== i))} className="flex items-center gap-1 text-[11px] text-rose-300 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" /> Remover
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-zinc-800 text-xs text-zinc-300 font-bold cursor-pointer">Cancelar</button>
          <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 text-xs font-black uppercase cursor-pointer">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar ficha
          </button>
        </div>
      </form>
    </div>
  );
};

/** Detalhes: métricas, endereços e histórico de pedidos do cliente. */
const CustomerDrawer: React.FC<{ customer: CustomerRow; onClose: () => void; onEdit: () => void }> = ({ customer, onClose, onEdit }) => {
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchCustomerOrders(customer.phone_key).then((r) => (r.error ? setError(r.error) : setOrders(r.data ?? [])));
  }, [customer.phone_key]);
  const wa = waLink(customer.whatsapp || customer.phone, `Olá, ${customer.full_name.split(' ')[0] || ''}!`);
  const metric = (label: string, value: string) => (
    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
      <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex justify-end" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={customer.full_name} className="w-full max-w-lg h-full overflow-y-auto bg-zinc-900 border-l border-zinc-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              {customer.full_name || 'Sem nome'} {customer.is_vip && <Star className="w-4 h-4 text-amber-400 fill-amber-400" aria-label="VIP" />}
            </h3>
            <p className="text-xs text-zinc-400">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
            {customer.birthday && <p className="text-xs text-pink-300 flex items-center gap-1 mt-0.5"><Cake className="w-3.5 h-3.5" /> Aniversário {formatBirthday(customer.birthday)}</p>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
              <MessageCircle className="w-4 h-4" /> Conversar no WhatsApp
            </a>
          )}
          <a href={`tel:${customer.phone.replace(/\D/g, '')}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 text-zinc-100 text-xs font-bold"><Phone className="w-4 h-4" /> Ligar</a>
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 text-zinc-100 text-xs font-bold cursor-pointer"><Pencil className="w-4 h-4" /> Editar ficha</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {metric('Pedidos concluídos', String(customer.completed_count))}
          {metric('Total gasto', formatCentsToBRL(customer.total_spent_cents))}
          {metric('Ticket médio', formatCentsToBRL(customer.avg_ticket_cents))}
          {metric('Última compra', customer.last_order_at ? formatDateTimeBR(customer.last_order_at) : '—')}
        </div>
        {customer.notes && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100 whitespace-pre-line">{customer.notes}</div>
        )}
        {(customer.addresses.length > 0 || customer.last_address) && (
          <div className="space-y-1.5 text-xs">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Endereços</h4>
            {[...customer.addresses, ...(customer.addresses.length === 0 && customer.last_address ? [{ ...customer.last_address, label: 'Último pedido' } as CrmAddress] : [])].map((a, i) => (
              <p key={i} className="flex gap-1.5 text-zinc-300"><MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <span><b>{a.label}:</b> {a.street}, {a.number}{a.complement ? ` - ${a.complement}` : ''} · {a.neighborhood}{a.city ? ` · ${a.city}/${a.state}` : ''}{a.postal_code ? ` · ${a.postal_code}` : ''}</span>
              </p>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Histórico de pedidos</h4>
          {error ? <p className="text-xs text-rose-300">{error}</p> : !orders ? (
            <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>
          ) : orders.length === 0 ? <p className="text-xs text-zinc-500">Nenhum pedido ainda.</p> : (
            <ul className="divide-y divide-zinc-800">
              {orders.map((o) => (
                <li key={o.id} className="py-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-amber-400">{o.order_number}</span>
                    <span className="font-bold text-white">{formatCentsToBRL(o.total_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-zinc-400">
                    <span>{formatDateTimeBR(o.created_at)}</span>
                    <span className={`px-1.5 rounded border text-[10px] font-bold ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </div>
                  <p className="text-zinc-500 truncate">{o.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
};

export const AdminCustomersPage: React.FC<{ settings: StoreSettings }> = ({ settings }) => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [segment, setSegment] = useState<CustomerSegment>('ALL');
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [editing, setEditing] = useState<CustomerRow | 'new' | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!ADMIN_DATA_AVAILABLE) return;
    let alive = true;
    setRows(null);
    fetchCustomers(debounced, segment).then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      else {
        setError(null);
        setRows(r.data ?? []);
      }
    });
    return () => {
      alive = false;
    };
  }, [debounced, segment, reload]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      count: list.length,
      spent: list.reduce((s, c) => s + Number(c.total_spent_cents), 0),
      vip: list.filter((c) => c.is_vip).length,
    };
  }, [rows]);

  const segInfo = SEGMENTS.find((s) => s.id === segment)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center gap-2">
            <Contact className="w-6 h-6 text-amber-500" /> CLIENTES (CRM)
          </h2>
          <p className="text-xs text-zinc-400">Histórico, gasto, ticket médio, preferências e contato de cada cliente, inclusive de quem pediu sem cadastro.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => rows && printCustomersReport(rows, settings, `${segInfo.label}${debounced ? ` · busca "${debounced}"` : ''}`)}
            disabled={!rows?.length}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white font-bold text-xs border border-zinc-700 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-400" /> Relatório / PDF
          </button>
          <button onClick={() => setEditing('new')} disabled={!ADMIN_DATA_AVAILABLE} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-black text-xs cursor-pointer">
            <Plus className="w-4 h-4" /> Novo cliente
          </button>
        </div>
      </div>

      {!ADMIN_DATA_AVAILABLE ? (
        <p className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">O módulo de clientes usa o banco de dados e não está disponível no modo demonstração.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-[#141620] border border-zinc-800">
            <label className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-zinc-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone…" aria-label="Buscar cliente" className={input} />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Segmento">
              {SEGMENTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.hint}
                  aria-pressed={segment === s.id}
                  onClick={() => setSegment(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${segment === s.id ? 'bg-amber-500 text-zinc-950 border-amber-500' : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white'}`}
                >
                  <s.icon className="w-3.5 h-3.5" /> {s.label}
                </button>
              ))}
            </div>
          </div>
          {segInfo.hint && <p className="text-[11px] text-zinc-500 -mt-3">{segInfo.hint}.</p>}

          <div className="grid grid-cols-3 gap-3">
            {[
              ['Clientes na lista', String(totals.count)],
              ['Total gasto (concluídos)', formatCentsToBRL(totals.spent)],
              ['VIP', String(totals.vip)],
            ].map(([l, v]) => (
              <div key={l} className="p-4 rounded-2xl bg-[#141620] border border-zinc-800">
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{l}</span>
                <span className="text-lg font-black text-white">{v}</span>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-rose-300">{error}</p>}

          <div className="rounded-3xl bg-[#141620] border border-zinc-800 overflow-hidden">
            {!rows ? (
              <p className="p-10 text-center text-xs text-zinc-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando clientes…</p>
            ) : rows.length === 0 ? (
              <p className="p-10 text-center text-xs text-zinc-400">Nenhum cliente encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3">Cliente</th>
                      <th className="p-3 text-right">Pedidos</th>
                      <th className="p-3 text-right">Total gasto</th>
                      <th className="p-3 text-right hidden md:table-cell">Ticket médio</th>
                      <th className="p-3 hidden md:table-cell">Última compra</th>
                      <th className="p-3 text-right">Contato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {rows.map((c) => {
                      const wa = waLink(c.whatsapp || c.phone, `Olá, ${c.full_name.split(' ')[0] || ''}!`);
                      return (
                        <tr key={c.phone_key} className="hover:bg-zinc-900/40">
                          <td className="p-3">
                            <button type="button" onClick={() => setSelected(c)} className="text-left cursor-pointer">
                              <span className="font-bold text-white hover:text-amber-300">{c.full_name || 'Sem nome'}</span>
                              <span className="block text-[11px] text-zinc-400">{c.phone}</span>
                              <span className="flex flex-wrap gap-1 mt-1">
                                {c.is_vip && <span className="px-1.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">VIP</span>}
                                {c.is_frequent && <span className="px-1.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">Frequente</span>}
                                {c.is_inactive && <span className="px-1.5 rounded bg-zinc-700 text-zinc-300 text-[10px] font-bold">Inativo</span>}
                                {c.birthday_this_month && <span className="px-1.5 rounded bg-pink-500/20 text-pink-300 text-[10px] font-bold">🎂 {formatBirthday(c.birthday)}</span>}
                                {!c.customer_id && c.orders_count > 0 && <span className="px-1.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">sem conta</span>}
                              </span>
                            </button>
                          </td>
                          <td className="p-3 text-right tabular-nums">{c.completed_count}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-white">{formatCentsToBRL(c.total_spent_cents)}</td>
                          <td className="p-3 text-right tabular-nums hidden md:table-cell">{formatCentsToBRL(c.avg_ticket_cents)}</td>
                          <td className="p-3 text-zinc-400 hidden md:table-cell">{c.last_order_at ? formatDateTimeBR(c.last_order_at) : '—'}</td>
                          <td className="p-3 text-right whitespace-nowrap">
                            {wa && (
                              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${c.full_name}`} className="inline-flex p-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30">
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                            <button type="button" onClick={() => setEditing(c)} aria-label={`Editar ${c.full_name}`} className="inline-flex ml-1 p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer">
                              <Pencil className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Dados pessoais: acesso restrito a administradores e cada alteração de ficha fica registrada na auditoria (LGPD).
          </p>
        </>
      )}

      {selected && <CustomerDrawer customer={selected} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null); }} />}
      {editing && (
        <CustomerForm
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
};

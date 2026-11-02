// Dados de gestão calculados no servidor (migração 20261101000000): relatórios, clientes,
// despesas, fechamento de caixa e entregas. Só funcionam com Supabase e perfil ADMIN;
// no modo demonstração as telas mostram um aviso em vez de números inventados.
import { supabase } from '../lib/supabase/client';
import { IS_DEMO_MODE } from './storage';
import type { OrderAddressSnapshot, OrderStatus, PaymentMethod } from '../types';

export const ADMIN_DATA_AVAILABLE = !IS_DEMO_MODE && Boolean(supabase);

type Ok<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

const message = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Falha de comunicação com o servidor.';

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<Ok<T>> {
  if (!ADMIN_DATA_AVAILABLE) return { error: 'Disponível apenas com o banco de dados conectado.' };
  const { data, error } = await db().rpc(fn, args);
  return error ? { error: message(error) } : { data: data as T };
}

/** Data local (Brasília) no formato YYYY-MM-DD, base de todos os filtros de período. */
export function localDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}
export function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 8)}01`;
}

// ---------------- RELATÓRIO ----------------
export interface ReportSummary {
  orders_total: number;
  orders_completed: number;
  orders_in_progress: number;
  orders_cancelled: number;
  cancelled_cents: number;
  in_progress_cents: number;
  products_cents: number;
  delivery_fees_cents: number;
  discounts_cents: number;
  gross_cents: number;
  net_cents: number;
  avg_ticket_cents: number;
  delivery_count: number;
  pickup_count: number;
  unique_customers: number;
  returning_customers: number;
  expenses_cents: number;
  balance_cents: number;
}
export interface Report {
  from: string;
  to: string;
  summary: ReportSummary;
  by_day: { date: string; orders: number; net_cents: number; cancelled: number }[];
  by_hour: { hour: number; orders: number }[];
  by_payment: { method: PaymentMethod; orders: number; net_cents: number }[];
  by_product: { name: string; quantity: number; revenue_cents: number }[];
  by_category: { name: string; quantity: number; revenue_cents: number }[];
  expenses_by_category: { category: string; amount_cents: number }[];
  cancellations: { order_number: string; total_cents: number; reason?: string; created_at: string }[];
}

export const fetchReport = (from: string, to: string) => rpc<Report>('admin_report', { p_from: from, p_to: to });

// ---------------- CLIENTES ----------------
export interface CrmAddress {
  label: string;
  postal_code: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
}
export interface CustomerRow {
  phone_key: string;
  full_name: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  birthday?: string | null;
  notes: string;
  is_vip: boolean;
  addresses: CrmAddress[];
  last_address?: OrderAddressSnapshot | null;
  customer_id?: string | null;
  orders_count: number;
  completed_count: number;
  total_spent_cents: number;
  avg_ticket_cents: number;
  first_order_at?: string | null;
  last_order_at?: string | null;
  is_frequent: boolean;
  is_inactive: boolean;
  birthday_this_month: boolean;
  has_crm: boolean;
}
export type CustomerSegment = 'ALL' | 'FREQUENT' | 'INACTIVE' | 'VIP' | 'BIRTHDAY';

export const fetchCustomers = (search: string, segment: CustomerSegment) =>
  rpc<CustomerRow[]>('admin_customers', { p_search: search || null, p_segment: segment, p_limit: 500 });

export interface CustomerOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: OrderStatus;
  fulfillment_type: 'DELIVERY' | 'PICKUP';
  payment_method: PaymentMethod;
  total_cents: number;
  items: { name: string; quantity: number }[];
}
export const fetchCustomerOrders = (phoneKey: string) => rpc<CustomerOrder[]>('admin_customer_orders', { p_phone_key: phoneKey });

/** Chave do cliente: mesma regra do banco (public.phone_key). */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-11);
}

export interface CrmInput {
  full_name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  birthday?: string;
  notes: string;
  is_vip: boolean;
  addresses: CrmAddress[];
}
export async function saveCustomerCrm(input: CrmInput): Promise<{ error?: string }> {
  if (!ADMIN_DATA_AVAILABLE) return { error: 'Disponível apenas com o banco de dados conectado.' };
  const key = phoneKey(input.phone);
  if (key.length < 10) return { error: 'Informe um telefone com DDD.' };
  const { error } = await db().from('customer_crm').upsert({
    phone_key: key,
    full_name: input.full_name.trim(),
    phone: input.phone.trim(),
    whatsapp: input.whatsapp?.trim() || null,
    email: input.email?.trim() || null,
    birthday: input.birthday || null,
    notes: input.notes.trim(),
    is_vip: input.is_vip,
    addresses: input.addresses,
  });
  return error ? { error: message(error) } : {};
}

// ---------------- DESPESAS E CAIXA ----------------
export type ExpenseMethod = 'DINHEIRO' | 'PIX' | 'CARTAO' | 'BOLETO' | 'TRANSFERENCIA' | 'OUTRO';
export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount_cents: number;
  payment_method: ExpenseMethod;
  created_at: string;
}
export async function fetchExpenses(from: string, to: string): Promise<Ok<Expense[]>> {
  if (!ADMIN_DATA_AVAILABLE) return { error: 'Disponível apenas com o banco de dados conectado.' };
  const { data, error } = await db().from('expenses').select('*').gte('expense_date', from).lte('expense_date', to)
    .order('expense_date', { ascending: false }).order('created_at', { ascending: false });
  return error ? { error: message(error) } : { data: (data ?? []) as Expense[] };
}
export async function addExpense(e: Omit<Expense, 'id' | 'created_at'>): Promise<{ error?: string }> {
  const { error } = await db().from('expenses').insert(e);
  return error ? { error: message(error) } : {};
}
export async function deleteExpense(id: string): Promise<{ error?: string }> {
  const { error } = await db().from('expenses').delete().eq('id', id);
  return error ? { error: message(error) } : {};
}

export interface CashClosing {
  id: string;
  business_date: string;
  opening_cash_cents: number;
  counted_cash_cents: number;
  expected_cash_cents: number;
  difference_cents: number;
  summary: { report: Report; cash_sales_cents: number; cash_expenses_cents: number };
  notes: string;
  closed_at: string;
}
export const closeCash = (date: string, openingCents: number, countedCents: number, notes: string) =>
  rpc<CashClosing>('admin_close_cash', { p_date: date, p_opening_cents: openingCents, p_counted_cents: countedCents, p_notes: notes });

export async function fetchCashClosings(limit = 31): Promise<Ok<CashClosing[]>> {
  if (!ADMIN_DATA_AVAILABLE) return { error: 'Disponível apenas com o banco de dados conectado.' };
  const { data, error } = await db().from('cash_closings').select('*').order('business_date', { ascending: false }).limit(limit);
  return error ? { error: message(error) } : { data: (data ?? []) as CashClosing[] };
}

// ---------------- ENTREGADORES ----------------
export interface CourierDelivery {
  order_id: string;
  order_number: string;
  customer_name: string;
  neighborhood?: string;
  status: 'ATRIBUIDA' | 'COLETADA' | 'EM_ROTA' | 'ENTREGUE' | 'FALHOU' | 'CANCELADA';
  total_cents: number;
  fee_cents: number;
  assigned_at: string;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  payment_collected: boolean;
  assigned_by_name?: string | null;
}
export interface CourierReportRow {
  courier_id: string;
  full_name: string;
  phone: string;
  delivered_count: number;
  in_route_count: number;
  fees_cents: number;
  deliveries: CourierDelivery[];
}
export const fetchCourierReport = (from: string, to: string) =>
  rpc<CourierReportRow[]>('admin_courier_report', { p_from: from, p_to: to });

// ---------------- LINHA DO TEMPO DO PEDIDO ----------------
export interface TimelineEntry {
  id: string;
  previous_status?: OrderStatus | null;
  new_status: OrderStatus;
  actor_type: string;
  reason?: string | null;
  created_at: string;
  actor_name?: string | null;
}
export async function fetchOrderTimeline(orderId: string): Promise<Ok<TimelineEntry[]>> {
  if (!ADMIN_DATA_AVAILABLE) return { error: 'Disponível apenas com o banco de dados conectado.' };
  const { data, error } = await db()
    .from('order_status_history')
    .select('id, previous_status, new_status, actor_type, reason, created_at, actor:profiles!order_status_history_changed_by_fkey(full_name)')
    .eq('order_id', orderId)
    .order('created_at');
  if (error) return { error: message(error) };
  return {
    data: (data ?? []).map((r) => {
      const { actor, ...rest } = r as unknown as TimelineEntry & { actor?: { full_name?: string } | null };
      return { ...rest, actor_name: actor?.full_name ?? null };
    }),
  };
}

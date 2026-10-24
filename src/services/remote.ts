import { supabase } from '../lib/supabase/client';
import { KEYS, getItem, setItem, notifyRealtime } from './cache';
import {
  AuditLog,
  CartItem,
  Category,
  Courier,
  CourierStatus,
  DeliveryZone,
  FulfillmentType,
  Order,
  OrderAddressSnapshot,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  StoreSettings,
  UserProfile,
} from '../types';

/**
 * Backend Supabase: hidrata o cache a partir do banco, mantém-no atualizado via
 * Realtime e envia todas as escritas sensíveis para funções SECURITY DEFINER.
 * As políticas RLS decidem o que cada perfil enxerga.
 */

export type Result = { success: boolean; error?: string };

const GUEST_ORDERS_KEY = 'bh_guest_orders_v1';
const ORDER_SELECT = '*, order_items(*, order_item_options(*))';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

const isUuid = (id?: string) => Boolean(id && UUID_RE.test(id));

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return 'Falha de comunicação com o servidor.';
}

/** Converte null em undefined (formato esperado pelos tipos do app). */
function clean<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v === null ? undefined : v;
  return out as T;
}

/** Copia apenas colunas conhecidas, convertendo undefined em null. */
function pick(obj: object, columns: string[]): Record<string, unknown> {
  const source = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const c of columns) if (c in source) out[c] = source[c] === undefined ? null : source[c];
  return out;
}

// --- TOKENS DE PEDIDOS DE CONVIDADO (somente o token fica neste navegador) ---
interface GuestOrderRef {
  order_id: string;
  token: string;
}

export function getGuestOrderRefs(): GuestOrderRef[] {
  try {
    return JSON.parse(localStorage.getItem(GUEST_ORDERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function rememberGuestOrder(order_id: string, token: string) {
  const refs = getGuestOrderRefs().filter((r) => r.order_id !== order_id);
  refs.unshift({ order_id, token });
  try {
    localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify(refs.slice(0, 20)));
  } catch {
    // armazenamento indisponível (aba anônima): o link de acompanhamento continua válido
  }
}

export function getGuestTokenForOrder(orderId: string): string | undefined {
  return getGuestOrderRefs().find((r) => r.order_id === orderId)?.token;
}

// --- MAPEAMENTO DE LINHAS DO BANCO ---
function mapOrder(row: Record<string, unknown>): Order {
  const { order_items, guest_token_hash: _hash, ...rest } = row as Record<string, unknown> & {
    order_items?: Record<string, unknown>[];
  };
  const items: OrderItem[] = (order_items ?? []).map((it) => {
    const { order_item_options, ...item } = it as Record<string, unknown> & {
      order_item_options?: Record<string, unknown>[];
    };
    return {
      ...clean<OrderItem>(item),
      options: (order_item_options ?? []).map((o) => ({
        option_id: String(o.option_id ?? ''),
        option_name_snapshot: String(o.option_name_snapshot),
        unit_price_delta_cents: Number(o.unit_price_delta_cents),
        quantity: Number(o.quantity),
        line_total_cents: Number(o.line_total_cents),
      })),
    };
  });
  return { ...clean<Order>(rest), items };
}

function mergeOrders(primary: Order[], extra: Order[]): Order[] {
  const byId = new Map<string, Order>();
  [...extra, ...primary].forEach((o) => byId.set(o.id, { ...byId.get(o.id), ...o }));
  return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// --- LEITURAS ---
async function fetchCatalog() {
  const [cats, prods, zones, settings] = await Promise.all([
    db().from('categories').select('*').order('sort_order'),
    db().from('products').select('*').order('sort_order'),
    db().from('delivery_zones').select('*').order('fee_cents'),
    db().from('store_settings').select('*').limit(1).maybeSingle(),
  ]);
  if (!cats.error) setItem(KEYS.CATEGORIES, (cats.data ?? []).map((r) => clean<Category>(r)), false);
  if (!prods.error) setItem(KEYS.PRODUCTS, (prods.data ?? []).map((r) => clean<Product>(r)), false);
  if (!zones.error) setItem(KEYS.ZONES, (zones.data ?? []).map((r) => clean<DeliveryZone>(r)), false);
  if (!settings.error && settings.data) setItem(KEYS.SETTINGS, clean<StoreSettings>(settings.data), false);
}

async function fetchGuestOrders(): Promise<Order[]> {
  const refs = getGuestOrderRefs();
  const results = await Promise.all(
    refs.map(async (ref): Promise<Order | null> => {
      const { data, error } = await db().rpc('get_guest_order', { p_token: ref.token });
      if (error || !data) return null;
      return { ...mapOrder(data as Record<string, unknown>), guest_access_token: ref.token };
    })
  );
  return results.filter((o): o is Order => o !== null);
}

async function fetchOrders() {
  const [own, guest] = await Promise.all([
    db().from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(300),
    fetchGuestOrders(),
  ]);
  const visible = own.error ? [] : (own.data ?? []).map((r) => mapOrder(r));
  setItem(KEYS.ORDERS, mergeOrders(visible, guest), false);
}

async function fetchStaffData() {
  const [couriers, profiles, audit] = await Promise.all([
    db().from('couriers').select('*').order('full_name'),
    db().from('profiles').select('*').order('created_at'),
    db().from('audit_logs').select('*, actor:profiles(full_name)').order('created_at', { ascending: false }).limit(200),
  ]);
  if (!couriers.error) setItem(KEYS.COURIERS, (couriers.data ?? []).map((r) => clean<Courier>(r)), false);
  if (!profiles.error) setItem(KEYS.PROFILES, (profiles.data ?? []).map((r) => clean<UserProfile>(r)), false);
  if (!audit.error) {
    const logs: AuditLog[] = (audit.data ?? []).map((r) => {
      const { actor, ...rest } = r as Record<string, unknown> & { actor?: { full_name?: string } | null };
      return {
        ...clean<AuditLog>(rest),
        actor_id: String(rest.actor_id ?? 'system'),
        actor_name: actor?.full_name ?? 'Sistema / Convidado',
      };
    });
    setItem(KEYS.AUDIT, logs, false);
  }
}

const fetchers = {
  catalog: fetchCatalog,
  orders: fetchOrders,
  staff: fetchStaffData,
};
type FetchGroup = keyof typeof fetchers;

const timers: Partial<Record<FetchGroup, ReturnType<typeof setTimeout>>> = {};

function scheduleRefresh(group: FetchGroup) {
  clearTimeout(timers[group]);
  timers[group] = setTimeout(async () => {
    try {
      await fetchers[group]();
      notifyRealtime();
    } catch (e) {
      console.error(`Falha ao atualizar ${group}:`, e);
    }
  }, 250);
}

export async function refreshAll() {
  try {
    await Promise.all([fetchCatalog(), fetchOrders(), fetchStaffData()]);
  } catch (e) {
    console.error('Falha ao carregar dados do Supabase:', e);
  }
  notifyRealtime();
}

let started = false;

/** Carrega os dados e assina o Realtime. Idempotente. */
export function startRemoteSync() {
  if (started || !supabase) return;
  started = true;

  refreshAll();

  db()
    .channel('burgerhub-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => scheduleRefresh('orders'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => scheduleRefresh('catalog'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => scheduleRefresh('catalog'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, () => scheduleRefresh('catalog'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_zones' }, () => scheduleRefresh('catalog'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'couriers' }, () => scheduleRefresh('staff'))
    .subscribe();

  // O que cada perfil enxerga muda com o login
  db().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      scheduleRefresh('orders');
      scheduleRefresh('staff');
    }
  });

  // Convidados não recebem Realtime de `orders` (RLS); consultam pelo token
  setInterval(() => {
    const orders = getItem<Order[]>(KEYS.ORDERS, []);
    const pending = getGuestOrderRefs().some((ref) => {
      const o = orders.find((x) => x.id === ref.order_id);
      return !o || (o.status !== 'CONCLUIDO' && o.status !== 'CANCELADO');
    });
    if (pending) scheduleRefresh('orders');
  }, 15000);
}

// --- PEDIDOS ---
export interface CreateOrderParams {
  customer_name: string;
  customer_phone: string;
  customer_id?: string;
  fulfillment_type: FulfillmentType;
  delivery_address?: OrderAddressSnapshot;
  items: CartItem[];
  customer_notes?: string;
  payment_method: PaymentMethod;
  coupon_code?: string;
  cash_change_for_cents?: number;
}

export async function remoteCreateOrder(
  params: CreateOrderParams
): Promise<{ success: boolean; order?: Order; error?: string }> {
  const payload = {
    customer_name: params.customer_name,
    customer_phone: params.customer_phone,
    fulfillment_type: params.fulfillment_type,
    payment_method: params.payment_method,
    delivery_address: params.delivery_address ?? null,
    customer_notes: params.customer_notes ?? null,
    coupon_code: params.coupon_code ?? null,
    cash_change_for_cents: params.cash_change_for_cents ?? null,
    items: params.items.map((it) => ({
      product_id: it.product.id,
      quantity: it.quantity,
      notes: it.notes ?? null,
      options: it.selected_options.map((o) => ({ option_id: o.option_id, quantity: o.quantity || 1 })),
    })),
  };

  const { data, error } = await db().rpc('create_order', { p_payload: payload });
  if (error || !data) return { success: false, error: errorMessage(error) };

  const { order_id, guest_access_token } = data as { order_id: string; guest_access_token: string };
  rememberGuestOrder(order_id, guest_access_token);

  const { data: row, error: readError } = await db().rpc('get_guest_order', { p_token: guest_access_token });
  if (readError || !row) return { success: false, error: 'Pedido criado, mas não foi possível carregá-lo. Atualize a página.' };

  const order: Order = { ...mapOrder(row as Record<string, unknown>), guest_access_token };
  setItem(KEYS.ORDERS, mergeOrders([order], getItem<Order[]>(KEYS.ORDERS, [])));
  return { success: true, order };
}

export async function remoteLoadGuestOrder(token: string): Promise<Order | undefined> {
  const { data, error } = await db().rpc('get_guest_order', { p_token: token });
  if (error || !data) return undefined;
  const order: Order = { ...mapOrder(data as Record<string, unknown>), guest_access_token: token };
  rememberGuestOrder(order.id, token);
  setItem(KEYS.ORDERS, mergeOrders([order], getItem<Order[]>(KEYS.ORDERS, [])));
  return order;
}

async function rpcResult(fn: string, args: Record<string, unknown>, refresh: FetchGroup[] = ['orders']): Promise<Result> {
  const { error } = await db().rpc(fn, args);
  if (error) return { success: false, error: errorMessage(error) };
  await Promise.all(refresh.map((g) => fetchers[g]()));
  notifyRealtime();
  return { success: true };
}

export function remoteUpdateOrderStatus(orderId: string, status: OrderStatus, reason?: string): Promise<Result> {
  return rpcResult('update_order_status', {
    p_order_id: orderId,
    p_new_status: status,
    p_reason: reason ?? null,
    p_guest_token: getGuestTokenForOrder(orderId) ?? null,
  });
}

export function remoteAssignCourier(orderId: string, courierId: string): Promise<Result> {
  return rpcResult('admin_assign_courier', { p_order_id: orderId, p_courier_id: courierId });
}

export function remoteCourierAction(
  orderId: string,
  action: 'PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
  paymentCollected?: boolean
): Promise<Result> {
  return rpcResult(
    'courier_update_delivery',
    {
      p_order_id: orderId,
      p_action: action === 'DELIVERED' ? 'DELIVERED' : 'PICKUP',
      p_payment_collected: Boolean(paymentCollected),
    },
    ['orders', 'staff']
  );
}

export async function remoteSetCourierAvailability(courier: Courier, asAdmin: boolean): Promise<Result> {
  if (courier.status !== 'ATIVO') return { success: false, error: 'Entregador não está ativo.' };
  if (!asAdmin) {
    return rpcResult('courier_set_availability', { p_available: !courier.is_available_for_orders }, ['staff']);
  }
  return writeTable(
    db().from('couriers').update({ is_available_for_orders: !courier.is_available_for_orders }).eq('id', courier.id),
    'staff'
  );
}

// --- ESCRITAS ADMINISTRATIVAS (RLS: somente ADMIN) ---
async function writeTable(query: PromiseLike<{ error: unknown }>, group: FetchGroup): Promise<Result> {
  const { error } = await query;
  if (error) return { success: false, error: errorMessage(error) };
  await fetchers[group]();
  notifyRealtime();
  return { success: true };
}

const PRODUCT_COLUMNS = [
  'category_id', 'name', 'slug', 'description', 'image_path', 'price_cents', 'original_price_cents',
  'promotional_price_cents', 'ingredients', 'track_stock', 'stock_quantity', 'is_available', 'is_featured',
  'badge', 'preparation_time_minutes', 'sort_order', 'option_groups',
];
const CATEGORY_COLUMNS = ['name', 'slug', 'description', 'image_path', 'icon', 'sort_order', 'is_active'];
const COURIER_COLUMNS = [
  'full_name', 'photo_url', 'phone', 'whatsapp', 'email', 'address', 'neighborhood', 'city', 'state',
  'admin_notes', 'vehicle_type', 'vehicle_model', 'vehicle_color', 'vehicle_plate', 'status',
  'is_available_for_orders', 'service_areas',
];
const ZONE_COLUMNS = ['name', 'neighborhoods', 'fee_cents', 'minimum_order_cents', 'estimated_minutes', 'is_active'];
const SETTINGS_COLUMNS = [
  'store_name', 'tagline', 'logo_path', 'phone', 'whatsapp', 'address', 'is_open', 'accepting_orders',
  'store_status', 'opening_hours', 'detailed_hours', 'minimum_order_cents', 'default_preparation_minutes',
  'delivery_enabled', 'pickup_enabled', 'pickup_instructions', 'accepted_payment_methods',
  'customer_announcement', 'timezone',
];

function withId(row: Record<string, unknown>, id?: string) {
  // IDs gerados no navegador (ex.: "prod-123") não são UUID: o banco gera o id
  return isUuid(id) ? { id, ...row } : row;
}

export function remoteSaveProduct(product: Product): Promise<Result> {
  const row = withId(
    pick({ ...product, description: product.description ?? '', option_groups: product.option_groups ?? [] }, PRODUCT_COLUMNS),
    product.id
  );
  return writeTable(db().from('products').upsert(row), 'catalog');
}

export function remoteDuplicateProduct(product: Product): Promise<Result> {
  const row = pick(
    {
      ...product,
      name: `${product.name} (Cópia)`,
      slug: `${product.slug}-copia-${Date.now()}`,
      sort_order: (product.sort_order || 0) + 1,
    },
    PRODUCT_COLUMNS
  );
  return writeTable(db().from('products').insert(row), 'catalog');
}

export function remoteDeleteProduct(id: string): Promise<Result> {
  return writeTable(db().from('products').delete().eq('id', id), 'catalog');
}

export function remoteToggleProductAvailability(product: Product): Promise<Result> {
  return writeTable(db().from('products').update({ is_available: !product.is_available }).eq('id', product.id), 'catalog');
}

export function remoteSaveCategory(category: Category): Promise<Result> {
  return writeTable(db().from('categories').upsert(withId(pick(category, CATEGORY_COLUMNS), category.id)), 'catalog');
}

export function remoteDeleteCategory(id: string): Promise<Result> {
  return writeTable(db().from('categories').delete().eq('id', id), 'catalog');
}

export async function remoteSaveCourier(courier: Courier): Promise<Result & { id?: string }> {
  const { data, error } = await db()
    .from('couriers')
    .upsert(withId(pick(courier, COURIER_COLUMNS), courier.id))
    .select('id')
    .single();
  if (error) return { success: false, error: errorMessage(error) };
  await fetchStaffData();
  notifyRealtime();
  return { success: true, id: data.id };
}

export function remoteDeleteCourier(id: string): Promise<Result> {
  return writeTable(db().from('couriers').delete().eq('id', id), 'staff');
}

export async function remoteSetCourierStatus(courier: Courier, status: CourierStatus): Promise<Result> {
  const res = await writeTable(
    db()
      .from('couriers')
      .update({ status, is_available_for_orders: status === 'ATIVO' ? courier.is_available_for_orders : false })
      .eq('id', courier.id),
    'staff'
  );
  if (res.success && courier.user_id) {
    return rpcResult('admin_toggle_user_status', { p_user_id: courier.user_id, p_active: status === 'ATIVO' }, ['staff']);
  }
  return res;
}

export function remoteLinkCourierToUser(courierId: string, userId: string): Promise<Result> {
  return rpcResult('admin_link_courier_user', { p_courier_id: courierId, p_user_id: userId }, ['staff']);
}

export function remoteSaveZone(zone: DeliveryZone): Promise<Result> {
  return writeTable(db().from('delivery_zones').upsert(withId(pick(zone, ZONE_COLUMNS), zone.id)), 'catalog');
}

export function remoteDeleteZone(id: string): Promise<Result> {
  return writeTable(db().from('delivery_zones').delete().eq('id', id), 'catalog');
}

export function remoteUpdateSettings(settingsId: string, changes: Partial<StoreSettings>): Promise<Result> {
  return writeTable(db().from('store_settings').update(pick(changes, SETTINGS_COLUMNS)).eq('id', settingsId), 'catalog');
}

export function remoteToggleUserStatus(userId: string, isActive: boolean): Promise<Result> {
  return rpcResult('admin_toggle_user_status', { p_user_id: userId, p_active: isActive }, ['staff']);
}

export async function remotePromoteAdmin(email: string): Promise<{ success: boolean; message: string }> {
  const res = await rpcResult('admin_promote_user', { p_email: email.trim().toLowerCase() }, ['staff']);
  return { success: res.success, message: res.success ? 'Usuário promovido a administrador.' : res.error || 'Falha.' };
}

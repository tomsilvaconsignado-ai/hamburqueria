import {
  Category,
  Product,
  Order,
  OrderStatus,
  DeliveryZone,
  StoreSettings,
  UserProfile,
  UserRole,
  DeliveryRecord,
  OrderStatusHistory,
  NotificationItem,
  AuditLog,
  Courier,
  CourierStatus,
} from '../types';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_ORDERS,
  INITIAL_DELIVERY_ZONES,
  INITIAL_STORE_SETTINGS,
  DEMO_PROFILES,
  INITIAL_COURIERS,
} from './mockData';
import { IS_DEMO_MODE, KEYS, getItem, setItem, subscribeToRealtime } from './cache';
import { validateStatusChange } from './orderStateMachine';
import * as remote from './remote';
import type { CreateOrderParams, Result } from './remote';

/**
 * Fachada de dados usada pelos componentes.
 *
 * Leituras são síncronas (cache). Escritas são assíncronas e vão para o Supabase
 * (remote.ts) quando configurado; sem Supabase, rodam no backend local de
 * demonstração abaixo, que só existe neste navegador.
 */
export { IS_DEMO_MODE, subscribeToRealtime };
export type { Result };

// Antes de o Supabase responder, nada de catálogo fictício (ids não existem no banco)
// e a loja aparece fechada.
const LOADING_SETTINGS: StoreSettings = {
  ...INITIAL_STORE_SETTINGS,
  is_open: false,
  accepting_orders: false,
  store_status: 'CLOSED',
  customer_announcement: undefined,
};

const demoDefault = <T,>(demoValue: T, remoteValue: T): T => (IS_DEMO_MODE ? demoValue : remoteValue);

export function initializeStorageIfEmpty(): void {
  if (!IS_DEMO_MODE) {
    remote.startRemoteSync();
    return;
  }
  const seeds: [string, unknown][] = [
    [KEYS.PRODUCTS, INITIAL_PRODUCTS],
    [KEYS.CATEGORIES, INITIAL_CATEGORIES],
    [KEYS.ORDERS, INITIAL_ORDERS],
    [KEYS.ZONES, INITIAL_DELIVERY_ZONES],
    [KEYS.SETTINGS, INITIAL_STORE_SETTINGS],
    [KEYS.PROFILES, DEMO_PROFILES],
    [KEYS.COURIERS, INITIAL_COURIERS],
  ];
  seeds.forEach(([key, value]) => {
    if (!localStorage.getItem(key)) setItem(key, value, false);
  });
}

// --- PERFIS ---
export function getProfiles(): UserProfile[] {
  return getItem<UserProfile[]>(KEYS.PROFILES, demoDefault(DEMO_PROFILES, []));
}

export function getProfileById(id: string): UserProfile | undefined {
  return getProfiles().find((p) => p.id === id);
}

export function getProfileByEmail(email: string): UserProfile | undefined {
  return getProfiles().find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
}

export function getActiveProfile(): UserProfile | null {
  return getItem<UserProfile | null>(KEYS.ACTIVE_PROFILE, null);
}

export function setActiveProfile(profile: UserProfile | null): void {
  setItem(KEYS.ACTIVE_PROFILE, profile);
}

/** Somente modo demonstração: no Supabase os perfis são criados pela trigger/Edge Function. */
export function saveProfile(profile: UserProfile): void {
  const profiles = getProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = { ...profile, updated_at: new Date().toISOString() };
  } else {
    profiles.push(profile);
  }
  setItem(KEYS.PROFILES, profiles);
  const active = getActiveProfile();
  if (active && active.id === profile.id) {
    setItem(KEYS.ACTIVE_PROFILE, profiles[idx >= 0 ? idx : profiles.length - 1]);
  }
}

export async function toggleUserStatus(userId: string, isActive: boolean): Promise<Result> {
  const currentActive = getActiveProfile();
  if (currentActive && currentActive.id === userId && !isActive) {
    return { success: false, error: 'Você não pode desativar o seu próprio perfil ativo.' };
  }
  if (!IS_DEMO_MODE) return remote.remoteToggleUserStatus(userId, isActive);

  const profiles = getProfiles();
  const target = profiles.find((p) => p.id === userId);
  if (!target) return { success: false, error: 'Usuário não encontrado.' };

  target.is_active = isActive;
  target.updated_at = new Date().toISOString();
  setItem(KEYS.PROFILES, profiles);
  logAudit(isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'profiles', userId, { email: target.email, role: target.role });
  return { success: true };
}

export async function provisionFirstAdmin(email: string): Promise<{ success: boolean; message: string }> {
  if (!IS_DEMO_MODE) return remote.remotePromoteAdmin(email);

  const profiles = getProfiles();
  const target = profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
  if (!target) {
    return { success: false, message: `Nenhum usuário encontrado com o e-mail "${email}". Cadastre-se primeiro.` };
  }
  target.role = 'ADMIN';
  target.is_active = true;
  target.updated_at = new Date().toISOString();
  setItem(KEYS.PROFILES, profiles);
  logAudit('PROVISION_ADMIN', 'profiles', target.id, { email: target.email });
  return { success: true, message: `Usuário "${target.full_name}" promovido a ADMINISTRADOR com sucesso!` };
}

// --- CATÁLOGO DE PRODUTOS & CATEGORIAS ---
export function getCategories(): Category[] {
  return getItem<Category[]>(KEYS.CATEGORIES, demoDefault(INITIAL_CATEGORIES, []));
}

export async function saveCategory(category: Category): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteSaveCategory(category);

  const categories = getCategories();
  const index = categories.findIndex((c) => c.id === category.id);
  const now = new Date().toISOString();
  if (index >= 0) {
    categories[index] = { ...category, updated_at: now };
  } else {
    categories.push({ ...category, created_at: now, updated_at: now });
  }
  setItem(KEYS.CATEGORIES, categories);
  logAudit('SAVE_CATEGORY', 'category', category.id, { name: category.name });
  return { success: true };
}

export async function deleteCategory(id: string): Promise<Result> {
  if (getProducts().some((p) => p.category_id === id)) {
    return {
      success: false,
      error: 'Não é possível excluir esta categoria porque existem produtos vinculados a ela.',
    };
  }
  if (!IS_DEMO_MODE) return remote.remoteDeleteCategory(id);

  setItem(KEYS.CATEGORIES, getCategories().filter((c) => c.id !== id));
  logAudit('DELETE_CATEGORY', 'category', id);
  return { success: true };
}

export function getProducts(): Product[] {
  return getItem<Product[]>(KEYS.PRODUCTS, demoDefault(INITIAL_PRODUCTS, []));
}

export function getProductById(id: string): Product | undefined {
  return getProducts().find((p) => p.id === id);
}

export async function saveProduct(product: Product): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteSaveProduct(product);

  const products = getProducts();
  const index = products.findIndex((p) => p.id === product.id);
  const now = new Date().toISOString();
  if (index >= 0) {
    products[index] = { ...product, updated_at: now };
  } else {
    products.push({ ...product, created_at: now, updated_at: now });
  }
  setItem(KEYS.PRODUCTS, products);
  logAudit('UPDATE_PRODUCT', 'product', product.id, { name: product.name, price: product.price_cents });
  return { success: true };
}

export async function deleteProduct(id: string): Promise<Result> {
  const target = getProductById(id);
  if (!target) return { success: false, error: 'Produto não encontrado.' };
  if (!IS_DEMO_MODE) return remote.remoteDeleteProduct(id);

  setItem(KEYS.PRODUCTS, getProducts().filter((p) => p.id !== id));
  logAudit('DELETE_PRODUCT', 'product', id, { name: target.name });
  return { success: true };
}

export async function duplicateProduct(id: string): Promise<Result> {
  const original = getProductById(id);
  if (!original) return { success: false, error: 'Produto original não encontrado.' };
  if (!IS_DEMO_MODE) return remote.remoteDuplicateProduct(original);

  const newId = `prod-${Date.now()}`;
  const now = new Date().toISOString();
  await saveProduct({
    ...original,
    id: newId,
    name: `${original.name} (Cópia)`,
    slug: `${original.slug}-copia-${Date.now()}`,
    sort_order: (original.sort_order || 0) + 1,
    created_at: now,
    updated_at: now,
  });
  logAudit('DUPLICATE_PRODUCT', 'product', newId, { original_id: id });
  return { success: true };
}

export async function toggleProductAvailability(id: string): Promise<Result> {
  const target = getProductById(id);
  if (!target) return { success: false, error: 'Produto não encontrado.' };
  if (!IS_DEMO_MODE) return remote.remoteToggleProductAvailability(target);

  const products = getProducts();
  const p = products.find((x) => x.id === id)!;
  p.is_available = !p.is_available;
  p.updated_at = new Date().toISOString();
  setItem(KEYS.PRODUCTS, products);
  logAudit('TOGGLE_AVAILABILITY', 'product', id, { is_available: p.is_available });
  return { success: true };
}

// --- GESTÃO DE ENTREGADORES (tabela `couriers` é a fonte única) ---
export function getCouriers(): Courier[] {
  return getItem<Courier[]>(KEYS.COURIERS, demoDefault(INITIAL_COURIERS, []));
}

export function getCourierById(id: string): Courier | undefined {
  return getCouriers().find((c) => c.id === id);
}

export function getCourierByUserId(userId: string): Courier | undefined {
  return getCouriers().find((c) => c.user_id === userId);
}

/** Retorna o id definitivo do cadastro (no Supabase o banco gera o UUID). */
export async function saveCourier(courier: Courier): Promise<Result & { id?: string }> {
  if (!IS_DEMO_MODE) return remote.remoteSaveCourier(courier);

  const couriers = getCouriers();
  const index = couriers.findIndex((c) => c.id === courier.id);
  const now = new Date().toISOString();
  if (index >= 0) {
    couriers[index] = { ...courier, updated_at: now };
  } else {
    couriers.push({ ...courier, created_at: now, updated_at: now });
  }
  setItem(KEYS.COURIERS, couriers);
  logAudit('SAVE_COURIER', 'courier', courier.id, { name: courier.full_name, status: courier.status });
  return { success: true, id: courier.id };
}

export async function deleteCourier(id: string): Promise<Result> {
  const target = getCourierById(id);
  if (!target) return { success: false, error: 'Entregador não encontrado.' };

  const activeOrders = getOrders().filter(
    (o) => o.assigned_courier_id === id && o.status !== 'CONCLUIDO' && o.status !== 'CANCELADO'
  );
  if (activeOrders.length > 0) {
    return {
      success: false,
      error: `Não é possível excluir o entregador pois há ${activeOrders.length} pedido(s) em aberto com ele. Reatribua os pedidos antes.`,
    };
  }
  if (!IS_DEMO_MODE) return remote.remoteDeleteCourier(id);

  setItem(KEYS.COURIERS, getCouriers().filter((c) => c.id !== id));
  logAudit('DELETE_COURIER', 'courier', id, { name: target.full_name });
  return { success: true };
}

export async function toggleCourierStatus(id: string, status: CourierStatus): Promise<Result> {
  const target = getCourierById(id);
  if (!target) return { success: false, error: 'Entregador não encontrado.' };
  if (!IS_DEMO_MODE) return remote.remoteSetCourierStatus(target, status);

  const couriers = getCouriers();
  const c = couriers.find((x) => x.id === id)!;
  c.status = status;
  if (status !== 'ATIVO') c.is_available_for_orders = false;
  c.updated_at = new Date().toISOString();
  setItem(KEYS.COURIERS, couriers);
  if (c.user_id) await toggleUserStatus(c.user_id, status === 'ATIVO');
  logAudit('TOGGLE_COURIER_STATUS', 'courier', id, { status });
  return { success: true };
}

export async function toggleCourierAvailability(id: string): Promise<Result> {
  const target = getCourierById(id);
  if (!target) return { success: false, error: 'Entregador não encontrado.' };
  if (target.status !== 'ATIVO') return { success: false, error: 'Entregador não está ativo.' };
  if (!IS_DEMO_MODE) return remote.remoteSetCourierAvailability(target, getActiveProfile()?.role === 'ADMIN');

  const couriers = getCouriers();
  const c = couriers.find((x) => x.id === id)!;
  c.is_available_for_orders = !c.is_available_for_orders;
  c.updated_at = new Date().toISOString();
  setItem(KEYS.COURIERS, couriers);
  logAudit('TOGGLE_COURIER_AVAILABILITY', 'courier', id, { available: c.is_available_for_orders });
  return { success: true };
}

export async function linkCourierToUser(courierId: string, userId: string): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteLinkCourierToUser(courierId, userId);

  const couriers = getCouriers();
  const courier = couriers.find((c) => c.id === courierId);
  if (!courier) return { success: false, error: 'Entregador não encontrado.' };

  const profile = getProfileById(userId);
  if (!profile) return { success: false, error: 'Usuário não encontrado.' };
  if (profile.role === 'ADMIN' || profile.role === 'KITCHEN') {
    return { success: false, error: 'Contas de administrador ou cozinha não podem ser vinculadas como entregador.' };
  }
  if (couriers.some((c) => c.user_id === userId && c.id !== courierId)) {
    return { success: false, error: 'Esta conta já está vinculada a outro entregador.' };
  }

  courier.user_id = profile.id;
  courier.email = profile.email;
  courier.updated_at = new Date().toISOString();
  setItem(KEYS.COURIERS, couriers);
  if (profile.role !== 'DELIVERY') saveProfile({ ...profile, role: 'DELIVERY' });

  logAudit('LINK_COURIER_USER', 'courier', courierId, { user_id: userId, email: profile.email });
  return { success: true };
}

// --- CONFIGURAÇÕES DA LOJA ---
export function getStoreSettings(): StoreSettings {
  return getItem<StoreSettings>(KEYS.SETTINGS, demoDefault(INITIAL_STORE_SETTINGS, LOADING_SETTINGS));
}

export async function updateStoreSettings(settings: Partial<StoreSettings>): Promise<Result> {
  const current = getStoreSettings();
  if (!IS_DEMO_MODE) return remote.remoteUpdateSettings(current.id, settings);

  setItem(KEYS.SETTINGS, { ...current, ...settings });
  logAudit('UPDATE_SETTINGS', 'store_settings', current.id, settings);
  return { success: true };
}

export function toggleStoreOpen(): Promise<Result> {
  return setStoreStatus(getStoreSettings().is_open ? 'CLOSED' : 'OPEN');
}

export function setStoreStatus(status: 'OPEN' | 'CLOSED' | 'PAUSED'): Promise<Result> {
  return updateStoreSettings({
    store_status: status,
    is_open: status === 'OPEN',
    accepting_orders: status === 'OPEN',
  });
}

// --- ZONAS DE ENTREGA ---
export function getDeliveryZones(): DeliveryZone[] {
  return getItem<DeliveryZone[]>(KEYS.ZONES, demoDefault(INITIAL_DELIVERY_ZONES, []));
}

export async function saveDeliveryZone(zone: DeliveryZone): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteSaveZone(zone);

  const zones = getDeliveryZones();
  const idx = zones.findIndex((z) => z.id === zone.id);
  if (idx >= 0) zones[idx] = zone;
  else zones.push(zone);
  setItem(KEYS.ZONES, zones);
  logAudit('SAVE_ZONE', 'delivery_zones', zone.id, { name: zone.name, fee_cents: zone.fee_cents });
  return { success: true };
}

export async function deleteDeliveryZone(id: string): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteDeleteZone(id);

  setItem(KEYS.ZONES, getDeliveryZones().filter((z) => z.id !== id));
  logAudit('DELETE_ZONE', 'delivery_zones', id);
  return { success: true };
}

/** Prévia da taxa no navegador. O valor cobrado é recalculado pelo servidor. */
export function calculateDeliveryFee(neighborhood: string): {
  fee_cents: number;
  estimated_minutes: number;
  zone?: DeliveryZone;
} {
  const target = neighborhood.trim().toLowerCase();
  const matched = getDeliveryZones()
    .filter((z) => z.is_active)
    .find((z) => z.neighborhoods.some((n) => n.trim().toLowerCase() === target));
  if (matched) {
    return { fee_cents: matched.fee_cents, estimated_minutes: matched.estimated_minutes, zone: matched };
  }
  return { fee_cents: 0, estimated_minutes: 0 };
}

// --- PEDIDOS ---
export function getOrders(): Order[] {
  return getItem<Order[]>(KEYS.ORDERS, demoDefault(INITIAL_ORDERS, []));
}

export function getOrderById(id: string): Order | undefined {
  return getOrders().find((o) => o.id === id || o.order_number.toLowerCase() === id.toLowerCase());
}

/** Busca pedido pelo token de acompanhamento (link enviado ao cliente). */
export function getOrderByGuestToken(token: string): Order | undefined {
  return getOrders().find((o) => o.guest_access_token === token);
}

/**
 * Pedidos que o visitante atual pode acompanhar: os da sua conta e os criados
 * neste navegador (token de convidado guardado localmente).
 */
export function getMyOrders(userId?: string): Order[] {
  const guestIds = new Set(remote.getGuestOrderRefs().map((r) => r.order_id));
  return getOrders().filter((o) => (userId && o.customer_id === userId) || guestIds.has(o.id));
}

/** Carrega um pedido pelo token do link de acompanhamento e passa a acompanhá-lo. */
export async function loadOrderByGuestToken(token: string): Promise<Order | undefined> {
  if (IS_DEMO_MODE) return getOrderByGuestToken(token);
  return remote.remoteLoadGuestOrder(token);
}

export async function createOrderSecure(
  params: CreateOrderParams
): Promise<{ success: boolean; order?: Order; error?: string }> {
  if (!IS_DEMO_MODE) return remote.remoteCreateOrder(params);
  return createOrderDemo(params);
}

function createOrderDemo(params: CreateOrderParams): { success: boolean; order?: Order; error?: string } {
  const settings = getStoreSettings();
  if (!settings.is_open || !settings.accepting_orders) {
    return { success: false, error: 'A hamburgueria está fechada no momento e não está aceitando pedidos.' };
  }
  if (!params.items || params.items.length === 0) {
    return { success: false, error: 'O carrinho está vazio.' };
  }

  const catalogProducts = getProducts();
  let subtotal_cents = 0;
  const now = new Date().toISOString();
  const orderId = `ord-${Date.now()}`;

  const orderItems = [];
  for (const [idx, cartItem] of params.items.entries()) {
    const official = catalogProducts.find((p) => p.id === cartItem.product.id);
    if (!official || !official.is_available) {
      return { success: false, error: `O produto "${cartItem.product.name}" não está disponível no momento.` };
    }

    // Preço dos opcionais vem do catálogo, nunca do carrinho
    let unit = official.promotional_price_cents ?? official.price_cents;
    const options = [];
    for (const sel of cartItem.selected_options) {
      const group = official.option_groups?.find((g) => g.options.some((o) => o.id === sel.option_id));
      const opt = group?.options.find((o) => o.id === sel.option_id);
      if (!group || !opt || !opt.is_available) {
        return { success: false, error: `Opcional inválido para "${official.name}".` };
      }
      const qty = Math.max(1, sel.quantity || 1);
      unit += opt.price_delta_cents * qty;
      options.push({
        option_id: opt.id,
        option_name_snapshot: `${group.name}: ${opt.name}`,
        unit_price_delta_cents: opt.price_delta_cents,
        quantity: qty,
        line_total_cents: opt.price_delta_cents * qty,
      });
    }

    const lineTotal = unit * cartItem.quantity;
    subtotal_cents += lineTotal;
    orderItems.push({
      id: `item-${Date.now()}-${idx}`,
      order_id: orderId,
      product_id: official.id,
      product_name_snapshot: official.name,
      product_image_snapshot: official.image_path,
      unit_price_cents: unit,
      quantity: cartItem.quantity,
      notes: cartItem.notes,
      line_total_cents: lineTotal,
      options,
      created_at: now,
    });
  }

  const discount_cents =
    params.coupon_code?.trim().toUpperCase() === 'BEMVINDO20' ? Math.round(subtotal_cents * 0.2) : 0;

  let delivery_fee_cents = 0;
  let estimated_minutes = settings.default_preparation_minutes;
  if (params.fulfillment_type === 'DELIVERY') {
    if (!params.delivery_address) {
      return { success: false, error: 'Endereço de entrega obrigatório para Delivery.' };
    }
    const feeInfo = calculateDeliveryFee(params.delivery_address.neighborhood);
    if (!feeInfo.zone) {
      return { success: false, error: 'Ainda não entregamos no bairro informado. Escolha retirada no balcão.' };
    }
    delivery_fee_cents = feeInfo.fee_cents;
    estimated_minutes = feeInfo.estimated_minutes;
    const minimum = Math.max(settings.minimum_order_cents, feeInfo.zone.minimum_order_cents);
    if (subtotal_cents - discount_cents < minimum) {
      return {
        success: false,
        error: `O valor mínimo para entrega é R$ ${(minimum / 100).toFixed(2).replace('.', ',')}.`,
      };
    }
  }

  const currentOrders = getOrders();
  const orderNumber = `#BH-${1044 + currentOrders.length + 1}`;
  const token = 'gst_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  const isOnline = params.payment_method === 'PIX_ONLINE' || params.payment_method === 'CARD_ONLINE';

  const newOrder: Order = {
    id: orderId,
    order_number: orderNumber,
    customer_id: params.customer_id,
    customer_name: params.customer_name,
    customer_phone: params.customer_phone,
    fulfillment_type: params.fulfillment_type,
    status: 'AGUARDANDO_CONFIRMACAO',
    payment_status: isOnline ? 'PENDENTE' : 'PAGAMENTO_NA_ENTREGA',
    payment_method: params.payment_method,
    delivery_address_snapshot: params.fulfillment_type === 'DELIVERY' ? params.delivery_address : undefined,
    subtotal_cents,
    discount_cents,
    delivery_fee_cents,
    total_cents: Math.max(0, subtotal_cents - discount_cents + delivery_fee_cents),
    customer_notes: params.customer_notes,
    coupon_code: discount_cents > 0 ? 'BEMVINDO20' : undefined,
    cash_change_for_cents: params.payment_method === 'CASH_ON_DELIVERY' ? params.cash_change_for_cents : undefined,
    estimated_delivery_time: new Date(Date.now() + estimated_minutes * 60000).toISOString(),
    guest_access_token: token,
    items: orderItems,
    created_at: now,
    updated_at: now,
  };

  currentOrders.unshift(newOrder);
  remote.rememberGuestOrder(orderId, token);
  setItem(KEYS.ORDERS, currentOrders);
  recordHistory(orderId, null, 'AGUARDANDO_CONFIRMACAO', 'Novo pedido criado pelo cliente');
  addNotification({
    type: 'NEW_ORDER',
    title: `Novo Pedido Recebido ${orderNumber}`,
    message: `${newOrder.customer_name} enviou um pedido de ${orderItems.length} itens.`,
    order_id: orderId,
    recipient_role: 'ADMIN',
  });
  logAudit('CREATE_ORDER', 'orders', orderId, { order_number: orderNumber, total_cents: newOrder.total_cents });
  return { success: true, order: newOrder };
}

/** Somente modo demonstração: simula a aprovação do gateway de pagamento. */
export function simulateDemoPaymentApproval(orderId: string): Result {
  if (!IS_DEMO_MODE) return { success: false, error: 'Disponível apenas no modo demonstração.' };
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { success: false, error: 'Pedido não encontrado.' };
  order.payment_status = 'PAGO';
  order.updated_at = new Date().toISOString();
  setItem(KEYS.ORDERS, orders);
  logAudit('DEMO_PAYMENT_APPROVED', 'orders', orderId);
  return { success: true };
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  actorRole: UserRole,
  actorName: string,
  reason?: string
): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteUpdateOrderStatus(orderId, newStatus, reason);

  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { success: false, error: 'Pedido não encontrado.' };

  const validationError = validateStatusChange(order, newStatus, actorRole, reason);
  if (validationError) return { success: false, error: validationError };

  const oldStatus = order.status;
  const now = new Date().toISOString();
  order.status = newStatus;
  order.updated_at = now;

  if (newStatus === 'CONFIRMADO') {
    order.confirmed_at = now;
  } else if (newStatus === 'CONCLUIDO') {
    order.completed_at = now;
  } else if (newStatus === 'CANCELADO') {
    order.cancelled_at = now;
    order.cancellation_reason = reason?.trim() || 'Cancelado a pedido do cliente';
    if (order.payment_status === 'PAGO') order.payment_status = 'REEMBOLSO_PENDENTE';
    else if (order.payment_status !== 'PAGO_NA_ENTREGA') order.payment_status = 'CANCELADO';
  }

  setItem(KEYS.ORDERS, orders);
  recordHistory(orderId, oldStatus, newStatus, reason || `Status atualizado por ${actorName} (${actorRole})`);
  addNotification({
    type: newStatus === 'CANCELADO' ? 'CANCELLED' : newStatus === 'PRONTO' ? 'ORDER_READY' : 'ORDER_CONFIRMED',
    title: `Pedido ${order.order_number}: ${newStatus.replace(/_/g, ' ')}`,
    message: `Status atualizado para ${newStatus.replace(/_/g, ' ')} por ${actorName}.`,
    order_id: orderId,
  });
  logAudit('UPDATE_ORDER_STATUS', 'orders', orderId, { previous: oldStatus, next: newStatus, actor: actorName });
  return { success: true };
}

export async function assignCourierToOrder(orderId: string, courierId: string, assignedByName: string): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteAssignCourier(orderId, courierId);

  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { success: false, error: 'Pedido não encontrado' };
  if (order.fulfillment_type !== 'DELIVERY') {
    return { success: false, error: 'Este pedido é para Retirada no balcão e não exige entregador.' };
  }
  if (order.status === 'EM_ENTREGA' || order.status === 'CONCLUIDO' || order.status === 'CANCELADO') {
    return { success: false, error: `Não é possível atribuir entregador a um pedido ${order.status}.` };
  }

  const courier = getCourierById(courierId);
  if (!courier || courier.status !== 'ATIVO') {
    return { success: false, error: 'Entregador inválido, inativo ou bloqueado.' };
  }

  order.assigned_courier_id = courier.id;
  order.assigned_courier_name = courier.full_name;
  order.assigned_courier_phone = courier.phone;
  order.updated_at = new Date().toISOString();

  const deliveries = getItem<DeliveryRecord[]>(KEYS.DELIVERIES, []).filter((d) => d.order_id !== orderId);
  deliveries.push({
    id: `del-${Date.now()}`,
    order_id: orderId,
    courier_id: courier.id,
    courier_name: courier.full_name,
    courier_phone: courier.phone,
    status: 'ATRIBUIDA',
    assigned_by: assignedByName,
    assigned_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  setItem(KEYS.DELIVERIES, deliveries, false);
  setItem(KEYS.ORDERS, orders);

  addNotification({
    type: 'COURIER_ASSIGNED',
    title: 'Nova Entrega Atribuída!',
    message: `${courier.full_name}, você foi escalado para entregar o pedido ${order.order_number}.`,
    order_id: orderId,
    recipient_id: courier.id,
    recipient_role: 'DELIVERY',
  });
  logAudit('ASSIGN_COURIER', 'deliveries', orderId, { courier: courier.full_name, assigned_by: assignedByName });
  return { success: true };
}

export function cancelOrder(orderId: string, reason: string, cancelledByName: string): Promise<Result> {
  if (!reason || reason.trim().length < 3) {
    return Promise.resolve({ success: false, error: 'O motivo do cancelamento é obrigatório e deve ser detalhado.' });
  }
  return updateOrderStatus(orderId, 'CANCELADO', 'ADMIN', cancelledByName, reason.trim());
}

/**
 * Entregador atualiza a entrega. `courierId` é o id do cadastro em `couriers`.
 */
export async function updateCourierDeliveryStatus(
  orderId: string,
  courierId: string,
  action: 'PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
  paymentCollected?: boolean
): Promise<Result> {
  if (!IS_DEMO_MODE) return remote.remoteCourierAction(orderId, action, paymentCollected);

  const order = getOrders().find((o) => o.id === orderId);
  if (!order) return { success: false, error: 'Pedido não encontrado' };
  if (order.assigned_courier_id !== courierId) {
    return { success: false, error: 'Não autorizado: esta entrega não está atribuída a você.' };
  }

  const courierName = order.assigned_courier_name || 'Entregador';
  if (action === 'PICKUP' || action === 'OUT_FOR_DELIVERY') {
    if (order.status !== 'PRONTO') {
      return { success: false, error: 'O pedido ainda não está pronto para retirada na cozinha.' };
    }
    return updateOrderStatus(orderId, 'EM_ENTREGA', 'DELIVERY', courierName, 'Pedido retirado pelo entregador');
  }

  if (order.payment_status === 'PAGAMENTO_NA_ENTREGA' && !paymentCollected) {
    return { success: false, error: 'Confirme o recebimento do pagamento antes de concluir a entrega.' };
  }
  const res = await updateOrderStatus(orderId, 'CONCLUIDO', 'DELIVERY', courierName, 'Entrega confirmada no destino');
  if (res.success && order.payment_status === 'PAGAMENTO_NA_ENTREGA') {
    const orders = getOrders();
    const o = orders.find((x) => x.id === orderId)!;
    o.payment_status = 'PAGO_NA_ENTREGA';
    setItem(KEYS.ORDERS, orders);
  }
  return res;
}

// Histórico de status (modo demonstração)
function recordHistory(orderId: string, previous: OrderStatus | null, next: OrderStatus, reason?: string) {
  const history = getItem<OrderStatusHistory[]>(KEYS.HISTORY, []);
  history.unshift({
    id: `hist-${Date.now()}`,
    order_id: orderId,
    previous_status: previous || 'AGUARDANDO_CONFIRMACAO',
    new_status: next,
    changed_by: getActiveProfile()?.full_name || 'Convidado',
    actor_type: getActiveProfile()?.role || 'CUSTOMER',
    reason,
    created_at: new Date().toISOString(),
  });
  setItem(KEYS.HISTORY, history.slice(0, 100), false);
}

// Notificações (modo demonstração)
export function getNotifications(): NotificationItem[] {
  return getItem<NotificationItem[]>(KEYS.NOTIFICATIONS, []);
}

export function addNotification(notification: Omit<NotificationItem, 'id' | 'created_at'>): void {
  const notifs = getNotifications();
  notifs.unshift({ ...notification, id: `notif-${Date.now()}`, created_at: new Date().toISOString() });
  setItem(KEYS.NOTIFICATIONS, notifs.slice(0, 50), false);
}

export function markNotificationAsRead(id: string): void {
  const notifs = getNotifications();
  const target = notifs.find((n) => n.id === id);
  if (target) {
    target.read_at = new Date().toISOString();
    setItem(KEYS.NOTIFICATIONS, notifs);
  }
}

// Logs de Auditoria (no Supabase são gravados pelo banco)
export function getAuditLogs(): AuditLog[] {
  return getItem<AuditLog[]>(KEYS.AUDIT, []);
}

function logAudit(action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) {
  const logs = getAuditLogs();
  const activeUser = getActiveProfile();
  logs.unshift({
    id: `audit-${Date.now()}`,
    actor_id: activeUser ? activeUser.id : 'system-actor',
    actor_name: activeUser ? activeUser.full_name : 'Sistema / Convidado',
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    created_at: new Date().toISOString(),
  });
  setItem(KEYS.AUDIT, logs.slice(0, 100), false);
}

// --- UTILITÁRIOS DE EXPORTAÇÃO CSV & RELATÓRIOS ---
/** Escapa campo CSV e neutraliza fórmulas (=, +, -, @) que o Excel executaria. */
function csvField(value: unknown): string {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportOrdersToCSV(ordersList: Order[]): string {
  const headers = [
    'Numero_Pedido', 'Data_Hora', 'Cliente', 'Telefone', 'Tipo_Atendimento', 'Status', 'Status_Pagamento',
    'Forma_Pagamento', 'Subtotal_Reais', 'Taxa_Entrega_Reais', 'Desconto_Reais', 'Total_Reais', 'Entregador',
    'Endereco', 'Bairro',
  ];

  const rows = ordersList.map((o) => {
    const addr = o.delivery_address_snapshot
      ? `${o.delivery_address_snapshot.street}, ${o.delivery_address_snapshot.number}`
      : 'Retirada Balcão';
    return [
      csvField(o.order_number),
      o.created_at,
      csvField(o.customer_name),
      csvField(o.customer_phone),
      o.fulfillment_type,
      o.status,
      o.payment_status,
      o.payment_method,
      (o.subtotal_cents / 100).toFixed(2),
      (o.delivery_fee_cents / 100).toFixed(2),
      (o.discount_cents / 100).toFixed(2),
      (o.total_cents / 100).toFixed(2),
      csvField(o.assigned_courier_name || 'Nenhum'),
      csvField(addr),
      csvField(o.delivery_address_snapshot?.neighborhood || 'Balcão'),
    ].join(';');
  });

  return [headers.join(';'), ...rows].join('\r\n');
}

export function exportProductsToCSV(productsList: Product[]): string {
  const headers = [
    'ID', 'Nome', 'Categoria_ID', 'Preco_Normal_Reais', 'Preco_Promocional_Reais', 'Disponivel', 'Destaque',
    'Tempo_Preparo_Min', 'Estoque', 'Ingredientes',
  ];

  const rows = productsList.map((p) =>
    [
      p.id,
      csvField(p.name),
      p.category_id,
      (p.price_cents / 100).toFixed(2),
      p.promotional_price_cents ? (p.promotional_price_cents / 100).toFixed(2) : '',
      p.is_available ? 'SIM' : 'NAO',
      p.is_featured ? 'SIM' : 'NAO',
      p.preparation_time_minutes,
      p.track_stock ? (p.stock_quantity ?? 0) : 'ILIMITADO',
      csvField((p.ingredients || []).join(', ')),
    ].join(';')
  );

  return [headers.join(';'), ...rows].join('\r\n');
}

export function exportCouriersToCSV(couriersList: Courier[]): string {
  const headers = [
    'ID', 'Nome_Completo', 'Telefone', 'WhatsApp', 'Email', 'Veiculo', 'Modelo', 'Placa', 'Situacao',
    'Disponivel_Para_Entregas', 'Regioes_Atendimento', 'Entregas_Concluidas', 'Avaliacao',
  ];

  const rows = couriersList.map((c) =>
    [
      c.id,
      csvField(c.full_name),
      csvField(c.phone),
      csvField(c.whatsapp),
      csvField(c.email || ''),
      c.vehicle_type,
      csvField(c.vehicle_model || ''),
      csvField(c.vehicle_plate || ''),
      c.status,
      c.is_available_for_orders ? 'SIM' : 'NAO',
      csvField((c.service_areas || []).join(', ')),
      c.completed_deliveries_count,
      c.average_rating || 5.0,
    ].join(';')
  );

  return [headers.join(';'), ...rows].join('\r\n');
}

export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

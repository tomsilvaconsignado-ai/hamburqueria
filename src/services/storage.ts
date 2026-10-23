import {
  Category,
  Product,
  Order,
  OrderStatus,
  DeliveryZone,
  StoreSettings,
  UserProfile,
  DeliveryRecord,
  OrderStatusHistory,
  NotificationItem,
  AuditLog,
  CartItem,
  FulfillmentType,
  PaymentMethod,
  OrderAddressSnapshot,
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

// Chaves de armazenamento local
const KEYS = {
  CATEGORIES: 'bh_categories_v1',
  PRODUCTS: 'bh_products_v1',
  ORDERS: 'bh_orders_v1',
  ZONES: 'bh_zones_v1',
  SETTINGS: 'bh_settings_v1',
  PROFILES: 'bh_profiles_v1',
  COURIERS: 'bh_couriers_v1',
  DELIVERIES: 'bh_deliveries_v1',
  HISTORY: 'bh_history_v1',
  NOTIFICATIONS: 'bh_notifications_v1',
  AUDIT: 'bh_audit_v1',
  ACTIVE_PROFILE: 'bh_active_profile_v1',
};

// Event emitter para sincronização em tempo real (Supabase Realtime simulation)
type Listener = () => void;
const listeners: Set<Listener> = new Set();

export function subscribeToRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyRealtime() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Realtime listener error:', e);
    }
  });
}

function getItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    notifyRealtime();
  } catch (e) {
    console.error('Storage write error:', e);
  }
}

// Inicializador de dados padrão caso vazio
export function initializeStorageIfEmpty(): void {
  if (!localStorage.getItem(KEYS.PRODUCTS)) {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(INITIAL_PRODUCTS));
  }
  if (!localStorage.getItem(KEYS.CATEGORIES)) {
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(INITIAL_CATEGORIES));
  }
  if (!localStorage.getItem(KEYS.ORDERS)) {
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
  }
  if (!localStorage.getItem(KEYS.ZONES)) {
    localStorage.setItem(KEYS.ZONES, JSON.stringify(INITIAL_DELIVERY_ZONES));
  }
  if (!localStorage.getItem(KEYS.SETTINGS)) {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(INITIAL_STORE_SETTINGS));
  }
  if (!localStorage.getItem(KEYS.PROFILES)) {
    localStorage.setItem(KEYS.PROFILES, JSON.stringify(DEMO_PROFILES));
  }
  if (!localStorage.getItem(KEYS.COURIERS)) {
    localStorage.setItem(KEYS.COURIERS, JSON.stringify(INITIAL_COURIERS));
  }
  if (!localStorage.getItem(KEYS.ACTIVE_PROFILE)) {
    localStorage.setItem(KEYS.ACTIVE_PROFILE, JSON.stringify(DEMO_PROFILES[0]));
  }
}

// --- PERFIS & SESSÃO ---
export function getProfiles(): UserProfile[] {
  return getItem<UserProfile[]>(KEYS.PROFILES, DEMO_PROFILES);
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

export function saveProfile(profile: UserProfile): void {
  const profiles = getProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = { ...profile, updated_at: new Date().toISOString() };
  } else {
    profiles.push(profile);
  }
  setItem(KEYS.PROFILES, profiles);
  // Se for o usuário ativo, atualiza também
  const active = getActiveProfile();
  if (active && active.id === profile.id) {
    setItem(KEYS.ACTIVE_PROFILE, profiles[idx >= 0 ? idx : profiles.length - 1]);
  }
}

export function toggleUserStatus(userId: string, isActive: boolean): { success: boolean; error?: string } {
  const profiles = getProfiles();
  const target = profiles.find((p) => p.id === userId);
  if (!target) return { success: false, error: 'Usuário não encontrado.' };

  const currentActive = getActiveProfile();
  if (currentActive && currentActive.id === userId && !isActive) {
    return { success: false, error: 'Você não pode desativar o seu próprio perfil ativo.' };
  }

  target.is_active = isActive;
  target.updated_at = new Date().toISOString();
  setItem(KEYS.PROFILES, profiles);

  logAudit(
    isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
    'profiles',
    userId,
    { email: target.email, role: target.role }
  );

  return { success: true };
}

export function provisionFirstAdmin(email: string): { success: boolean; message: string } {
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
  return getItem<Category[]>(KEYS.CATEGORIES, INITIAL_CATEGORIES);
}

export function saveCategory(category: Category): void {
  const categories = getCategories();
  const index = categories.findIndex((c) => c.id === category.id);
  if (index >= 0) {
    categories[index] = { ...category, updated_at: new Date().toISOString() };
  } else {
    categories.push({
      ...category,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  setItem(KEYS.CATEGORIES, categories);
  logAudit('SAVE_CATEGORY', 'category', category.id, { name: category.name });
}

export function deleteCategory(id: string): { success: boolean; error?: string } {
  const products = getProducts();
  const inUse = products.some((p) => p.category_id === id);
  if (inUse) {
    return {
      success: false,
      error: 'Não é possível excluir esta categoria porque existem produtos vinculados a ela.',
    };
  }

  const categories = getCategories().filter((c) => c.id !== id);
  setItem(KEYS.CATEGORIES, categories);
  logAudit('DELETE_CATEGORY', 'category', id);
  return { success: true };
}

export function getProducts(): Product[] {
  return getItem<Product[]>(KEYS.PRODUCTS, INITIAL_PRODUCTS);
}

export function getProductById(id: string): Product | undefined {
  return getProducts().find((p) => p.id === id);
}

export function saveProduct(product: Product): void {
  const products = getProducts();
  const index = products.findIndex((p) => p.id === product.id);
  if (index >= 0) {
    products[index] = { ...product, updated_at: new Date().toISOString() };
  } else {
    products.push({ ...product, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  setItem(KEYS.PRODUCTS, products);
  logAudit('UPDATE_PRODUCT', 'product', product.id, { name: product.name, price: product.price_cents });
}

export function deleteProduct(id: string): { success: boolean; error?: string } {
  const products = getProducts();
  const target = products.find((p) => p.id === id);
  if (!target) return { success: false, error: 'Produto não encontrado.' };

  const updated = products.filter((p) => p.id !== id);
  setItem(KEYS.PRODUCTS, updated);
  logAudit('DELETE_PRODUCT', 'product', id, { name: target.name });
  return { success: true };
}

export function duplicateProduct(id: string): { success: boolean; product?: Product; error?: string } {
  const original = getProductById(id);
  if (!original) return { success: false, error: 'Produto original não encontrado.' };

  const newId = `prod-${Date.now()}`;
  const duplicated: Product = {
    ...original,
    id: newId,
    name: `${original.name} (Cópia)`,
    slug: `${original.slug}-copia-${Date.now()}`,
    sort_order: (original.sort_order || 0) + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveProduct(duplicated);
  logAudit('DUPLICATE_PRODUCT', 'product', newId, { original_id: id, name: duplicated.name });
  return { success: true, product: duplicated };
}

export function toggleProductAvailability(id: string): void {
  const products = getProducts();
  const target = products.find((p) => p.id === id);
  if (target) {
    target.is_available = !target.is_available;
    target.updated_at = new Date().toISOString();
    setItem(KEYS.PRODUCTS, products);
    logAudit('TOGGLE_AVAILABILITY', 'product', id, { is_available: target.is_available });
  }
}

// --- GESTÃO COMPLETA DE ENTREGADORES ---
export function getCouriers(): Courier[] {
  return getItem<Courier[]>(KEYS.COURIERS, INITIAL_COURIERS);
}

export function getCourierById(id: string): Courier | undefined {
  return getCouriers().find((c) => c.id === id || c.user_id === id);
}

export function saveCourier(courier: Courier): void {
  const couriers = getCouriers();
  const index = couriers.findIndex((c) => c.id === courier.id);
  if (index >= 0) {
    couriers[index] = { ...courier, updated_at: new Date().toISOString() };
  } else {
    couriers.push({
      ...courier,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  setItem(KEYS.COURIERS, couriers);
  logAudit('SAVE_COURIER', 'courier', courier.id, {
    name: courier.full_name,
    status: courier.status,
  });
}

export function deleteCourier(id: string): { success: boolean; error?: string } {
  const couriers = getCouriers();
  const target = couriers.find((c) => c.id === id);
  if (!target) return { success: false, error: 'Entregador não encontrado.' };

  // Verifica se há entregas ativas em andamento com este entregador
  const activeOrders = getOrders().filter(
    (o) => o.assigned_courier_id === id && o.status === 'EM_ENTREGA'
  );
  if (activeOrders.length > 0) {
    return {
      success: false,
      error: `Não é possível excluir o entregador pois há ${activeOrders.length} pedido(s) em trânsito com ele. Reatribua os pedidos antes.`,
    };
  }

  const updated = couriers.filter((c) => c.id !== id);
  setItem(KEYS.COURIERS, updated);
  logAudit('DELETE_COURIER', 'courier', id, { name: target.full_name });
  return { success: true };
}

export function toggleCourierStatus(id: string, status: CourierStatus): void {
  const couriers = getCouriers();
  const target = couriers.find((c) => c.id === id);
  if (target) {
    target.status = status;
    if (status === 'BLOQUEADO' || status === 'INATIVO') {
      target.is_available_for_orders = false;
    }
    target.updated_at = new Date().toISOString();
    setItem(KEYS.COURIERS, couriers);

    // Se tiver user_id vinculado, atualiza perfil
    if (target.user_id) {
      toggleUserStatus(target.user_id, status === 'ATIVO');
    }

    logAudit('TOGGLE_COURIER_STATUS', 'courier', id, { status });
  }
}

export function toggleCourierAvailability(id: string): void {
  const couriers = getCouriers();
  const target = couriers.find((c) => c.id === id);
  if (target) {
    if (target.status !== 'ATIVO') {
      return;
    }
    target.is_available_for_orders = !target.is_available_for_orders;
    target.updated_at = new Date().toISOString();
    setItem(KEYS.COURIERS, couriers);
    logAudit('TOGGLE_COURIER_AVAILABILITY', 'courier', id, {
      available: target.is_available_for_orders,
    });
  }
}

export function linkCourierToUser(courierId: string, userId: string): { success: boolean; error?: string } {
  const couriers = getCouriers();
  const courier = couriers.find((c) => c.id === courierId);
  if (!courier) return { success: false, error: 'Entregador não encontrado.' };

  const profile = getProfileById(userId);
  if (!profile) return { success: false, error: 'Usuário não encontrado.' };

  courier.user_id = profile.id;
  courier.email = profile.email;
  courier.updated_at = new Date().toISOString();
  setItem(KEYS.COURIERS, couriers);

  // Garante que o perfil seja DELIVERY
  if (profile.role !== 'DELIVERY') {
    profile.role = 'DELIVERY';
    saveProfile(profile);
  }

  logAudit('LINK_COURIER_USER', 'courier', courierId, { user_id: userId, email: profile.email });
  return { success: true };
}

// --- CONFIGURAÇÕES DA LOJA ---
export function getStoreSettings(): StoreSettings {
  return getItem<StoreSettings>(KEYS.SETTINGS, INITIAL_STORE_SETTINGS);
}

export function updateStoreSettings(settings: Partial<StoreSettings>): void {
  const current = getStoreSettings();
  const updated = { ...current, ...settings };
  setItem(KEYS.SETTINGS, updated);
  logAudit('UPDATE_SETTINGS', 'store_settings', updated.id, settings);
}

export function toggleStoreOpen(): void {
  const settings = getStoreSettings();
  const nextOpen = !settings.is_open;
  updateStoreSettings({
    is_open: nextOpen,
    accepting_orders: nextOpen,
    store_status: nextOpen ? 'OPEN' : 'CLOSED',
  });
}

export function setStoreStatus(status: 'OPEN' | 'CLOSED' | 'PAUSED'): void {
  updateStoreSettings({
    store_status: status,
    is_open: status === 'OPEN',
    accepting_orders: status === 'OPEN',
  });
}

// --- ZONAS DE ENTREGA ---
export function getDeliveryZones(): DeliveryZone[] {
  return getItem<DeliveryZone[]>(KEYS.ZONES, INITIAL_DELIVERY_ZONES);
}

export function saveDeliveryZone(zone: DeliveryZone): void {
  const zones = getDeliveryZones();
  const idx = zones.findIndex((z) => z.id === zone.id);
  if (idx >= 0) {
    zones[idx] = zone;
  } else {
    zones.push(zone);
  }
  setItem(KEYS.ZONES, zones);
  logAudit('SAVE_ZONE', 'delivery_zones', zone.id, { name: zone.name, fee_cents: zone.fee_cents });
}

export function deleteDeliveryZone(id: string): { success: boolean; error?: string } {
  const zones = getDeliveryZones().filter((z) => z.id !== id);
  setItem(KEYS.ZONES, zones);
  logAudit('DELETE_ZONE', 'delivery_zones', id);
  return { success: true };
}

export function calculateDeliveryFee(neighborhood: string): { fee_cents: number; estimated_minutes: number; zone?: DeliveryZone } {
  const zones = getDeliveryZones().filter((z) => z.is_active);
  const matched = zones.find((z) =>
    z.neighborhoods.some((n) => n.toLowerCase() === neighborhood.trim().toLowerCase())
  );
  if (matched) {
    return { fee_cents: matched.fee_cents, estimated_minutes: matched.estimated_minutes, zone: matched };
  }
  // Padrão caso não encontrado
  return { fee_cents: 990, estimated_minutes: 40 };
}

// --- PEDIDOS (ORDERS) ---
export function getOrders(): Order[] {
  return getItem<Order[]>(KEYS.ORDERS, INITIAL_ORDERS);
}

export function getOrderById(id: string): Order | undefined {
  return getOrders().find((o) => o.id === id || o.order_number.toLowerCase() === id.toLowerCase());
}

/**
 * Criação segura de pedido no padrão da Edge Function/Server:
 * - Valida itens contra catálogo oficial no storage
 * - Recalcula subtotais e taxas de forma autoritativa no servidor
 * - Registra snapshot de endereços e histórico inicial
 */
export function createOrderSecure(params: {
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
}): { success: boolean; order?: Order; error?: string } {
  const settings = getStoreSettings();
  if (!settings.is_open || !settings.accepting_orders) {
    return { success: false, error: 'A hamburgueria está fechada no momento e não está aceitando pedidos.' };
  }

  if (!params.items || params.items.length === 0) {
    return { success: false, error: 'O carrinho está vazio.' };
  }

  const catalogProducts = getProducts();
  let subtotal_cents = 0;

  // Validação segura dos itens a partir do catálogo oficial
  const orderItems = params.items.map((cartItem, idx) => {
    const officialProduct = catalogProducts.find((p) => p.id === cartItem.product.id);
    if (!officialProduct || !officialProduct.is_available) {
      throw new Error(`O produto "${cartItem.product.name}" não está disponível no momento.`);
    }

    let itemUnitCents = officialProduct.price_cents;
    const validatedOptions = cartItem.selected_options.map((opt) => {
      itemUnitCents += opt.unit_price_delta_cents;
      return {
        option_id: opt.option_id,
        option_name_snapshot: opt.option_name_snapshot,
        unit_price_delta_cents: opt.unit_price_delta_cents,
        quantity: opt.quantity || 1,
        line_total_cents: opt.unit_price_delta_cents * (opt.quantity || 1),
      };
    });

    const lineTotal = itemUnitCents * cartItem.quantity;
    subtotal_cents += lineTotal;

    return {
      id: `item-${Date.now()}-${idx}`,
      order_id: '',
      product_id: officialProduct.id,
      product_name_snapshot: officialProduct.name,
      product_image_snapshot: officialProduct.image_path,
      unit_price_cents: itemUnitCents,
      quantity: cartItem.quantity,
      notes: cartItem.notes,
      line_total_cents: lineTotal,
      options: validatedOptions,
      created_at: new Date().toISOString(),
    };
  });

  // Cálculo de desconto (ex: Cupom BEMVINDO20 = 20% off)
  let discount_cents = 0;
  if (params.coupon_code?.trim().toUpperCase() === 'BEMVINDO20') {
    discount_cents = Math.round(subtotal_cents * 0.2);
  }

  // Taxa de entrega
  let delivery_fee_cents = 0;
  let estimated_delivery_time: string | undefined;

  if (params.fulfillment_type === 'DELIVERY') {
    if (!params.delivery_address) {
      return { success: false, error: 'Endereço de entrega obrigatório para Delivery.' };
    }
    const feeInfo = calculateDeliveryFee(params.delivery_address.neighborhood);
    delivery_fee_cents = feeInfo.fee_cents;
    const minutes = feeInfo.estimated_minutes || 40;
    estimated_delivery_time = new Date(Date.now() + minutes * 60000).toISOString();
  }

  const total_cents = Math.max(0, subtotal_cents - discount_cents + delivery_fee_cents);

  if (total_cents < settings.minimum_order_cents && params.fulfillment_type === 'DELIVERY') {
    return {
      success: false,
      error: `O valor mínimo para entrega é R$ ${(settings.minimum_order_cents / 100).toFixed(2).replace('.', ',')}.`,
    };
  }

  // Geração do número legível único (#BH-XXXX)
  const currentOrders = getOrders();
  const nextNum = 1044 + currentOrders.length;
  const orderId = `ord-${Date.now()}`;
  const orderNumber = `#BH-${nextNum}`;
  const guestAccessToken = 'gst_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

  // Pagamento inicial
  const isOnlinePaid = params.payment_method === 'PIX_ONLINE' || params.payment_method === 'CARD_ONLINE';
  const initialPaymentStatus = isOnlinePaid ? 'PAGO' : 'PAGAMENTO_NA_ENTREGA';

  const newOrder: Order = {
    id: orderId,
    order_number: orderNumber,
    customer_id: params.customer_id,
    customer_name: params.customer_name,
    customer_phone: params.customer_phone,
    fulfillment_type: params.fulfillment_type,
    status: 'AGUARDANDO_CONFIRMACAO',
    payment_status: initialPaymentStatus,
    payment_method: params.payment_method,
    delivery_address_snapshot: params.delivery_address,
    subtotal_cents,
    discount_cents,
    delivery_fee_cents,
    total_cents,
    customer_notes: params.customer_notes,
    estimated_delivery_time,
    guest_access_token: guestAccessToken,
    items: orderItems.map((it) => ({ ...it, order_id: orderId })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  currentOrders.unshift(newOrder);
  setItem(KEYS.ORDERS, currentOrders);

  // Registrar histórico e notificação
  recordHistory(orderId, null, 'AGUARDANDO_CONFIRMACAO', 'Novo pedido criado pelo cliente');
  addNotification({
    type: 'NEW_ORDER',
    title: `Novo Pedido Recebido ${orderNumber}`,
    message: `${newOrder.customer_name} enviou um pedido de ${orderItems.length} itens no valor de R$ ${(total_cents / 100).toFixed(2)}.`,
    order_id: orderId,
    recipient_role: 'ADMIN',
  });

  logAudit('CREATE_ORDER', 'orders', orderId, { order_number: orderNumber, total_cents });

  return { success: true, order: newOrder };
}

// Atualização de Status da Máquina de Estados de Pedido
export function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  actorRole: 'CUSTOMER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY',
  actorName: string,
  reason?: string
): { success: boolean; error?: string } {
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, error: 'Pedido não encontrado.' };
  }

  // Validação das transições permitidas
  const oldStatus = order.status;
  if (oldStatus === 'CANCELADO' || oldStatus === 'CONCLUIDO') {
    return { success: false, error: `Pedido já finalizado como ${oldStatus} e não pode ser alterado.` };
  }

  order.status = newStatus;
  order.updated_at = new Date().toISOString();

  if (newStatus === 'CONFIRMADO') {
    order.confirmed_at = new Date().toISOString();
  } else if (newStatus === 'CONCLUIDO') {
    order.completed_at = new Date().toISOString();
    if (order.payment_status === 'PAGAMENTO_NA_ENTREGA') {
      order.payment_status = 'PAGO_NA_ENTREGA';
    }
  } else if (newStatus === 'CANCELADO') {
    order.cancelled_at = new Date().toISOString();
    order.cancellation_reason = reason || 'Cancelado pela administração';
    if (order.payment_status === 'PAGO') {
      order.payment_status = 'REEMBOLSO_PENDENTE';
    }
  }

  setItem(KEYS.ORDERS, orders);
  recordHistory(orderId, oldStatus, newStatus, reason || `Status atualizado por ${actorName} (${actorRole})`);

  addNotification({
    type: newStatus === 'CANCELADO' ? 'CANCELLED' : newStatus === 'PRONTO' ? 'ORDER_READY' : 'ORDER_CONFIRMED',
    title: `Pedido ${order.order_number}: ${newStatus.replace('_', ' ')}`,
    message: `Status atualizado para ${newStatus.replace('_', ' ')} por ${actorName}.`,
    order_id: orderId,
  });

  logAudit('UPDATE_ORDER_STATUS', 'orders', orderId, { previous: oldStatus, next: newStatus, actor: actorName });
  return { success: true };
}

// Atribuição de Entregador (Admin)
export function assignCourierToOrder(
  orderId: string,
  courierId: string,
  assignedByName: string
): { success: boolean; error?: string } {
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { success: false, error: 'Pedido não encontrado' };

  if (order.fulfillment_type !== 'DELIVERY') {
    return { success: false, error: 'Este pedido é para Retirada no balcão e não exige entregador.' };
  }

  // Busca na lista detalhada de entregadores primeiro
  const allCouriers = getCouriers();
  const courierRec = allCouriers.find((c) => c.id === courierId || c.user_id === courierId);

  if (courierRec) {
    if (courierRec.status !== 'ATIVO') {
      return { success: false, error: `Entregador não disponível: situação atual é ${courierRec.status}.` };
    }
  }

  const couriersProfiles = getProfiles().filter((p) => p.role === 'DELIVERY' && p.is_active);
  const matchedProfile = couriersProfiles.find((p) => p.id === courierId);

  const courierName = courierRec?.full_name || matchedProfile?.full_name;
  const courierPhone = courierRec?.phone || matchedProfile?.phone;

  if (!courierName) {
    return { success: false, error: 'Entregador inválido, inativo ou não encontrado.' };
  }

  order.assigned_courier_id = courierId;
  order.assigned_courier_name = courierName;
  order.assigned_courier_phone = courierPhone || '';
  order.updated_at = new Date().toISOString();

  // Criar ou atualizar registro de delivery
  const deliveries = getItem<DeliveryRecord[]>(KEYS.DELIVERIES, []);
  const existingIndex = deliveries.findIndex((d) => d.order_id === orderId);
  const deliveryData: DeliveryRecord = {
    id: `del-${Date.now()}`,
    order_id: orderId,
    courier_id: courierId,
    courier_name: courierName,
    courier_phone: courierPhone || '',
    status: 'ATRIBUIDA',
    assigned_by: assignedByName,
    assigned_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    deliveries[existingIndex] = deliveryData;
  } else {
    deliveries.push(deliveryData);
  }

  setItem(KEYS.DELIVERIES, deliveries);
  setItem(KEYS.ORDERS, orders);

  addNotification({
    type: 'COURIER_ASSIGNED',
    title: `Nova Entrega Atribuída!`,
    message: `${courierName}, você foi escalado para entregar o pedido ${order.order_number}.`,
    order_id: orderId,
    recipient_id: courierId,
    recipient_role: 'DELIVERY',
  });

  logAudit('ASSIGN_COURIER', 'deliveries', orderId, { courier: courierName, assigned_by: assignedByName });
  return { success: true };
}

// Cancelamento de Pedido com Motivo Obrigatório
export function cancelOrder(
  orderId: string,
  reason: string,
  cancelledByName: string
): { success: boolean; error?: string } {
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'O motivo do cancelamento é obrigatório e deve ser detalhado.' };
  }

  return updateOrderStatus(
    orderId,
    'CANCELADO',
    'ADMIN',
    cancelledByName,
    reason.trim()
  );
}

// Entregador atualiza status da entrega
export function updateCourierDeliveryStatus(
  orderId: string,
  courierId: string,
  action: 'PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
  paymentCollected?: boolean
): { success: boolean; error?: string } {
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { success: false, error: 'Pedido não encontrado' };

  if (order.assigned_courier_id !== courierId) {
    return { success: false, error: 'Não autorizado: esta entrega não está atribuída a você.' };
  }

  if (action === 'PICKUP') {
    // Entregador retirou na hamburgueria
    updateOrderStatus(orderId, 'EM_ENTREGA', 'DELIVERY', order.assigned_courier_name || 'Entregador', 'Pedido retirado na cozinha pelo motoboy');
  } else if (action === 'OUT_FOR_DELIVERY') {
    updateOrderStatus(orderId, 'EM_ENTREGA', 'DELIVERY', order.assigned_courier_name || 'Entregador', 'Motoboy a caminho do endereço');
  } else if (action === 'DELIVERED') {
    updateOrderStatus(orderId, 'CONCLUIDO', 'DELIVERY', order.assigned_courier_name || 'Entregador', 'Entrega confirmada no destino');
    if (paymentCollected && order.payment_status === 'PAGAMENTO_NA_ENTREGA') {
      order.payment_status = 'PAGO_NA_ENTREGA';
      setItem(KEYS.ORDERS, orders);
    }
  }

  return { success: true };
}

// Histórico de status
function recordHistory(orderId: string, previous: OrderStatus | null, next: OrderStatus, reason?: string) {
  const history = getItem<OrderStatusHistory[]>(KEYS.HISTORY, []);
  history.unshift({
    id: `hist-${Date.now()}`,
    order_id: orderId,
    previous_status: previous || 'AGUARDANDO_CONFIRMACAO',
    new_status: next,
    changed_by: 'Sistema Burger Hub',
    actor_type: 'SYSTEM',
    reason,
    created_at: new Date().toISOString(),
  });
  setItem(KEYS.HISTORY, history.slice(0, 100));
}

// Notificações
export function getNotifications(): NotificationItem[] {
  return getItem<NotificationItem[]>(KEYS.NOTIFICATIONS, []);
}

export function addNotification(notification: Omit<NotificationItem, 'id' | 'created_at'>): void {
  const notifs = getNotifications();
  notifs.unshift({
    ...notification,
    id: `notif-${Date.now()}`,
    created_at: new Date().toISOString(),
  });
  setItem(KEYS.NOTIFICATIONS, notifs.slice(0, 50));
}

export function markNotificationAsRead(id: string): void {
  const notifs = getNotifications();
  const target = notifs.find((n) => n.id === id);
  if (target) {
    target.read_at = new Date().toISOString();
    setItem(KEYS.NOTIFICATIONS, notifs);
  }
}

// Logs de Auditoria
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
  setItem(KEYS.AUDIT, logs.slice(0, 100));
}

// --- UTILITÁRIOS DE EXPORTAÇÃO CSV & RELATÓRIOS ---
export function exportOrdersToCSV(ordersList: Order[]): string {
  const headers = [
    'Numero_Pedido',
    'Data_Hora',
    'Cliente',
    'Telefone',
    'Tipo_Atendimento',
    'Status',
    'Status_Pagamento',
    'Forma_Pagamento',
    'Subtotal_Reais',
    'Taxa_Entrega_Reais',
    'Desconto_Reais',
    'Total_Reais',
    'Entregador',
    'Endereco',
    'Bairro',
  ];

  const rows = ordersList.map((o) => {
    const addr = o.delivery_address_snapshot
      ? `"${o.delivery_address_snapshot.street}, ${o.delivery_address_snapshot.number}"`
      : '"Retirada Balcão"';
    const neigh = o.delivery_address_snapshot?.neighborhood || 'Balcão';

    return [
      o.order_number,
      o.created_at,
      `"${o.customer_name.replace(/"/g, '""')}"`,
      `"${o.customer_phone}"`,
      o.fulfillment_type,
      o.status,
      o.payment_status,
      o.payment_method,
      (o.subtotal_cents / 100).toFixed(2),
      (o.delivery_fee_cents / 100).toFixed(2),
      (o.discount_cents / 100).toFixed(2),
      (o.total_cents / 100).toFixed(2),
      `"${(o.assigned_courier_name || 'Nenhum').replace(/"/g, '""')}"`,
      addr,
      `"${neigh}"`,
    ].join(';');
  });

  return [headers.join(';'), ...rows].join('\r\n');
}

export function exportProductsToCSV(productsList: Product[]): string {
  const headers = [
    'ID',
    'Nome',
    'Categoria_ID',
    'Preco_Normal_Reais',
    'Preco_Promocional_Reais',
    'Disponivel',
    'Destaque',
    'Tempo_Preparo_Min',
    'Estoque',
    'Ingredientes',
  ];

  const rows = productsList.map((p) => {
    return [
      p.id,
      `"${p.name.replace(/"/g, '""')}"`,
      p.category_id,
      (p.price_cents / 100).toFixed(2),
      p.promotional_price_cents ? (p.promotional_price_cents / 100).toFixed(2) : '',
      p.is_available ? 'SIM' : 'NAO',
      p.is_featured ? 'SIM' : 'NAO',
      p.preparation_time_minutes,
      p.track_stock ? (p.stock_quantity ?? 0) : 'ILIMITADO',
      `"${(p.ingredients || []).join(', ').replace(/"/g, '""')}"`,
    ].join(';');
  });

  return [headers.join(';'), ...rows].join('\r\n');
}

export function exportCouriersToCSV(couriersList: Courier[]): string {
  const headers = [
    'ID',
    'Nome_Completo',
    'Telefone',
    'WhatsApp',
    'Email',
    'Veiculo',
    'Modelo',
    'Placa',
    'Situacao',
    'Disponivel_Para_Entregas',
    'Regioes_Atendimento',
    'Entregas_Concluidas',
    'Avaliacao',
  ];

  const rows = couriersList.map((c) => {
    return [
      c.id,
      `"${c.full_name.replace(/"/g, '""')}"`,
      `"${c.phone}"`,
      `"${c.whatsapp}"`,
      `"${c.email || ''}"`,
      c.vehicle_type,
      `"${c.vehicle_model || ''}"`,
      `"${c.vehicle_plate || ''}"`,
      c.status,
      c.is_available_for_orders ? 'SIM' : 'NAO',
      `"${(c.service_areas || []).join(', ').replace(/"/g, '""')}"`,
      c.completed_deliveries_count,
      c.average_rating || 5.0,
    ].join(';');
  });

  return [headers.join(';'), ...rows].join('\r\n');
}

export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

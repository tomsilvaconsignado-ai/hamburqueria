// Definições de Tipos e Modelos da Plataforma Burger Hub

export type UserRole = 'CUSTOMER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

export interface UserProfile {
  id: string; // UUID referenciando auth.users
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string; // ex: 'Casa', 'Trabalho'
  recipient_name: string;
  recipient_phone: string;
  postal_code: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_path?: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductOption {
  id: string;
  option_group_id: string;
  name: string;
  price_delta_cents: number; // Inteiro em centavos (ex: 450 = R$ 4,50)
  is_available: boolean;
  sort_order: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  is_active: boolean;
  options: ProductOption[];
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  image_path: string;
  price_cents: number; // BIGINT no DB, centavos (ex: 3290 = R$ 32,90)
  original_price_cents?: number;
  promotional_price_cents?: number;
  ingredients?: string[];
  track_stock?: boolean;
  stock_quantity?: number;
  is_available: boolean;
  is_featured?: boolean;
  badge?: string; // ex: 'NEW', 'BESTSELLER', '100% ARTESANAL'
  preparation_time_minutes: number;
  sort_order: number;
  option_groups?: OptionGroup[];
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'AGUARDANDO_CONFIRMACAO'
  | 'CONFIRMADO'
  | 'EM_PREPARACAO'
  | 'PRONTO'
  | 'AGUARDANDO_RETIRADA'
  | 'EM_ENTREGA'
  | 'CONCLUIDO'
  | 'CANCELADO';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';

export type PaymentMethod =
  | 'PIX_ONLINE'
  | 'CARD_ONLINE'
  | 'CARD_ON_DELIVERY'
  | 'CASH_ON_DELIVERY';

export type PaymentStatus =
  | 'PENDENTE'
  | 'EM_PROCESSAMENTO'
  | 'PAGO'
  | 'RECUSADO'
  | 'CANCELADO'
  | 'REEMBOLSO_PENDENTE'
  | 'REEMBOLSADO'
  | 'PAGAMENTO_NA_ENTREGA'
  | 'PAGO_NA_ENTREGA';

export interface SelectedOption {
  option_id: string;
  option_name_snapshot: string;
  unit_price_delta_cents: number;
  quantity: number;
  line_total_cents: number;
}

export interface CartItem {
  id: string; // client temporary ID
  product: Product;
  quantity: number;
  selected_options: SelectedOption[];
  notes?: string;
  unit_price_cents: number;
  total_price_cents: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_name_snapshot: string;
  product_image_snapshot?: string;
  unit_price_cents: number;
  quantity: number;
  notes?: string;
  line_total_cents: number;
  options: SelectedOption[];
  created_at: string;
}

export interface OrderAddressSnapshot {
  recipient_name: string;
  recipient_phone: string;
  postal_code: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
}

export interface Order {
  id: string;
  order_number: string; // ex: '#BH-1042'
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  fulfillment_type: FulfillmentType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  delivery_address_snapshot?: OrderAddressSnapshot;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  customer_notes?: string;
  cancellation_reason?: string;
  estimated_delivery_time?: string;
  items: OrderItem[];
  guest_token_hash?: string;
  guest_access_token?: string; // Disponibilizado apenas na criação para o cliente
  assigned_courier_id?: string;
  assigned_courier_name?: string;
  assigned_courier_phone?: string;
  created_at: string;
  confirmed_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  order_id: string;
  provider: 'MERCADOPAGO' | 'STONE' | 'MANUAL';
  provider_payment_id?: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_cents: number;
  external_reference?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  pix_expires_at?: string;
  cash_change_for_cents?: number;
  created_at: string;
  confirmed_at?: string;
  updated_at: string;
}

export interface DeliveryRecord {
  id: string;
  order_id: string;
  courier_id: string;
  courier_name: string;
  courier_phone: string;
  status: 'ATRIBUIDA' | 'COLETADA' | 'EM_ROTA' | 'ENTREGUE' | 'FALHOU' | 'CANCELADA';
  assigned_by: string;
  assigned_at: string;
  picked_up_at?: string;
  out_for_delivery_at?: string;
  delivered_at?: string;
  failure_reason?: string;
  payment_collected_cents?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  neighborhoods: string[];
  postal_code_prefixes?: string[];
  fee_cents: number;
  minimum_order_cents: number;
  estimated_minutes: number;
  is_active: boolean;
}

export type VehicleType = 'MOTO' | 'BICICLETA' | 'CARRO' | 'OUTRO';
export type CourierStatus = 'ATIVO' | 'INATIVO' | 'BLOQUEADO';

export interface Courier {
  id: string; // ID do cadastro de entregador
  user_id?: string; // UUID referenciando auth.users / profiles
  full_name: string;
  photo_url?: string;
  phone: string;
  whatsapp: string;
  email?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  admin_notes?: string;
  vehicle_type: VehicleType;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_plate?: string;
  status: CourierStatus;
  is_available_for_orders: boolean;
  service_areas: string[]; // regiões ou bairros de atendimento
  total_deliveries_count: number;
  completed_deliveries_count: number;
  average_rating?: number;
  created_at: string;
  updated_at: string;
}

export interface StoreSettings {
  id: string;
  store_name: string;
  tagline: string;
  logo_path?: string;
  phone: string;
  whatsapp: string;
  address: string;
  is_open: boolean;
  accepting_orders: boolean;
  store_status: 'OPEN' | 'CLOSED' | 'PAUSED';
  opening_hours: {
    weekdays: string;
    weekends: string;
  };
  detailed_hours?: {
    day: string;
    open: string;
    close: string;
    is_closed: boolean;
  }[];
  minimum_order_cents: number;
  default_preparation_minutes: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  pickup_instructions?: string;
  accepted_payment_methods?: PaymentMethod[];
  customer_announcement?: {
    enabled: boolean;
    message: string;
    type: 'INFO' | 'WARNING' | 'ALERT';
  };
  timezone: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  previous_status: OrderStatus;
  new_status: OrderStatus;
  changed_by: string;
  actor_type: 'CUSTOMER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY' | 'SYSTEM';
  reason?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_id?: string;
  recipient_role?: UserRole | 'ALL';
  order_id?: string;
  type: 'NEW_ORDER' | 'ORDER_CONFIRMED' | 'ORDER_READY' | 'COURIER_ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  title: string;
  message: string;
  read_at?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

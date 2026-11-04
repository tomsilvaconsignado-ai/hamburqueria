import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Product, SelectedOption, FulfillmentType, OrderAddressSnapshot, DeliveryQuote } from '../../types';
import { IS_DEMO_MODE, calculateDeliveryFee, getStoreSettings, quoteDelivery, validateCoupon } from '../../services/storage';
import { getEffectivePriceCents } from '../../lib/formatters/currency';

export interface DeliveryQuoteState {
  byDistance: boolean;
  loading: boolean;
  result?: DeliveryQuote;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity: number, selectedOptions: SelectedOption[], notes?: string) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  clearCart: () => void;
  subtotalCents: number;
  couponCode: string;
  appliedCoupon: string | null;
  /** Confere o cupom no servidor; com o telefone, também a regra de primeiro pedido */
  applyCoupon: (code: string, phone?: string) => Promise<{ success: boolean; message: string }>;
  couponPercent: number;
  removeCoupon: () => void;
  discountCents: number;
  fulfillmentType: FulfillmentType;
  setFulfillmentType: (type: FulfillmentType) => void;
  deliveryAddress: OrderAddressSnapshot | null;
  setDeliveryAddress: (addr: OrderAddressSnapshot | null) => void;
  deliveryFeeCents: number;
  /** false quando o bairro informado não pertence a nenhuma zona de entrega ativa */
  deliveryZoneFound: boolean;
  /** Prévia da taxa por distância (quando a loja cobra por km) */
  deliveryQuote: DeliveryQuoteState;
  totalCents: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  totalItemsCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'bh_cart_items_v1';

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('DELIVERY');
  // Cupom é aplicado pelo cliente; validade (ex.: só primeiro pedido) é conferida no servidor
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<OrderAddressSnapshot | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addToCart = (
    product: Product,
    quantity: number,
    selectedOptions: SelectedOption[],
    notes?: string
  ) => {
    let unitPrice = getEffectivePriceCents(product);
    selectedOptions.forEach((opt) => {
      unitPrice += opt.unit_price_delta_cents * (opt.quantity || 1);
    });

    const newItem: CartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      product,
      quantity,
      selected_options: selectedOptions,
      notes,
      unit_price_cents: unitPrice,
      total_price_cents: unitPrice * quantity,
    };

    setItems((prev) => [...prev, newItem]);
    setIsCartOpen(true);
  };

  const removeFromCart = (itemId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.id === itemId) {
            const nextQty = it.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...it,
              quantity: nextQty,
              total_price_cents: it.unit_price_cents * nextQty,
            };
          }
          return it;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => {
    setItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  };

  // Cálculos monetários seguros em centavos
  const subtotalCents = items.reduce((acc, it) => acc + it.total_price_cents, 0);

  // Cupom: conferido no servidor (validade, limite, mínimo, primeiro pedido); o pedido confere de novo
  const [couponPercent, setCouponPercent] = useState(0);
  const applyCoupon = async (code: string, phone?: string) => {
    const check = await validateCoupon(code, phone, subtotalCents);
    if (!check.ok || !check.code) return { success: false, message: check.error || 'Cupom inválido ou expirado.' };
    setAppliedCoupon(check.code);
    setCouponCode(check.code);
    setCouponPercent(check.percent_off ?? 0);
    return {
      success: true,
      message: `Cupom ${check.code} aplicado: ${check.percent_off}% de desconto${check.first_order_only ? ' (primeiro pedido)' : ''}!`,
    };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponPercent(0);
  };

  const discountCents = appliedCoupon ? Math.round((subtotalCents * couponPercent) / 100) : 0;

  // Taxa por distância: o servidor consulta o Mapbox (prévia com espera curta após a digitação)
  const byDistance = !IS_DEMO_MODE && getStoreSettings().delivery_pricing_mode === 'DISTANCE';
  const addressKey =
    fulfillmentType === 'DELIVERY' && deliveryAddress
      ? [deliveryAddress.street, deliveryAddress.number, deliveryAddress.neighborhood, deliveryAddress.city, deliveryAddress.state, deliveryAddress.postal_code]
          .map((p) => (p ?? '').trim())
          .join('|')
      : '';
  const addressComplete = Boolean(
    deliveryAddress?.street.trim() && deliveryAddress.number.trim() && deliveryAddress.neighborhood.trim()
  );
  const [quote, setQuote] = useState<{ key: string; result?: DeliveryQuote }>({ key: '' });
  useEffect(() => {
    if (!byDistance || !addressComplete || !deliveryAddress) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await quoteDelivery(deliveryAddress);
      if (!cancelled) setQuote({ key: addressKey, result });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [byDistance, addressKey]);
  const currentQuote = quote.key === addressKey ? quote.result : undefined;
  const deliveryQuote: DeliveryQuoteState = {
    byDistance,
    loading: byDistance && addressComplete && !currentQuote,
    result: byDistance ? currentQuote : undefined,
  };

  // Prévia: o servidor recalcula a taxa (zona do bairro ou distância) ao criar o pedido
  const feePreview =
    fulfillmentType === 'DELIVERY' && deliveryAddress && !byDistance ? calculateDeliveryFee(deliveryAddress.neighborhood) : null;
  const deliveryZoneFound =
    fulfillmentType === 'PICKUP' || (byDistance ? Boolean(currentQuote?.ok) : Boolean(feePreview?.zone));
  const deliveryFeeCents = byDistance
    ? (currentQuote?.ok && fulfillmentType === 'DELIVERY' ? currentQuote.fee_cents ?? 0 : 0)
    : feePreview?.fee_cents ?? 0;

  const totalCents = Math.max(0, subtotalCents - discountCents + deliveryFeeCents);

  const totalItemsCount = items.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        subtotalCents,
        couponCode,
        appliedCoupon,
        applyCoupon,
        couponPercent,
        removeCoupon,
        discountCents,
        fulfillmentType,
        setFulfillmentType,
        deliveryAddress,
        setDeliveryAddress,
        deliveryFeeCents,
        deliveryZoneFound,
        deliveryQuote,
        totalCents,
        isCartOpen,
        setIsCartOpen,
        totalItemsCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve ser usado dentro de um CartProvider');
  return ctx;
};

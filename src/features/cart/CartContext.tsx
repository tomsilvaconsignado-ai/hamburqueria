import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Product, SelectedOption, FulfillmentType, OrderAddressSnapshot } from '../../types';
import { calculateDeliveryFee } from '../../services/storage';
import { getEffectivePriceCents } from '../../lib/formatters/currency';

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity: number, selectedOptions: SelectedOption[], notes?: string) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  clearCart: () => void;
  subtotalCents: number;
  couponCode: string;
  appliedCoupon: string | null;
  applyCoupon: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  discountCents: number;
  fulfillmentType: FulfillmentType;
  setFulfillmentType: (type: FulfillmentType) => void;
  deliveryAddress: OrderAddressSnapshot | null;
  setDeliveryAddress: (addr: OrderAddressSnapshot | null) => void;
  deliveryFeeCents: number;
  /** false quando o bairro informado não pertence a nenhuma zona de entrega ativa */
  deliveryZoneFound: boolean;
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

  const applyCoupon = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (clean === 'BEMVINDO20') {
      setAppliedCoupon('BEMVINDO20');
      setCouponCode('BEMVINDO20');
      return { success: true, message: 'Cupom BEMVINDO20 aplicado com sucesso: 20% de desconto!' };
    }
    return { success: false, message: 'Cupom inválido ou expirado.' };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
  };

  // Cálculos monetários seguros em centavos
  const subtotalCents = items.reduce((acc, it) => acc + it.total_price_cents, 0);

  const discountCents = appliedCoupon === 'BEMVINDO20' ? Math.round(subtotalCents * 0.2) : 0;

  // Prévia: o servidor recalcula a taxa pela zona do bairro ao criar o pedido
  const feePreview =
    fulfillmentType === 'DELIVERY' && deliveryAddress ? calculateDeliveryFee(deliveryAddress.neighborhood) : null;
  const deliveryZoneFound = fulfillmentType === 'PICKUP' || Boolean(feePreview?.zone);
  const deliveryFeeCents = feePreview?.fee_cents ?? 0;

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
        removeCoupon,
        discountCents,
        fulfillmentType,
        setFulfillmentType,
        deliveryAddress,
        setDeliveryAddress,
        deliveryFeeCents,
        deliveryZoneFound,
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

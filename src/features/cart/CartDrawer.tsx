import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, Tag, Bike, Store, AlertCircle } from 'lucide-react';
import { useCart } from './CartContext';
import { formatCentsToBRL } from '../../lib/formatters/currency';

interface CartDrawerProps {
  onProceedToCheckout: () => void;
  minimumOrderCents: number;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  onProceedToCheckout,
  minimumOrderCents,
}) => {
  const {
    items,
    isCartOpen,
    setIsCartOpen,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    totalCents,
    fulfillmentType,
    setFulfillmentType,
    couponCode,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
  } = useCart();

  const [inputCoupon, setInputCoupon] = useState(couponCode || '');
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);

  if (!isCartOpen) return null;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const res = applyCoupon(inputCoupon);
    setCouponFeedback(res.message);
    setTimeout(() => setCouponFeedback(null), 3000);
  };

  const isBelowMinimum = fulfillmentType === 'DELIVERY' && totalCents < minimumOrderCents;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="absolute inset-0" onClick={() => setIsCartOpen(false)} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#11131b] border-l border-zinc-800 text-white flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-[#0e1017]">
            <div className="flex items-center space-x-2.5">
              <ShoppingBag className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-black tracking-wide font-['Bebas_Neue',sans-serif]">
                SEU PEDIDO ({items.length})
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              {items.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-zinc-400 hover:text-red-400 transition"
                  title="Esvaziar carrinho"
                >
                  Limpar
                </button>
              )}
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fulfillment Type Toggle */}
          <div className="p-4 bg-[#141620] border-b border-zinc-800/80">
            <span className="block text-xs font-semibold text-zinc-400 mb-2">Como deseja receber?</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFulfillmentType('DELIVERY')}
                className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                  fulfillmentType === 'DELIVERY'
                    ? 'bg-amber-500 text-zinc-950 shadow-md'
                    : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <Bike className="w-4 h-4" />
                <span>Delivery (Entrega)</span>
              </button>

              <button
                onClick={() => setFulfillmentType('PICKUP')}
                className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                  fulfillmentType === 'PICKUP'
                    ? 'bg-amber-500 text-zinc-950 shadow-md'
                    : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Retirada no Balcão</span>
              </button>
            </div>
          </div>

          {/* Cart items list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-zinc-800/60 flex items-center justify-center text-zinc-500">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-zinc-200">Seu carrinho está vazio</h3>
                <p className="text-xs text-zinc-400 max-w-xs">
                  Adicione nossos hambúrgueres artesanais e porções suculentas para começar seu pedido.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 flex space-x-3.5"
                >
                  <img
                    src={item.product.image_path}
                    alt={item.product.name}
                    className="w-16 h-16 rounded-xl object-cover shrink-0"
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-bold text-white leading-tight">
                          {item.product.name}
                        </h4>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-zinc-500 hover:text-red-400 transition ml-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Selected options breakdown */}
                      {item.selected_options.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.selected_options.map((opt, i) => (
                            <p key={i} className="text-[11px] text-zinc-400">
                              • {opt.option_name_snapshot}
                            </p>
                          ))}
                        </div>
                      )}

                      {item.notes && (
                        <p className="text-[11px] text-amber-400/90 italic mt-1">
                          Obs: {item.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/50">
                      <div className="flex items-center space-x-2 bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="text-zinc-400 hover:text-white transition"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center text-zinc-200">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="text-zinc-400 hover:text-white transition"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="text-sm font-bold text-amber-400">
                        {formatCentsToBRL(item.total_price_cents)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer summary and checkout button */}
          {items.length > 0 && (
            <div className="p-5 bg-[#0e1017] border-t border-zinc-800 space-y-4">
              {/* Coupon input */}
              <div>
                <form onSubmit={handleApplyCoupon} className="flex space-x-2">
                  <div className="relative flex-1">
                    <Tag className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                    <input
                      type="text"
                      value={inputCoupon}
                      onChange={(e) => setInputCoupon(e.target.value.toUpperCase())}
                      placeholder="Cupom de desconto"
                      className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white uppercase placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Aplicar
                  </button>
                </form>
                {couponFeedback && (
                  <p className="text-[11px] text-amber-400 mt-1 font-medium">{couponFeedback}</p>
                )}
                {appliedCoupon && (
                  <div className="flex items-center justify-between text-xs text-emerald-400 mt-1.5">
                    <span>Cupom {appliedCoupon} ativo (-20%)</span>
                    <button
                      onClick={removeCoupon}
                      className="text-zinc-400 hover:text-red-400 text-[10px] underline"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-1.5 text-xs text-zinc-300 pt-2 border-t border-zinc-800/80">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold">{formatCentsToBRL(subtotalCents)}</span>
                </div>

                {discountCents > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Desconto Cupom (20%)</span>
                    <span className="font-semibold">- {formatCentsToBRL(discountCents)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Taxa de Entrega</span>
                  <span className="font-semibold">
                    {fulfillmentType === 'PICKUP' ? 'Grátis (Retirada)' : formatCentsToBRL(deliveryFeeCents)}
                  </span>
                </div>

                <div className="flex justify-between text-base font-black text-white pt-2 border-t border-zinc-800">
                  <span>Total</span>
                  <span className="text-amber-400 font-['Bebas_Neue',sans-serif] text-xl">
                    {formatCentsToBRL(totalCents)}
                  </span>
                </div>
              </div>

              {/* Minimum Order Alert */}
              {isBelowMinimum && (
                <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Pedido mínimo para entrega é {formatCentsToBRL(minimumOrderCents)}. Faltam{' '}
                    {formatCentsToBRL(minimumOrderCents - totalCents)}.
                  </span>
                </div>
              )}

              {/* Advance to Checkout */}
              <button
                onClick={() => {
                  setIsCartOpen(false);
                  onProceedToCheckout();
                }}
                disabled={isBelowMinimum}
                className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm shadow-xl shadow-red-600/30 transition transform active:scale-98 cursor-pointer"
              >
                <span>Avançar para Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

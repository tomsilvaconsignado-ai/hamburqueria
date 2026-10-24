import React, { useState } from 'react';
import { Plus, Minus, ShoppingBag, Sliders, Check } from 'lucide-react';
import { Product } from '../../types';
import { formatCentsToBRL, getEffectivePriceCents } from '../../lib/formatters/currency';
import { useCart } from '../cart/CartContext';

interface ProductCardProps {
  product: Product;
  onOpenCustomize: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onOpenCustomize,
}) => {
  const { addToCart } = useCart();
  const [qty, setQty] = useState(1);
  const [addedAnimation, setAddedAnimation] = useState(false);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.is_available) {
      alert('Este produto está temporariamente indisponível.');
      return;
    }
    // Se o produto possuir opções obrigatórias (ex: ponto da carne, pão), abrimos o modal de personalização
    const hasRequiredOptions = product.option_groups?.some((og) => og.is_required);
    if (hasRequiredOptions) {
      onOpenCustomize(product);
      return;
    }

    addToCart(product, qty, []);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1200);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.is_available) return;
    setQty((prev) => Math.min(prev + 1, 20));
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.is_available) return;
    setQty((prev) => Math.max(prev - 1, 1));
  };

  return (
    <div
      onClick={() => product.is_available && onOpenCustomize(product)}
      className={`group relative flex flex-col justify-between border rounded-3xl p-5 transition duration-300 shadow-xl ${
        product.is_available
          ? 'bg-[#151720] hover:bg-[#191c28] border-zinc-800/80 hover:border-amber-500/40 hover:shadow-2xl hover:shadow-amber-500/5 cursor-pointer'
          : 'bg-[#11131a] border-zinc-800/60 opacity-60 cursor-not-allowed'
      }`}
    >
      {/* Top badges: Price & Tags */}
      <div className="flex items-center justify-between mb-3">
        <div className="px-3 py-1 rounded-xl bg-zinc-900/90 border border-zinc-700/60 shadow-inner">
          <span className="text-base font-extrabold text-amber-400 font-['Bebas_Neue',sans-serif] tracking-wide">
            {formatCentsToBRL(getEffectivePriceCents(product))}
          </span>
        </div>

        {!product.is_available ? (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-rose-600/30 text-rose-300 border border-rose-500/40">
            PAUSADO
          </span>
        ) : product.badge ? (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-red-600/20 text-red-400 border border-red-500/30">
            {product.badge}
          </span>
        ) : null}
      </div>

      {/* Product Image */}
      <div className="relative aspect-4/3 w-full rounded-2xl overflow-hidden bg-zinc-950/40 mb-4 flex items-center justify-center">
        <img
          src={product.image_path}
          alt={product.name}
          className="w-full h-full object-cover transform group-hover:scale-106 transition duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#151720]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
      </div>

      {/* Product Details */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-black text-white group-hover:text-amber-400 transition tracking-tight">
            {product.name}
          </h3>
          <p className="text-xs text-zinc-400 line-clamp-2 mt-1.5 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Footer Actions: Quantity Controls and Add to Cart */}
        <div className="mt-5 pt-3 border-t border-zinc-800/60 flex items-center justify-between gap-2">
          {/* Quantity selector */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center space-x-2 bg-zinc-900 px-2 py-1.5 rounded-xl border border-zinc-800"
          >
            <button
              onClick={handleDecrement}
              className="w-6 h-6 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition active:scale-90"
              title="Diminuir"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-xs font-bold text-zinc-200 w-4 text-center">{qty}</span>
            <button
              onClick={handleIncrement}
              className="w-6 h-6 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center transition active:scale-90"
              title="Aumentar"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Action button */}
          <div className="flex items-center space-x-1.5">
            {product.option_groups && product.option_groups.length > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCustomize(product);
                }}
                className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">Opções</span>
              </button>
            ) : null}

            <button
              onClick={handleQuickAdd}
              className={`flex items-center justify-center p-2.5 rounded-xl text-white font-bold transition transform active:scale-95 shadow-md ${
                addedAnimation
                  ? 'bg-emerald-600 shadow-emerald-600/30'
                  : 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
              }`}
              title="Adicionar ao carrinho"
            >
              {addedAnimation ? (
                <Check className="w-4 h-4 text-white" />
              ) : (
                <ShoppingBag className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

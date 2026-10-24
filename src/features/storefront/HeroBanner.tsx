import React from 'react';
import { ShoppingBag, ArrowRight, Sparkles, Clock, ShieldCheck, Flame, Star } from 'lucide-react';
import { Product } from '../../types';
import { formatCentsToBRL, getEffectivePriceCents, getStrikethroughPriceCents } from '../../lib/formatters/currency';

interface HeroBannerProps {
  featuredProduct: Product;
  onOpenProduct: (product: Product) => void;
  onScrollToMenu: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  featuredProduct,
  onOpenProduct,
  onScrollToMenu,
}) => {
  return (
    <section className="relative overflow-hidden bg-[#0c0e14] pt-8 pb-16 lg:py-20 text-white">
      {/* Background glow and fiery ambience */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-80 h-80 bg-amber-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-10 left-10 w-96 h-96 bg-orange-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Decorative Embers / Fire dots */}
      <div className="absolute inset-0 bg-[radial-gradient(#f59e0b10_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Text Column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-red-950/70 border border-red-500/30 text-red-400 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
              <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>Destaque Exclusivo da Semana</span>
            </div>

            <div className="space-y-3">
              <span className="block text-amber-400 font-semibold text-sm lg:text-base tracking-widest uppercase">
                Cravings, Satisfied • Hambúrguer Artesanal
              </span>
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tight text-white font-['Bebas_Neue',sans-serif] leading-none">
                GOOD FOOD <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-red-500">
                  FAST & FRESH
                </span>
              </h1>
              <p className="text-zinc-300 text-base sm:text-lg max-w-xl leading-relaxed">
                200g de puro blend bovino selecionado grelhado na brasa de carvalho, ovo caipira na manteiga, queijo cheddar inglês derretido, bacon rústico crocante, rúcula fresca e molho especial autoral.
              </p>
            </div>

            {/* Price & CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center space-x-3 bg-[#151722]/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-zinc-700/60 shadow-lg">
                <span className="text-xs text-zinc-400 font-medium">Preço Especial</span>
                <span className="text-2xl font-black text-amber-400 font-['Bebas_Neue',sans-serif]">
                  {formatCentsToBRL(getEffectivePriceCents(featuredProduct))}
                </span>
                {getStrikethroughPriceCents(featuredProduct) && (
                  <span className="text-xs text-zinc-500 line-through">
                    {formatCentsToBRL(getStrikethroughPriceCents(featuredProduct)!)}
                  </span>
                )}
              </div>

              <button
                onClick={() => onOpenProduct(featuredProduct)}
                className="flex items-center space-x-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-red-600/30 transition transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <ShoppingBag className="w-5 h-5" />
                <span>Pedir Agora</span>
              </button>

              <button
                onClick={onScrollToMenu}
                className="flex items-center space-x-2 px-5 py-3.5 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 hover:text-white font-bold text-sm sm:text-base border border-zinc-700/60 transition cursor-pointer"
              >
                <span>Ver Cardápio</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Highlights row */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-zinc-800/70 max-w-xl">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Flame className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">100% Fresco</h4>
                  <p className="text-[11px] text-zinc-400">Carnes Nobres</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">Entrega Ágil</h4>
                  <p className="text-[11px] text-zinc-400">30-45 minutos</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">Qualidade</h4>
                  <p className="text-[11px] text-zinc-400">Padrão Chef</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Burger Showcase Column */}
          <div className="lg:col-span-5 relative flex justify-center">
            {/* Background circular plate glow */}
            <div className="relative w-full max-w-md aspect-square flex items-center justify-center">
              <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-amber-500/30 to-red-600/30 blur-2xl animate-pulse" />

              {/* Floating Pill Badge */}
              <div className="absolute -top-3 right-6 z-20 flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-400 text-zinc-950 font-black text-xs shadow-xl uppercase tracking-wider animate-bounce">
                <Sparkles className="w-3.5 h-3.5" />
                <span>RECEITA ORIGINAL</span>
              </div>

              {/* Burger Image Container */}
              <div
                onClick={() => onOpenProduct(featuredProduct)}
                className="relative z-10 w-full h-full rounded-3xl overflow-hidden p-2 group cursor-pointer transition transform hover:scale-102"
              >
                <img
                  src={featuredProduct.image_path}
                  alt={featuredProduct.name}
                  className="w-full h-full object-cover rounded-2xl shadow-2xl shadow-black/80 ring-1 ring-zinc-700/50 group-hover:scale-105 transition duration-500"
                />

                {/* Overlaid Burger Info pill */}
                <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-zinc-950/85 backdrop-blur-md border border-zinc-700/60 shadow-xl flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-1 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-amber-400" />
                      ))}
                      <span className="text-xs font-bold text-zinc-300 ml-1.5">4.9 (420+ avaliações)</span>
                    </div>
                    <h3 className="text-sm font-bold text-white mt-0.5">{featuredProduct.name}</h3>
                  </div>
                  <span className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-black text-xs">
                    PERSONALIZAR
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

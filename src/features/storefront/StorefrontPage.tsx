import React, { useState } from 'react';
import { HeroBanner } from './HeroBanner';
import { CategoryBar } from './CategoryBar';
import { ProductCard } from './ProductCard';
import { ProductCustomizeModal } from './ProductCustomizeModal';
import { PromoBanner } from './PromoBanner';
import { Product, Category, StoreSettings } from '../../types';

interface StorefrontPageProps {
  products: Product[];
  categories: Category[];
  settings: StoreSettings;
  onOpenProductCustomize: (product: Product) => void;
}

export const StorefrontPage: React.FC<StorefrontPageProps> = ({
  products,
  categories,
  settings,
  onOpenProductCustomize,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  const featuredProduct = products.find((p) => p.id === 'prod-spioszek') || products[0];
  const bestsellers = products.filter((p) => p.is_featured);
  const filteredProducts =
    selectedCategoryId === 'all'
      ? products
      : products.filter((p) => p.category_id === selectedCategoryId);

  return (
    <>
      {/* Customer Announcement Banner */}
      {settings.customer_announcement?.enabled && settings.customer_announcement.message && (
        <div className="bg-gradient-to-r from-amber-600 via-red-600 to-amber-600 text-zinc-950 font-bold text-xs py-2.5 px-4 text-center shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-center space-x-2">
            <span>{settings.customer_announcement.message}</span>
          </div>
        </div>
      )}

      {/* Store Closed or Paused Warning */}
      {(!settings.is_open || settings.store_status === 'PAUSED') && (
        <div className={`py-3 px-4 text-center text-xs font-bold border-b ${
          settings.store_status === 'PAUSED'
            ? 'bg-amber-950/80 border-amber-500/50 text-amber-200'
            : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
        }`}>
          <div className="max-w-7xl mx-auto flex items-center justify-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-current animate-ping" />
            <span>
              {settings.store_status === 'PAUSED'
                ? '⚠️ AVISO: A hamburgueria está com a cozinha temporariamente pausada para organização dos pedidos. Você pode navegar pelo cardápio!'
                : '🔒 AVISO: A hamburgueria está fechada no momento. Os pedidos serão aceitos assim que reabrirmos no horário de atendimento.'}
            </span>
          </div>
        </div>
      )}

      {/* Hero Banner with Featured Burger */}
      {featuredProduct && (
        <HeroBanner
          featuredProduct={featuredProduct}
          onOpenProduct={(prod) => onOpenProductCustomize(prod)}
          onScrollToMenu={() => {
            const el = document.getElementById('cardapio');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}

      {/* Category Quick Selector */}
      <div id="cardapio">
        <CategoryBar
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={(id) => setSelectedCategoryId(id)}
        />
      </div>

      {/* Bestsellers Section (Matching Image 2 "OUR BESTSELLERS") */}
      {selectedCategoryId === 'all' && (
        <section id="bestsellers" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="text-center space-y-2 mb-10">
            <span className="text-xs font-black uppercase tracking-widest text-amber-400">
              — Popular Picks —
            </span>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white font-['Bebas_Neue',sans-serif]">
              NOSSOS BESTSELLERS
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
              Os favoritos absolutos da galera, preparados com ingredientes nobres e receitas autorais
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {bestsellers.map((prod) => (
              <ProductCard
                key={prod.id}
                product={prod}
                onOpenCustomize={(p) => onOpenProductCustomize(p)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 20% OFF Special Promo Banner (Matching Image 2 Coupon Section) */}
      <PromoBanner />

      {/* Full Menu Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white font-['Bebas_Neue',sans-serif]">
              {selectedCategoryId === 'all'
                ? 'CARDÁPIO COMPLETO'
                : categories.find((c) => c.id === selectedCategoryId)?.name || 'PRODUTOS'}
            </h2>
            <p className="text-xs text-zinc-400">
              Mostrando {filteredProducts.length} opções irresistíveis
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((prod) => (
            <ProductCard
              key={prod.id}
              product={prod}
              onOpenCustomize={(p) => onOpenProductCustomize(p)}
            />
          ))}
        </div>
      </section>

      {/* Secondary Highlight Banner (Saladas Wypasionych from Image 1) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="relative overflow-hidden rounded-3xl bg-[#141620] border border-zinc-800 p-8 sm:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                RECEITAS AUTORAIS
              </span>
              <h3 className="text-3xl sm:text-4xl font-black uppercase text-white font-['Bebas_Neue',sans-serif] leading-tight">
                EXPERIMENTE NOSSAS <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-amber-400">
                  SALADAS WYPASIONYCH & ACOMPANHAMENTOS
                </span>
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-lg">
                Folhas nobres frescas colhidas diariamente, queijo parmesão ralado na hora, tiras de bacon crocante artesanal e opções completas com 180g de carne ou frango grelhado.
              </p>
              <div className="flex items-center space-x-6 pt-2">
                <div className="flex items-center space-x-2 text-xs text-zinc-300">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span>180g Carnes Nobres</span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-zinc-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Ingredientes 100% Frescos</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex justify-center">
              <img
                src="https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=700&q=80"
                alt="Salada Especial"
                className="w-full max-w-sm rounded-3xl shadow-2xl object-cover ring-1 ring-zinc-700/60"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

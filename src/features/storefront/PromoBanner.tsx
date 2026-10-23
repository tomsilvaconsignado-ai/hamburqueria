import React, { useState } from 'react';
import { Clock, Bike, Check, Copy } from 'lucide-react';
import { useCart } from '../cart/CartContext';

export const PromoBanner: React.FC = () => {
  const { applyCoupon, appliedCoupon } = useCart();
  const [copied, setCopied] = useState(false);

  const handleApplyCoupon = () => {
    applyCoupon('BEMVINDO20');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="promocoes" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 p-6 sm:p-10 text-zinc-950 shadow-2xl">
        {/* Subtle checkered or speed stripes */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-black/5 -skew-x-12 transform pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Left: Speed & Delivery */}
          <div className="md:col-span-4 flex items-center space-x-4 border-b md:border-b-0 md:border-r border-zinc-950/20 pb-4 md:pb-0 pr-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-950 text-amber-400 flex items-center justify-center shrink-0 shadow-lg">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-800">COM FOME?</span>
              <h3 className="text-2xl sm:text-3xl font-black uppercase leading-none font-['Bebas_Neue',sans-serif]">
                ENTREGAMOS <br />RÁPIDO & QUENTE!
              </h3>
            </div>
          </div>

          {/* Center: 20% OFF Offer */}
          <div className="md:col-span-5 flex items-center justify-between sm:justify-start sm:space-x-6">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-800">OFERTA ESPECIAL</span>
              <div className="flex items-baseline space-x-2">
                <span className="text-4xl sm:text-5xl font-black font-['Bebas_Neue',sans-serif] text-zinc-950 leading-none">
                  20% OFF
                </span>
                <span className="text-xs font-bold uppercase text-zinc-900 leading-tight">
                  NO SEU <br />1º PEDIDO
                </span>
              </div>
            </div>

            {/* Coupon Code Pill */}
            <button
              onClick={handleApplyCoupon}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-zinc-950 text-amber-400 font-mono font-black text-xs sm:text-sm shadow-xl hover:bg-zinc-900 transition transform active:scale-95 cursor-pointer"
              title="Clique para aplicar o cupom no carrinho"
            >
              <span>{appliedCoupon === 'BEMVINDO20' ? 'CUPOM APLICADO' : 'BEMVINDO20'}</span>
              {copied || appliedCoupon === 'BEMVINDO20' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Right: Motoboy Graphic and action */}
          <div className="md:col-span-3 flex items-center justify-center sm:justify-end">
            <div className="flex items-center space-x-3 bg-zinc-950/10 px-4 py-3 rounded-2xl border border-zinc-950/20 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-full bg-zinc-950 text-white flex items-center justify-center">
                <Bike className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-black text-zinc-950 uppercase">Rastreamento Live</p>
                <p className="text-[11px] text-zinc-800 font-medium">Do fogo até sua porta</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

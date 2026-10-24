import React, { useState, useMemo } from 'react';
import { X, Plus, Minus, ShoppingBag, Check } from 'lucide-react';
import { Product, SelectedOption } from '../../types';
import { formatCentsToBRL, getEffectivePriceCents } from '../../lib/formatters/currency';
import { useCart } from '../cart/CartContext';

interface ProductCustomizeModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductCustomizeModal: React.FC<ProductCustomizeModalProps> = ({
  product,
  onClose,
}) => {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedSingleOptions, setSelectedSingleOptions] = useState<Record<string, string>>({});
  const [selectedMultiOptions, setSelectedMultiOptions] = useState<Record<string, boolean>>({});

  // Inicializa seleções padrão para grupos obrigatórios
  React.useEffect(() => {
    if (!product) return;
    const initialSingle: Record<string, string> = {};
    const initialMulti: Record<string, boolean> = {};

    product.option_groups?.forEach((group) => {
      if (group.selection_type === 'SINGLE' && group.options.length > 0) {
        // Seleciona a primeira opção disponível por padrão
        const firstAvail = group.options.find((o) => o.is_available) || group.options[0];
        if (firstAvail) {
          initialSingle[group.id] = firstAvail.id;
        }
      }
    });

    setSelectedSingleOptions(initialSingle);
    setSelectedMultiOptions(initialMulti);
    setQuantity(1);
    setNotes('');
  }, [product]);

  // Calcula opções selecionadas consolidadas
  const consolidatedOptions: SelectedOption[] = useMemo(() => {
    if (!product || !product.option_groups) return [];
    const list: SelectedOption[] = [];

    product.option_groups.forEach((group) => {
      if (group.selection_type === 'SINGLE') {
        const selectedId = selectedSingleOptions[group.id];
        const opt = group.options.find((o) => o.id === selectedId);
        if (opt) {
          list.push({
            option_id: opt.id,
            option_name_snapshot: `${group.name}: ${opt.name}`,
            unit_price_delta_cents: opt.price_delta_cents,
            quantity: 1,
            line_total_cents: opt.price_delta_cents,
          });
        }
      } else {
        group.options.forEach((opt) => {
          if (selectedMultiOptions[opt.id]) {
            list.push({
              option_id: opt.id,
              option_name_snapshot: `${group.name}: ${opt.name}`,
              unit_price_delta_cents: opt.price_delta_cents,
              quantity: 1,
              line_total_cents: opt.price_delta_cents,
            });
          }
        });
      }
    });

    return list;
  }, [product, selectedSingleOptions, selectedMultiOptions]);

  // Preço unitário total incluindo opcionais
  const unitPriceCents = useMemo(() => {
    if (!product) return 0;
    const extrasTotal = consolidatedOptions.reduce((acc, opt) => acc + opt.unit_price_delta_cents, 0);
    return getEffectivePriceCents(product) + extrasTotal;
  }, [product, consolidatedOptions]);

  const totalPriceCents = unitPriceCents * quantity;

  if (!product) return null;

  const handleToggleMulti = (optId: string) => {
    setSelectedMultiOptions((prev) => ({
      ...prev,
      [optId]: !prev[optId],
    }));
  };

  const handleSelectSingle = (groupId: string, optId: string) => {
    setSelectedSingleOptions((prev) => ({
      ...prev,
      [groupId]: optId,
    }));
  };

  const handleAddToCart = () => {
    addToCart(product, quantity, consolidatedOptions, notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl max-h-[90vh] bg-[#12141c] border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header with image */}
        <div className="relative h-56 sm:h-64 w-full bg-zinc-950 shrink-0">
          <img
            src={product.image_path}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12141c] via-black/40 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-zinc-900/80 backdrop-blur-md text-zinc-300 hover:text-white flex items-center justify-center border border-zinc-700/60 shadow-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title and price over image */}
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white font-['Bebas_Neue',sans-serif] tracking-wide">
                {product.name}
              </h2>
              <span className="text-lg font-bold text-amber-400">
                {formatCentsToBRL(getEffectivePriceCents(product))}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable options list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-zinc-200">
          <p className="text-sm text-zinc-400 leading-relaxed">{product.description}</p>

          {/* Option Groups */}
          {product.option_groups?.map((group) => (
            <div key={group.id} className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{group.name}</h4>
                  <p className="text-xs text-zinc-400">
                    {group.selection_type === 'SINGLE'
                      ? group.is_required
                        ? 'Obrigatório • Escolha 1 opção'
                        : 'Opcional • Escolha 1 opção'
                      : `Opcional • Até ${group.max_selections} opções`}
                  </p>
                </div>
                {group.is_required && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    OBRIGATÓRIO
                  </span>
                )}
              </div>

              {/* Options list */}
              <div className="space-y-2 pt-1">
                {group.options.map((opt) => {
                  const isSingle = group.selection_type === 'SINGLE';
                  const isChecked = isSingle
                    ? selectedSingleOptions[group.id] === opt.id
                    : Boolean(selectedMultiOptions[opt.id]);

                  return (
                    <label
                      key={opt.id}
                      onClick={() =>
                        isSingle ? handleSelectSingle(group.id, opt.id) : handleToggleMulti(opt.id)
                      }
                      className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/60 text-white'
                          : 'bg-zinc-950/40 border-zinc-800/70 text-zinc-300 hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-5 h-5 rounded-${
                            isSingle ? 'full' : 'md'
                          } border flex items-center justify-center transition ${
                            isChecked
                              ? 'bg-amber-500 border-amber-500 text-zinc-950'
                              : 'border-zinc-600 bg-zinc-900'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className="text-xs sm:text-sm font-medium">{opt.name}</span>
                      </div>

                      {opt.price_delta_cents > 0 && (
                        <span className="text-xs font-bold text-amber-400">
                          + {formatCentsToBRL(opt.price_delta_cents)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Observations / Special Notes */}
          <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-2">
            <h4 className="text-sm font-bold text-white">Observações para a Cozinha</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sem picles, molho à parte, alergia alimentar, etc."
              rows={2}
              className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition resize-none"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-6 bg-[#0c0e14] border-t border-zinc-800 flex items-center justify-between gap-4 shrink-0">
          {/* Quantity Controls */}
          <div className="flex items-center space-x-3 bg-zinc-900 px-3 py-2 rounded-2xl border border-zinc-800">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-200 hover:text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-white w-6 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-200 hover:text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Button with Total */}
          <button
            onClick={handleAddToCart}
            className="flex-1 flex items-center justify-between px-6 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm sm:text-base shadow-xl shadow-red-600/30 transition transform active:scale-95 cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <ShoppingBag className="w-5 h-5" />
              <span>Adicionar</span>
            </div>
            <span>{formatCentsToBRL(totalPriceCents)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

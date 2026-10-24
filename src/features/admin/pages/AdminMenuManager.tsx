import React, { useState } from 'react';
import { reportResult } from '../../../lib/reportResult';
import {
  Flame,
  Plus,
  Search,
  Filter,
  Edit2,
  Copy,
  Trash2,
  Upload,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  FolderPlus,
  Download,
  X,
  Sparkles,
} from 'lucide-react';
import { Product, Category, OptionGroup } from '../../../types';
import {
  saveProduct,
  deleteProduct,
  duplicateProduct,
  toggleProductAvailability,
  saveCategory,
  deleteCategory,
  exportProductsToCSV,
  downloadCSV,
} from '../../../services/storage';
import { uploadImageFile } from '../../../services/upload.service';
import { formatCentsToBRL } from '../../../lib/formatters/currency';

interface AdminMenuManagerProps {
  products: Product[];
  categories: Category[];
  onReloadData: () => void;
  openCreateModal?: boolean;
  onCloseCreateModal?: () => void;
}

export const AdminMenuManager: React.FC<AdminMenuManagerProps> = ({
  products,
  categories,
  onReloadData,
  openCreateModal = false,
  onCloseCreateModal,
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'UNAVAILABLE'>('ALL');

  // Modal Product State
  const [isProductModalOpen, setIsProductModalOpen] = useState(openCreateModal);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState(categories[0]?.id || 'cat-burgers');
  const [formDescription, setFormDescription] = useState('');
  const [formImagePath, setFormImagePath] = useState('');
  const [formPriceStr, setFormPriceStr] = useState('');
  const [formPromotionalPriceStr, setFormPromotionalPriceStr] = useState('');
  const [formPrepMinutes, setFormPrepMinutes] = useState(20);
  const [formSortOrder, setFormSortOrder] = useState(1);
  const [formBadge, setFormBadge] = useState('');
  const [formIsFeatured, setFormIsFeatured] = useState(false);
  const [formIsAvailable, setFormIsAvailable] = useState(true);
  const [formTrackStock, setFormTrackStock] = useState(false);
  const [formStockQuantity, setFormStockQuantity] = useState(50);
  const [formIngredientsStr, setFormIngredientsStr] = useState('');

  // Option Groups & Extras Form State
  const [formOptionGroups, setFormOptionGroups] = useState<OptionGroup[]>([]);

  // Image Upload status
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catSortOrder, setCatSortOrder] = useState(1);

  // Delete Confirm Modal State
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  // Quick Price Edit Inline Modal State
  const [quickPriceProduct, setQuickPriceProduct] = useState<Product | null>(null);
  const [quickPriceInput, setQuickPriceInput] = useState('');

  const openNewProductModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory(categories[0]?.id || 'cat-burgers');
    setFormDescription('');
    setFormImagePath('https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=85');
    setFormPriceStr('');
    setFormPromotionalPriceStr('');
    setFormPrepMinutes(20);
    setFormSortOrder(products.length + 1);
    setFormBadge('');
    setFormIsFeatured(false);
    setFormIsAvailable(true);
    setFormTrackStock(false);
    setFormStockQuantity(50);
    setFormIngredientsStr('');
    setFormOptionGroups([]);
    setUploadError(null);
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormCategory(prod.category_id);
    setFormDescription(prod.description);
    setFormImagePath(prod.image_path);
    setFormPriceStr((prod.price_cents / 100).toFixed(2).replace('.', ','));
    setFormPromotionalPriceStr(
      prod.promotional_price_cents
        ? (prod.promotional_price_cents / 100).toFixed(2).replace('.', ',')
        : ''
    );
    setFormPrepMinutes(prod.preparation_time_minutes || 20);
    setFormSortOrder(prod.sort_order || 1);
    setFormBadge(prod.badge || '');
    setFormIsFeatured(Boolean(prod.is_featured));
    setFormIsAvailable(prod.is_available);
    setFormTrackStock(Boolean(prod.track_stock));
    setFormStockQuantity(prod.stock_quantity ?? 50);
    setFormIngredientsStr((prod.ingredients || []).join(', '));
    setFormOptionGroups(prod.option_groups || []);
    setUploadError(null);
    setIsProductModalOpen(true);
  };

  // Image Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    setUploadError(null);
    const res = await uploadImageFile(file);
    setUploadLoading(false);

    if (!res.success || !res.url) {
      setUploadError(res.error || 'Falha no upload da imagem.');
    } else {
      setFormImagePath(res.url);
    }
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const priceCents = Math.round(parseFloat(formPriceStr.replace(',', '.')) * 100);
    if (isNaN(priceCents) || priceCents <= 0) {
      alert('Por favor, informe um preço normal válido.');
      return;
    }

    let promotionalCents: number | undefined;
    if (formPromotionalPriceStr.trim()) {
      const pCents = Math.round(parseFloat(formPromotionalPriceStr.replace(',', '.')) * 100);
      if (!isNaN(pCents) && pCents > 0) {
        promotionalCents = pCents;
      }
    }

    const ingredientsList = formIngredientsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const productId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const slug = formName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const productData: Product = {
      id: productId,
      category_id: formCategory,
      name: formName.trim(),
      slug: slug || `prod-${Date.now()}`,
      description: formDescription.trim(),
      image_path: formImagePath || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=85',
      price_cents: priceCents,
      original_price_cents: promotionalCents ? priceCents : undefined,
      promotional_price_cents: promotionalCents,
      is_available: formIsAvailable,
      is_featured: formIsFeatured,
      badge: formBadge.trim() || undefined,
      preparation_time_minutes: Number(formPrepMinutes) || 20,
      sort_order: Number(formSortOrder) || 1,
      track_stock: formTrackStock,
      stock_quantity: formTrackStock ? Number(formStockQuantity) || 0 : undefined,
      ingredients: ingredientsList,
      option_groups: formOptionGroups,
      created_at: editingProduct ? editingProduct.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = await saveProduct(productData);
    if (!res.success) {
      alert(res.error || 'Erro ao salvar produto.');
      return;
    }
    setIsProductModalOpen(false);
    if (onCloseCreateModal) onCloseCreateModal();
    onReloadData();
  };

  const handleDuplicate = async (id: string) => {
    const res = await duplicateProduct(id);
    if (res.success) {
      onReloadData();
    } else {
      alert(res.error || 'Erro ao duplicar produto.');
    }
  };

  const handleDeleteProductConfirm = async () => {
    if (!productToDelete) return;
    const res = await deleteProduct(productToDelete.id);
    if (!res.success) {
      alert(res.error);
    } else {
      setProductToDelete(null);
      onReloadData();
    }
  };

  const handleSaveQuickPrice = async () => {
    if (!quickPriceProduct) return;
    const cents = Math.round(parseFloat(quickPriceInput.replace(',', '.')) * 100);
    if (isNaN(cents) || cents <= 0) {
      alert('Preço inválido.');
      return;
    }
    const res = await saveProduct({ ...quickPriceProduct, price_cents: cents });
    if (!res.success) {
      alert(res.error || 'Erro ao atualizar preço.');
      return;
    }
    setQuickPriceProduct(null);
    onReloadData();
  };

  // Category Actions
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const catId = editingCategory ? editingCategory.id : `cat-${Date.now()}`;
    const slug = catSlug.trim() || catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const catData: Category = {
      ...editingCategory,
      id: catId,
      name: catName.trim(),
      slug,
      description: catDescription.trim(),
      sort_order: Number(catSortOrder) || 1,
      is_active: editingCategory ? editingCategory.is_active : true,
      created_at: editingCategory ? editingCategory.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = await saveCategory(catData);
    if (!res.success) {
      alert(res.error || 'Erro ao salvar categoria.');
      return;
    }
    setIsCategoryModalOpen(false);
    onReloadData();
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!categoryToDelete) return;
    const res = await deleteCategory(categoryToDelete.id);
    if (!res.success) {
      alert(res.error);
    } else {
      setCategoryToDelete(null);
      onReloadData();
    }
  };

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategoryFilter === 'ALL' || p.category_id === selectedCategoryFilter;
    const matchesAvailability =
      availabilityFilter === 'ALL'
        ? true
        : availabilityFilter === 'AVAILABLE'
        ? p.is_available
        : !p.is_available;
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.ingredients && p.ingredients.some((i) => i.toLowerCase().includes(searchQuery.toLowerCase())));

    return matchesCategory && matchesAvailability && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#141622] border border-zinc-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black font-['Bebas_Neue',sans-serif] tracking-wide text-white flex items-center space-x-2">
            <Flame className="w-6 h-6 text-amber-500" />
            <span>GERENCIAMENTO COMPLETO DO CARDÁPIO & PREÇOS</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Cadastre, edite fotos, defina preços promocionais, controle estoque e organize categorias
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openNewProductModal}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Produto</span>
          </button>

          <button
            onClick={() => {
              setEditingCategory(null);
              setCatName('');
              setCatSlug('');
              setCatDescription('');
              setCatSortOrder(categories.length + 1);
              setIsCategoryModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-amber-400" />
            <span>+ Nova Categoria</span>
          </button>

          <button
            onClick={() => {
              const csv = exportProductsToCSV(products);
              downloadCSV(`cardapio-burgerhub-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            }}
            className="flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs border border-zinc-800 transition cursor-pointer"
            title="Exportar Cardápio em Planilha CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'products'
              ? 'bg-amber-500 text-zinc-950 font-black'
              : 'text-zinc-400 hover:text-white bg-zinc-900'
          }`}
        >
          Produtos do Cardápio ({products.length})
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'categories'
              ? 'bg-amber-500 text-zinc-950 font-black'
              : 'text-zinc-400 hover:text-white bg-zinc-900'
          }`}
        >
          Categorias ({categories.length})
        </button>
      </div>

      {/* Tab 1: Products */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#141620] border border-zinc-800">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, descrição ou ingredientes..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1">
                <Filter className="w-4 h-4 text-zinc-400" />
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">Todas as Categorias</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value as any)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">Todos os Status</option>
                <option value="AVAILABLE">Apenas Disponíveis</option>
                <option value="UNAVAILABLE">Apenas Pausados</option>
              </select>
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full p-12 text-center text-zinc-400 bg-zinc-900/40 rounded-3xl border border-zinc-800">
                Nenhum produto encontrado com os filtros selecionados.
              </div>
            ) : (
              filteredProducts.map((prod) => {
                const categoryObj = categories.find((c) => c.id === prod.category_id);
                return (
                  <div
                    key={prod.id}
                    className={`rounded-3xl p-5 border transition-all duration-200 flex flex-col justify-between shadow-lg ${
                      prod.is_available
                        ? 'bg-[#141622] border-zinc-800 hover:border-zinc-700'
                        : 'bg-zinc-950/70 border-zinc-800/60 opacity-75'
                    }`}
                  >
                    <div>
                      {/* Top badges & image */}
                      <div className="flex space-x-3.5 mb-3">
                        <div className="relative shrink-0">
                          <img
                            src={prod.image_path}
                            alt={prod.name}
                            className="w-20 h-20 rounded-2xl object-cover border border-zinc-800"
                          />
                          {!prod.is_available && (
                            <span className="absolute inset-0 bg-black/70 rounded-2xl flex items-center justify-center text-[10px] font-black uppercase text-rose-400">
                              Pausado
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-800 text-zinc-300">
                              {categoryObj?.name || 'Geral'}
                            </span>
                            {prod.badge && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {prod.badge}
                              </span>
                            )}
                            {prod.is_featured && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-600/20 text-red-400 border border-red-500/30">
                                ★ Destaque
                              </span>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-white line-clamp-1">{prod.name}</h3>
                          <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">
                            {prod.description}
                          </p>
                        </div>
                      </div>

                      {/* Prices & Prep time */}
                      <div className="flex items-center justify-between py-2 border-t border-b border-zinc-800/80 text-xs mb-3">
                        <div>
                          <div className="flex items-baseline space-x-2">
                            <span className="text-base font-black text-amber-400 font-['Bebas_Neue',sans-serif]">
                              {formatCentsToBRL(prod.price_cents)}
                            </span>
                            {prod.promotional_price_cents && (
                              <span className="text-xs text-zinc-400 line-through">
                                {formatCentsToBRL(prod.original_price_cents || prod.price_cents)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setQuickPriceProduct(prod);
                              setQuickPriceInput((prod.price_cents / 100).toFixed(2).replace('.', ','));
                            }}
                            className="text-[10px] text-zinc-400 hover:text-amber-300 underline block"
                          >
                            Alterar Preço Rápido
                          </button>
                        </div>

                        <div className="text-right text-[11px] text-zinc-400">
                          <span>⏱️ {prod.preparation_time_minutes} min</span>
                          {prod.track_stock && (
                            <span className="block text-[10px] text-amber-400 font-bold">
                              Estoque: {prod.stock_quantity ?? 0}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Operational Buttons */}
                    <div className="flex items-center justify-between gap-1 pt-1">
                      <button
                        onClick={() => {
                          toggleProductAvailability(prod.id).then(reportResult);
                          onReloadData();
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                          prod.is_available
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {prod.is_available ? '✓ Disponível' : 'Pausado'}
                      </button>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleDuplicate(prod.id)}
                          className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
                          title="Duplicar Produto"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => openEditProductModal(prod)}
                          className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-400 hover:text-amber-300 transition"
                          title="Editar Produto Completo"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setProductToDelete(prod)}
                          className="p-2 rounded-xl bg-zinc-900 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 transition"
                          title="Excluir Produto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Categories */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-[#141620] border border-zinc-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Categorias do Cardápio
                </h3>
                <p className="text-xs text-zinc-400">
                  Organize a ordem e os nomes exibidos no topo do cardápio público
                </p>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-4">Ordem</th>
                  <th className="p-4">Nome da Categoria</th>
                  <th className="p-4">Slug (URL)</th>
                  <th className="p-4">Produtos Vinculados</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {categories.map((cat) => {
                  const linkedCount = products.filter((p) => p.category_id === cat.id).length;
                  return (
                    <tr key={cat.id} className="hover:bg-zinc-900/40 transition">
                      <td className="p-4 font-mono font-bold text-amber-400">#{cat.sort_order}</td>
                      <td className="p-4 font-bold text-white text-sm">{cat.name}</td>
                      <td className="p-4 font-mono text-zinc-400">{cat.slug}</td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold">
                          {linkedCount} produtos
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-1">
                        <button
                          onClick={() => {
                            setEditingCategory(cat);
                            setCatName(cat.name);
                            setCatSlug(cat.slug);
                            setCatDescription(cat.description || '');
                            setCatSortOrder(cat.sort_order || 1);
                            setIsCategoryModalOpen(true);
                          }}
                          className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold transition"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setCategoryToDelete(cat)}
                          className="px-3 py-1 rounded-lg bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 font-bold transition"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Product */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-lg font-black text-white flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>{editingProduct ? 'Editar Produto do Cardápio' : 'Cadastrar Novo Produto'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsProductModalOpen(false);
                  if (onCloseCreateModal) onCloseCreateModal();
                }}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProductForm} className="space-y-4 text-xs">
              {/* Product Photo Upload Section */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <label className="text-zinc-300 font-bold block">
                  Foto Principal do Produto (Supabase Storage)
                </label>
                <div className="flex items-center space-x-4">
                  <img
                    src={formImagePath || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80'}
                    alt="Preview"
                    className="w-24 h-24 rounded-2xl object-cover border border-zinc-700 shrink-0"
                  />
                  <div className="space-y-2 flex-1">
                    <label className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs cursor-pointer w-fit">
                      <Upload className="w-4 h-4" />
                      <span>{uploadLoading ? 'Enviando foto...' : 'Fazer Upload de Foto'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={uploadLoading}
                      />
                    </label>
                    <p className="text-[11px] text-zinc-400">
                      Formatos aceitos: JPG, PNG ou WebP. Tamanho máximo: 5MB.
                    </p>
                    {uploadError && (
                      <p className="text-xs text-rose-400 font-semibold">{uploadError}</p>
                    )}
                    <input
                      type="text"
                      value={formImagePath}
                      onChange={(e) => setFormImagePath(e.target.value)}
                      placeholder="Ou cole a URL direta da imagem..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2 text-white text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Nome do Produto *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Burger Trufado Especial"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Categoria *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-zinc-400 block mb-1">Descrição Detalhada *</label>
                <textarea
                  required
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descreva os ingredientes, ponto da carne, sabor do pão..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Preço Normal (R$) *</label>
                  <input
                    type="text"
                    required
                    value={formPriceStr}
                    onChange={(e) => setFormPriceStr(e.target.value)}
                    placeholder="Ex: 34,90"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Preço Promocional (R$ - opcional)</label>
                  <input
                    type="text"
                    value={formPromotionalPriceStr}
                    onChange={(e) => setFormPromotionalPriceStr(e.target.value)}
                    placeholder="Ex: 29,90"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Tempo de Preparo (min)</label>
                  <input
                    type="number"
                    value={formPrepMinutes}
                    onChange={(e) => setFormPrepMinutes(parseInt(e.target.value) || 20)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>

              {/* Ingredients & Badge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Ingredientes (separados por vírgula)</label>
                  <input
                    type="text"
                    value={formIngredientsStr}
                    onChange={(e) => setFormIngredientsStr(e.target.value)}
                    placeholder="Pão brioche, 200g carne, cheddar inglês, bacon rústico..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Selo / Destaque (Badge)</label>
                  <input
                    type="text"
                    value={formBadge}
                    onChange={(e) => setFormBadge(e.target.value)}
                    placeholder="Ex: MAIS VENDIDO, 100% ARTESANAL"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>

              {/* Toggles: Featured, Availability, Stock */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsAvailable}
                      onChange={(e) => setFormIsAvailable(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span className="text-white font-bold">Disponível para venda imediata</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsFeatured}
                      onChange={(e) => setFormIsFeatured(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span className="text-white font-bold">Destacar na página inicial</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formTrackStock}
                      onChange={(e) => setFormTrackStock(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span className="text-white font-bold">Controlar estoque</span>
                  </label>
                </div>

                {formTrackStock && (
                  <div className="max-w-xs pt-2">
                    <label className="text-zinc-400 block mb-1">Quantidade em Estoque</label>
                    <input
                      type="number"
                      value={formStockQuantity}
                      onChange={(e) => setFormStockQuantity(parseInt(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-2 text-white"
                    />
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase tracking-wider shadow-lg shadow-amber-500/20"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Category Add/Edit */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>

            <form onSubmit={handleSaveCategory} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Nome da Categoria *</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex: Combos & Smash"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Slug (identificador na URL)</label>
                <input
                  type="text"
                  value={catSlug}
                  onChange={(e) => setCatSlug(e.target.value)}
                  placeholder="combos-smash"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Descrição</label>
                <input
                  type="text"
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="Descrição exibida no cardápio..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-rose-500/40 rounded-3xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold">Excluir Produto</h3>
            </div>
            <p className="text-xs text-zinc-300">
              Tem certeza de que deseja excluir permanentemente o produto{' '}
              <strong>"{productToDelete.name}"</strong>?
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteProductConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-rose-500/40 rounded-3xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold">Excluir Categoria</h3>
            </div>
            <p className="text-xs text-zinc-300">
              Tem certeza de que deseja excluir a categoria <strong>"{categoryToDelete.name}"</strong>?
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setCategoryToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteCategoryConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Price Edit Modal */}
      {quickPriceProduct && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Alteração Rápida de Preço</h3>
            <p className="text-xs text-zinc-300">{quickPriceProduct.name}</p>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Novo Preço em Reais (R$)</label>
              <input
                type="text"
                value={quickPriceInput}
                onChange={(e) => setQuickPriceInput(e.target.value)}
                placeholder="Ex: 36,90"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setQuickPriceProduct(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs text-zinc-300 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveQuickPrice}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black"
              >
                Salvar Preço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

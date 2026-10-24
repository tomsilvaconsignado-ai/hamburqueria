import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { RoleSwitcherBar } from './components/ui/RoleSwitcherBar';
import { StorefrontPage } from './features/storefront/StorefrontPage';
import { ProductCustomizeModal } from './features/storefront/ProductCustomizeModal';
import { CartDrawer } from './features/cart/CartDrawer';
import { CheckoutModal } from './features/checkout/CheckoutModal';
import { OrderTrackingModal } from './features/orders/OrderTrackingModal';
import { GuestOrderPage } from './features/orders/GuestOrderPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { CustomerAccountPage } from './features/customer/CustomerAccountPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AuthProvider } from './features/auth/AuthContext';
import { CartProvider } from './features/cart/CartContext';
import { Product, StoreSettings, Order } from './types';
import { IS_DEMO_MODE, getProducts, getCategories, getStoreSettings, subscribeToRealtime } from './services/storage';

// Áreas internas carregadas sob demanda (o cliente não baixa o código dos painéis)
const KitchenKDS = lazy(() => import('./features/kitchen/KitchenKDS').then((m) => ({ default: m.KitchenKDS })));
const DeliveryPanel = lazy(() => import('./features/delivery/DeliveryPanel').then((m) => ({ default: m.DeliveryPanel })));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

const RouteFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center text-xs text-zinc-500">Carregando...</div>
);

function AppContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState(getCategories());
  const [settings, setSettings] = useState<StoreSettings>(getStoreSettings());

  // Modals state
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [trackedOrderId, setTrackedOrderId] = useState<string | undefined>(undefined);

  const navigate = useNavigate();
  const location = useLocation();

  const loadData = () => {
    setProducts(getProducts());
    setCategories(getCategories());
    setSettings(getStoreSettings());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToRealtime(() => {
      loadData();
    });
    return unsub;
  }, []);

  const handleOrderCompleted = (newOrder: Order) => {
    setTrackedOrderId(newOrder.id);
    setIsTrackingOpen(true);
  };

  // Determine active view based on current route
  const getActiveView = (): 'store' | 'kitchen' | 'courier' | 'admin' | 'tracking' => {
    const path = location.pathname;
    if (path.startsWith('/admin')) return 'admin';
    if (path === '/cozinha') return 'kitchen';
    if (path === '/entregador') return 'courier';
    return 'store';
  };

  const handleViewChange = (v: 'store' | 'kitchen' | 'courier' | 'admin' | 'tracking') => {
    if (v === 'store') navigate('/');
    else if (v === 'kitchen') navigate('/cozinha');
    else if (v === 'courier') navigate('/entregador');
    else if (v === 'admin') navigate('/admin');
    else if (v === 'tracking') setIsTrackingOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-zinc-950">
      {/* Seletor de perfis e simulador: somente no modo demonstração (sem Supabase) */}
      {IS_DEMO_MODE && <RoleSwitcherBar />}

      {/* Global Navbar */}
      <Navbar
        settings={settings}
        activeView={getActiveView()}
        setActiveView={handleViewChange}
        onOpenTracking={() => setIsTrackingOpen(true)}
      />

      {/* Main Application Routes */}
      <main className="flex-1">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public Storefront */}
          <Route
            path="/"
            element={
              <StorefrontPage
                products={products}
                categories={categories}
                settings={settings}
                onOpenProductCustomize={(p) => setCustomizingProduct(p)}
              />
            }
          />

          {/* Authentication Pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<RegisterPage />} />
          <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />

          {/* Protected Customer Account Area */}
          <Route
            path="/minha-conta"
            element={
              <ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN']}>
                <CustomerAccountPage />
              </ProtectedRoute>
            }
          />

          {/* Guest Tokenized Order Tracking */}
          <Route path="/acompanhar/:token" element={<GuestOrderPage />} />

          {/* Protected Kitchen KDS Area */}
          <Route
            path="/cozinha"
            element={
              <ProtectedRoute allowedRoles={['KITCHEN', 'ADMIN']}>
                <KitchenKDS />
              </ProtectedRoute>
            }
          />

          {/* Protected Courier / Delivery Area */}
          <Route
            path="/entregador"
            element={
              <ProtectedRoute allowedRoles={['DELIVERY', 'ADMIN']}>
                <DeliveryPanel />
              </ProtectedRoute>
            }
          />

          {/* Protected Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="dashboard" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pedidos"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="pedidos" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/produtos"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="produtos" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="usuarios" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/entregadores"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="entregadores" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/configuracoes"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="configuracoes" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/relatorios"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="relatorios" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/auditoria"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard subpage="auditoria" />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>

      {/* Global Footer */}
      <Footer
        settings={settings}
        onOpenTracking={() => setIsTrackingOpen(true)}
        onScrollToMenu={() => {
          if (location.pathname !== '/') {
            navigate('/');
            setTimeout(() => {
              const el = document.getElementById('cardapio');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          } else {
            const el = document.getElementById('cardapio');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />

      {/* Modals & Overlays */}
      <ProductCustomizeModal
        product={customizingProduct}
        onClose={() => setCustomizingProduct(null)}
      />

      <CartDrawer
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
        minimumOrderCents={settings.minimum_order_cents}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onOrderCompleted={handleOrderCompleted}
      />

      <OrderTrackingModal
        isOpen={isTrackingOpen}
        onClose={() => setIsTrackingOpen(false)}
        initialOrderId={trackedOrderId}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

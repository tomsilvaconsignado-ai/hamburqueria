import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, ChefHat, Bike, ShieldCheck, Zap, RefreshCw, UserCheck } from 'lucide-react';
import { UserRole } from '../../types';
import { useAuth } from '../../features/auth/AuthContext';
import { orderService } from '../../services/order.service';

interface RoleSwitcherBarProps {
  onOrderCreatedNotification?: () => void;
}

export const RoleSwitcherBar: React.FC<RoleSwitcherBarProps> = ({
  onOrderCreatedNotification,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, switchDemoRole } = useAuth();
  const [simulating, setSimulating] = React.useState(false);

  const handleRoleChange = (role: UserRole) => {
    switchDemoRole(role);
    if (role === 'CUSTOMER') navigate('/');
    else if (role === 'KITCHEN') navigate('/cozinha');
    else if (role === 'DELIVERY') navigate('/entregador');
    else if (role === 'ADMIN') navigate('/admin');
  };

  const handleSimulateNewOrder = async () => {
    setSimulating(true);
    try {
      const names = ['Bruno Castro', 'Camila Nogueira', 'Thiago Rocha', 'Juliana Mendes', 'Gabriel Alves'];
      const neighborhoods = ['Bela Vista', 'Consolação', 'Jardins', 'Pinheiros'];
      const randomName = names[Math.floor(Math.random() * names.length)];
      const randomNeigh = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];

      const res = await orderService.createOrder({
        customer_name: randomName,
        customer_phone: '(11) 9' + Math.floor(10000000 + Math.random() * 90000000),
        fulfillment_type: 'DELIVERY',
        delivery_address: {
          recipient_name: randomName,
          recipient_phone: '(11) 98888-7777',
          postal_code: '01310-100',
          street: 'Alameda Santos',
          number: String(Math.floor(Math.random() * 1500) + 100),
          neighborhood: randomNeigh,
          city: 'São Paulo',
          state: 'SP',
          reference: 'Em frente à praça',
        },
        items: [
          {
            id: `temp-${Date.now()}`,
            product: {
              id: 'prod-spioszek',
              category_id: 'cat-burgers',
              name: 'Burger Śpioszek Artesanal',
              slug: 'burger-spioszek',
              description: '200g carne bovina, ovo caipira, queijo cheddar inglês...',
              image_path: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80',
              price_cents: 3890,
              is_available: true,
              preparation_time_minutes: 20,
              sort_order: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            quantity: 1,
            selected_options: [
              {
                option_id: 'opt-done-mid',
                option_name_snapshot: 'Ponto da Carne: Ao Ponto da Casa',
                unit_price_delta_cents: 0,
                quantity: 1,
                line_total_cents: 0,
              },
              {
                option_id: 'opt-extra-bacon',
                option_name_snapshot: 'Tiras Extras de Bacon Defumado Crocante',
                unit_price_delta_cents: 650,
                quantity: 1,
                line_total_cents: 650,
              },
            ],
            notes: 'Sem cebola crua, por favor.',
            unit_price_cents: 4540,
            total_price_cents: 4540,
          },
        ],
        payment_method: 'CASH_ON_DELIVERY',
        customer_notes: 'Campainha está com defeito, bater no portão.',
      });

      if (!res.success) {
        alert(res.error);
        return;
      }
      if (onOrderCreatedNotification) onOrderCreatedNotification();
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  };

  const currentPath = location.pathname;

  return (
    <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-amber-500/30 px-3 py-2 text-xs text-zinc-300">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
            MODO DEMONSTRAÇÃO
          </span>
          <span className="hidden md:inline text-[10px] text-zinc-500">
            Dados fictícios, salvos só neste navegador
          </span>
          <span className="hidden sm:inline text-zinc-400">
            {user ? (
              <span>
                Logado como: <strong className="text-white">{user.full_name}</strong> (
                <span className="text-amber-400 font-bold">{user.role}</span>)
              </span>
            ) : (
              <span>Nenhum usuário logado (Visitante)</span>
            )}
          </span>
        </div>

        {/* View Selection Buttons */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            onClick={() => handleRoleChange('CUSTOMER')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              user?.role === 'CUSTOMER' && (currentPath === '/' || currentPath === '/minha-conta')
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Cliente</span>
          </button>

          <button
            onClick={() => handleRoleChange('KITCHEN')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              user?.role === 'KITCHEN' || currentPath === '/cozinha'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            <span>Cozinha (KDS)</span>
          </button>

          <button
            onClick={() => handleRoleChange('DELIVERY')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              user?.role === 'DELIVERY' || currentPath === '/entregador'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>Entregador</span>
          </button>

          <button
            onClick={() => handleRoleChange('ADMIN')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              user?.role === 'ADMIN' || currentPath.startsWith('/admin')
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Painel Admin</span>
          </button>

          {/* Quick Simulate Order button */}
          <button
            onClick={handleSimulateNewOrder}
            disabled={simulating}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold bg-gradient-to-r from-red-600 to-amber-600 text-white hover:from-red-500 hover:to-amber-500 transition cursor-pointer active:scale-95 disabled:opacity-50"
            title="Gera um novo pedido para testar a notificação na Cozinha e no Admin"
          >
            {simulating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
            )}
            <span>{simulating ? 'Enviando...' : '⚡ Simular Pedido'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

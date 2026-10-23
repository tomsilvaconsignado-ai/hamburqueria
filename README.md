# Burger Hub & Pittu — Plataforma Completa de Pedidos para Hamburgueria

Plataforma profissional e escalável de pedidos para hamburgueria artesanal desenvolvida com **React 19**, **TypeScript**, **Tailwind CSS**, e arquitetura **Supabase PostgreSQL** com Row Level Security (RLS) e Realtime.

---

## 🍔 1. Módulos da Aplicação

1. **Storefront & Área do Cliente**:
   - Cardápio interativo e responsivo baseado nas referências visuais de alta gastronomia com tema escuro e brasas incandescentes.
   - Destaque autoral: **Burger Śpioszek Artesanal** e **Bestsellers** (Burger Czarnuszek, Classic Cheese Burger, Peri Peri Rustic Fries, Chicken Strips).
   - Modal de personalização com ponto da carne, tipos de pão, turbinadores/adicionais pagos e observações da cozinha.
   - Carrinho dinâmico com suporte a cupom de desconto promocional (`BEMVINDO20` para 20% OFF).
   - Checkout completo com opções de **Delivery** e **Retirada no Balcão**.
   - Integração com **PIX Instantâneo** (QR Code gerado e chave Copia e Cola com timer de 15 minutos), **Cartão de Crédito Online** (com verificação de bandeira), **Cartão na Entrega** e **Dinheiro com Troco**.
   - Linha do tempo de rastreamento do pedido em tempo real.

2. **Cozinha Operacional (KDS - Kitchen Display System)**:
   - Painel Kanban com 4 colunas: *Confirmados*, *Em Preparação (Chapa)*, *Prontos na Bancada* e *Retirada/Balcão*.
   - Timer de preparo em minutos com alertas visuais (Verde < 15m, Amarelo 15-25m, Vermelho > 25m).
   - Checklist dos adicionais e observações de clientes e alergias alimentares.
   - Avanço de status com 1 clique sincronizado em tempo real.

3. **Área do Entregador (Motoboy)**:
   - Interface mobile-first dedicada para o entregador.
   - Visualização das entregas atribuídas, endereço completo e contato do cliente.
   - Botões diretos para navegação: **Abrir no Google Maps** e **Abrir no Waze**.
   - Fluxo de trabalho: *Confirmar Retirada* -> *Sair para Entrega* -> *Confirmar Conclusão e Recebimento de Pagamento*.
   - Histórico e cálculo de repasse de taxas por corrida do dia.

4. **Painel Administrativo & Gestão**:
   - KPIs executivos: Faturamento do dia, Pedidos hoje, Ticket Médio, Pedidos ativos e em rota.
   - Gestão de pedidos com filtros por status e busca.
   - Atribuição manual de entregadores oficiais aos pedidos prontos.
   - Controle do cardápio: edição de preços em centavos e alternância de disponibilidade (Disponível/Pausado).
   - Tabela de zonas de entrega com taxas e bairros atendidos.
   - Chave mestre de abertura/fechamento da hamburgueria (`is_open`).
   - Registro imutável de Auditoria (`Audit Logs`).

5. **Barra de Demonstração / Simulador de Pedidos**:
   - Permite alternar instantaneamente entre qualquer um dos 4 papéis sem necessidade de relogar.
   - Botão **⚡ Simular Pedido** que cria um novo pedido aleatório no sistema para ver a Cozinha, o Entregador e o Admin atualizarem em tempo real!

---

## 🗄️ 2. Banco de Dados & Migrações Supabase

As migrações SQL completas e versionadas estão localizadas na pasta `supabase/migrations/`:
- `supabase/migrations/20261023000000_initial_schema.sql`: Definição das tabelas (`profiles`, `customer_addresses`, `categories`, `products`, `option_groups`, `product_options`, `orders`, `order_items`, `payments`, `deliveries`, `delivery_zones`, `store_settings`, `order_status_history`, `notifications`, `audit_logs`), enums, restrições e índices.
- `supabase/migrations/20261023000001_rls_policies_and_functions.sql`: Ativação de Row Level Security (RLS) em todas as tabelas e funções de segurança (`get_current_user_role()`, `is_admin()`, `is_kitchen()`, `is_courier()`).

---

## ⚙️ 3. Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento (Porta 3000)
npm run dev

# 3. Compilar para produção
npm run build
```

---

## 🔒 4. Variáveis de Ambiente (.env)

Crie um arquivo `.env` baseado no `.env.example`:
```env
VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
VITE_SUPABASE_ANON_KEY="sua-chave-anonima"
```

A aplicação conta com um motor transacional persistente local (localStorage) que garante funcionamento imediato de todos os fluxos e botões mesmo sem credenciais do Supabase configuradas, migrando automaticamente para o Supabase quando as variáveis forem inseridas.

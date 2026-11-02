# Burger Hub & Pittu — Plataforma de Pedidos para Hamburgueria

Loja online, carrinho e checkout, tela da cozinha (KDS), painel do entregador e painel administrativo.
React 19 + TypeScript + Tailwind no frontend; Supabase (PostgreSQL com RLS, Auth, Realtime, Storage e Edge Functions) no backend.

---

## 1. Arquitetura

```
Navegador (SPA)                         Supabase
───────────────                         ────────
storage.ts  (fachada: leituras síncronas do cache, escritas assíncronas)
  ├─ modo Supabase → remote.ts ───────► RPCs SECURITY DEFINER (create_order, update_order_status,
  │                                     admin_assign_courier, courier_update_delivery, ...)
  │                  ◄── Realtime ────── postgres_changes (orders, products, couriers, ...)
  └─ modo demonstração → localStorage   (sem Supabase configurado)

payment.service.ts ──────────────────► Edge Function create-payment ──► Mercado Pago
                                       Edge Function mercadopago-webhook ◄── Mercado Pago
auth.service.ts (cadastro de equipe) ─► Edge Function admin-create-staff (service_role)
```

Regras importantes:

- **O navegador não é confiável.** Preço, opcionais, cupom, taxa de entrega e número do pedido são recalculados
  no banco pela função `create_order`. Pedidos e pagamentos não aceitam INSERT/UPDATE direto de usuários.
- **Máquina de estados no banco.** A trigger `enforce_order_status_transition` impede pular etapas, confirmar
  pedido online não pago e despachar sem entregador. `update_order_status` aplica a permissão por papel.
- **Pagamento online só vira `PAGO` pelo webhook**, que valida a assinatura do Mercado Pago e confere o valor.
- **Entregador vê apenas os pedidos atribuídos a ele** (RLS via vínculo `couriers.user_id`).
- **Acompanhamento de convidado** usa um token aleatório guardado como hash (`guest_token_hash`); o número
  do pedido sozinho não dá acesso.

Fluxo do pedido:

```
AGUARDANDO_CONFIRMACAO → CONFIRMADO → EM_PREPARACAO → PRONTO ─┬─ (retirada) → AGUARDANDO_RETIRADA → CONCLUIDO
        (online: só após PAGO)                                └─ (delivery, com entregador) → EM_ENTREGA → CONCLUIDO
Cancelamento: admin (com motivo) a qualquer momento antes de concluir; cliente só até CONFIRMADO.
```

## 2. Modo demonstração

Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, o app roda com dados fictícios salvos **apenas no navegador**,
com seletor de perfis e simulador de pedidos. Serve para apresentar o produto, **não para operar a loja**:
cozinha e entregador em outros aparelhos não veem os pedidos. O pipeline de deploy recusa publicar sem as variáveis.

## 3. Desenvolvimento local

```bash
npm ci
npm run dev        # http://localhost:3000 (modo demonstração se não houver .env.local)
npm run lint       # checagem de tipos
npm test           # testes (Vitest)
npm run build
```

Para usar o Supabase local: instale a [Supabase CLI](https://supabase.com/docs/guides/cli), rode
`supabase start` e `supabase db reset` (aplica as migrações e o `supabase/seed.sql`), e crie `.env.local`
a partir de `.env.example` com a URL e a anon key exibidas pelo `supabase start`.

## 4. Implantação em produção

1. **Banco**: `supabase link --project-ref <ref>` e `supabase db push`. Rode o conteúdo de
   `supabase/seed.sql` uma vez no SQL Editor para carregar o cardápio inicial (ou cadastre pelo painel).
2. **Primeiro administrador**: cadastre a conta pelo site e, no SQL Editor (como `postgres`), execute
   `select public.provision_initial_admin('seu-email@dominio.com');`. Os demais admins são promovidos pelo
   painel (Admin → Usuários).
3. **Edge Functions**:
   ```bash
   supabase functions deploy create-payment
   supabase functions deploy admin-create-staff
   supabase functions deploy mercadopago-webhook --no-verify-jwt
   supabase secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... SITE_URL=https://seu-dominio
   ```
   No Mercado Pago, cadastre o webhook (evento *Pagamentos*) apontando para
   `https://<ref>.supabase.co/functions/v1/mercadopago-webhook`.
   Só depois disso habilite **Pix Online** e **Cartão Online** em Admin → Configurações (o seed deixa apenas
   pagamento na entrega habilitado).
4. **Auth**: em Authentication → URL Configuration, defina o Site URL
   (`https://<usuario>.github.io/hamburqueria`) e as Redirect URLs do domínio. Use o mesmo endereço,
   com o `/hamburqueria`, no secret `SITE_URL` das Edge Functions.
5. **Frontend (GitHub Pages)**:
   - Em Settings → Pages → Build and deployment, selecione **Source = GitHub Actions**. Com "Deploy from a
     branch", o Pages publica o código-fonte sem compilar e a página fica em branco.
   - A URL do Supabase e a anon key (públicas) ficam em `.env.production`. O workflow recusa publicar sem elas,
     para o site nunca ir ao ar em modo demonstração. Nunca coloque a `service_role` nesse arquivo.

   O workflow `.github/workflows/ci.yml` roda typecheck, testes e build em todo push/PR e, na `main`, compila
   com `base=/hamburqueria/` e publica no Pages. O `404.html` (cópia do `index.html`) permite recarregar
   rotas internas como `/admin` e `/cozinha`.

## 5. Módulos de gestão (migração `20261101000000`)

- **Pedidos**: painel operacional por colunas, histórico com busca e período, alerta sonoro de pedido novo,
  linha do tempo com horário e responsável de cada etapa, impressão de comanda, comprovante, recibo de entrega
  e comprovante de pagamento (térmica 80 mm ou A4; "Salvar como PDF" pelo diálogo de impressão).
- **Pedido sem duplicidade**: o checkout envia um `client_request_id`; o mesmo envio repetido devolve o pedido
  já criado (`create_order` agora envolve a função original, renomeada para `create_order_core`).
- **Clientes (CRM)**: identificados pelo telefone (`phone_key`), inclusive convidados. Métricas vêm dos pedidos;
  a tabela `customer_crm` guarda o que a loja anota (VIP, aniversário, preferências, endereços extras).
- **Financeiro**: `admin_report` (bruto, descontos, líquido, despesas, saldo, por pagamento/produto/categoria/dia/
  horário), despesas (`expenses`) e fechamento de caixa (`admin_close_cash`, tabela `cash_closings`). O saldo
  não é lucro: não inclui custo de mercadorias, impostos e taxas não lançadas.
- **Entregadores**: `admin_courier_report` com entregas, horários de saída e entrega, quem atribuiu e taxas.
- **WhatsApp**: links `wa.me` com mensagens prontas por etapa. O botão **abre** o WhatsApp; quem envia é o
  atendente. Para envio automático, implemente outro `MessageChannel` (`src/lib/whatsapp.ts`) chamando uma
  Edge Function com o token da WhatsApp Cloud API — o token nunca vai para o navegador.
- **CEP**: ViaCEP (gratuito) no checkout e na ficha do cliente; o endereço continua editável.

Os cálculos rodam no banco, no fuso da loja, sobre todo o histórico. Testes do banco: `npm run test:db`
(aplica todas as migrações num Postgres em memória e testa permissões e regras; também roda no CI).

## 6. Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `src/services/storage.ts` | Fachada de dados + backend local do modo demonstração |
| `src/services/remote.ts` | Integração Supabase (leituras, Realtime, RPCs, escritas do admin) |
| `src/services/admin.service.ts` | Relatórios, clientes, despesas, caixa e entregas (funções do servidor) |
| `src/services/orderStateMachine.ts` | Regras de transição de status (espelho das regras do banco) |
| `src/lib/documents/` | Documentos impressos (HTML + CSS de impressão) |
| `src/lib/whatsapp.ts`, `src/lib/viacep.ts` | Mensagens/links de WhatsApp e consulta de CEP |
| `supabase/migrations/` | Esquema, RLS, trigger de estados e funções transacionais |
| `supabase/tests/` | Testes do banco (PGlite) |
| `supabase/functions/` | Pagamento (Mercado Pago), webhook e criação de funcionários |
| `docs/` | Prompt original do projeto e referências visuais |

## 7. Limitações conhecidas

- Endereços salvos em "Minha Conta" ainda são apenas visuais (não persistem na tabela `customer_addresses`);
  o checkout reaproveita os dados do último pedido feito no mesmo aparelho.
- A lista de pedidos do painel mostra os 300 mais recentes; relatórios, financeiro e clientes consultam todo o
  histórico no servidor.
- Notificações (tabela `notifications`) ainda não são enviadas; o acompanhamento é feito pelo Realtime.
- Taxas do Mercado Pago não são registradas automaticamente; lance-as como despesa para o saldo ficar correto.
- Mapa: há link para o OpenStreetMap no pedido; cálculo de distância/taxa por raio ainda não foi implementado
  (a taxa continua por bairro/zona).

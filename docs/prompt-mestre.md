# PROMPT MESTRE — DESENVOLVIMENTO DE PLATAFORMA COMPLETA DE PEDIDOS PARA HAMBURGUERIA

## 1. PAPEL E OBJETIVO

Atue como uma equipe sênior de engenharia de software, composta por arquiteto de sistemas, desenvolvedor frontend React/TypeScript, engenheiro backend Supabase/PostgreSQL, especialista em segurança, UX/UI designer e engenheiro de testes.

Desenvolva uma plataforma profissional, completa, funcional e pronta para implantação para uma hamburgueria, com os seguintes módulos:

1. Área pública e cliente.
2. Área administrativa.
3. Área operacional da cozinha.
4. Área do entregador.

O frontend será armazenado no GitHub e publicado pela Vercel. O backend, banco de dados, autenticação, arquivos, regras de segurança e operações de servidor serão implementados com Supabase.

O sistema não pode ser apenas um protótipo visual. Os botões, formulários, consultas, operações de banco, permissões, cálculos e transições de status devem funcionar de verdade.

Não utilizar dados fictícios como substitutos permanentes do banco de dados. Dados demonstrativos podem existir apenas em uma área de demonstração claramente identificada, separada da operação real.

## 2. INSTRUÇÃO OBRIGATÓRIA SOBRE AS IMAGENS DE REFERÊNCIA

Vou anexar imagens de layouts que deverão servir como referência visual para a construção da plataforma.

Antes de implementar cada página:

- Analise todas as imagens anexadas.
- Identifique estrutura, cores, tipografia, espaçamentos, dimensões, alinhamentos, menus, cartões, botões, campos, imagens, ícones, bordas e comportamento responsivo.
- Reproduza a identidade visual e a hierarquia visual das referências com a maior fidelidade possível.
- Utilize as imagens dos produtos que eu fornecer, preservando sua proporção e qualidade.
- Não substitua o design de referência por um template genérico de dashboard.
- Não altere arbitrariamente as cores, os formatos dos cartões ou a organização dos elementos.
- Se uma imagem apresentar uma tela desktop, reproduza essa composição no desktop e adapte-a ao celular sem perder a identidade visual.
- Se uma imagem apresentar uma tela mobile, respeite sua composição e seus padrões de navegação.
- Quando houver várias referências, associe cada imagem à tela correspondente.

Se uma imagem não estiver disponível, não invente detalhes específicos que deveriam vir dela. Implemente a estrutura funcional com uma identidade visual provisória coerente e deixe claro o que precisa ser ajustado quando a referência for fornecida.

As imagens de referência orientam o design, mas não substituem os requisitos funcionais, as regras de segurança ou a arquitetura do banco.

## 3. ARQUITETURA TÉCNICA

Frontend:
- React.
- TypeScript com configuração estrita.
- Vite.
- React Router.
- Tailwind CSS.
- shadcn/ui ou componentes equivalentes.
- Lucide React.
- TanStack Query para consultas e cache, se adequado.
- React Hook Form e Zod para formulários e validação.
- Cliente oficial @supabase/supabase-js.

Backend:
- Supabase PostgreSQL.
- Supabase Auth.
- Row Level Security (RLS).
- Supabase Realtime.
- Supabase Storage.
- Supabase Edge Functions.
- Migrações SQL versionadas.
- Funções SQL para operações transacionais que exigem consistência.

Infraestrutura:
- GitHub como repositório de código.
- Vercel como hospedagem frontend.
- Variáveis de ambiente separadas por ambiente.
- Supabase separado em desenvolvimento e produção sempre que possível.

Não implementar um backend Node.js separado sem necessidade. Utilizar Supabase Edge Functions para operações de servidor e integrações externas.

Nunca expor a chave service_role, segredos de pagamentos ou credenciais administrativas no frontend, no GitHub ou em arquivos públicos.

## 4. ESTRUTURA DE PASTAS

Organize o projeto de forma modular e mantenível:

src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  components/
    ui/
    layout/
    navigation/
    forms/
    feedback/
    orders/
    products/
  features/
    auth/
    storefront/
    catalog/
    cart/
    checkout/
    customer/
    admin/
    kitchen/
    delivery/
    orders/
    payments/
    reports/
    settings/
    notifications/
  hooks/
  lib/
    supabase/
    validation/
    permissions/
    formatters/
  services/
    auth.service.ts
    catalog.service.ts
    order.service.ts
    payment.service.ts
    delivery.service.ts
    notification.service.ts
  types/
  utils/
  styles/

supabase/
  config.toml
  migrations/
  functions/
    create-order/
    cancel-order/
    update-order-status/
    assign-delivery/
    create-payment/
    payment-webhook/
    confirm-delivery-payment/
    request-refund/
    guest-order-access/
  tests/

public/
  images/
  icons/

Criar também:
- README.md com instalação e execução.
- .env.example sem segredos.
- .gitignore.
- Documentação do banco de dados.
- Documentação dos perfis e permissões.
- Documentação das integrações externas.
- Instruções para deploy e configuração do Supabase.

Não criar arquivos gigantes contendo todo o sistema. Separar os módulos, serviços, componentes, tipos e validações.

## 5. PERFIS DE USUÁRIO E AUTORIZAÇÃO

Criar os seguintes perfis:

CUSTOMER:
Cliente registrado.

ADMIN:
Administrador autorizado da hamburgueria.

KITCHEN:
Funcionário autorizado a operar o preparo dos pedidos.

DELIVERY:
Entregador.

Cada usuário autenticado terá um perfil próprio associado ao UUID do Supabase Auth.

Criar uma tabela profiles com:
- id UUID, chave primária e referência a auth.users.
- full_name.
- phone.
- role.
- is_active.
- created_at.
- updated_at.

O perfil deve ser criado por fluxo seguro, sem permitir que o usuário escolha livremente um perfil privilegiado.

Regras:
- O cadastro público pode criar apenas clientes.
- Nenhum usuário pode transformar sua própria conta em ADMIN.
- O administrador inicial deve ser provisionado por uma operação controlada de servidor ou procedimento administrativo seguro.
- Não permitir alterações de role pelo cliente.
- Usuários desativados não podem continuar operando as áreas protegidas.
- Validar a função do usuário no servidor e por RLS, não somente no frontend.
- Criar uma função segura para verificar o perfil do usuário atual, evitando políticas RLS recursivas.
- Não utilizar metadados editáveis pelo próprio usuário como única fonte de autorização.
- Não confiar em parâmetros de perfil enviados pelo navegador.
- Restringir a criação e a promoção de usuários privilegiados a procedimentos administrativos autorizados.

Criar uma matriz de permissões:

CLIENTE:
- Consultar o catálogo publicado.
- Gerenciar os próprios endereços.
- Criar pedidos.
- Consultar os próprios pedidos.
- Consultar seus pagamentos.
- Cancelar pedidos somente quando permitido pelas regras.
- Consultar notificações próprias.
- Não consultar pedidos de terceiros.
- Não acessar telas administrativas.

ADMINISTRADOR:
- Gerenciar pedidos de todos os clientes.
- Confirmar e cancelar pedidos.
- Gerenciar catálogo, categorias, adicionais, disponibilidade e preços.
- Gerenciar taxas e áreas de entrega.
- Gerenciar entregadores e funcionários.
- Atribuir e reatribuir entregas.
- Consultar pagamentos e solicitar reembolsos autorizados.
- Gerenciar configurações.
- Consultar relatórios e históricos.
- Administrar usuários conforme as permissões concedidas.

COZINHA:
- Visualizar os pedidos necessários à preparação.
- Consultar itens, quantidades, adicionais e observações.
- Alterar os status de preparação autorizados.
- Marcar pedidos como prontos.
- Informar problemas ao administrador.
- Não alterar preços, pagamentos, usuários, taxas ou atribuições de entrega.

ENTREGADOR:
- Consultar apenas as entregas atribuídas a ele.
- Consultar os dados necessários para realizar essas entregas.
- Confirmar retirada e saída para entrega.
- Confirmar conclusão.
- Registrar recebimento de pagamento na entrega, quando autorizado.
- Consultar o próprio histórico.
- Não acessar o faturamento geral, o cadastro de produtos, os dados completos de outros clientes ou entregas de outros entregadores.

VISITANTE:
- Consultar o catálogo público.
- Criar pedidos sem cadastro obrigatório.
- Acompanhar somente o próprio pedido por token seguro.
- Não receber acesso direto ao banco de dados ou a pedidos por identificadores previsíveis.

Implementar as regras correspondentes na camada de dados e nas operações de servidor.

## 6. MODELAGEM COMPLETA DO BANCO DE DADOS

Criar migrações SQL reproduzíveis, com chaves primárias, estrangeiras, índices, restrições, valores padrão e políticas RLS.

Utilizar UUID como identificador interno e timestamps com fuso horário.

### 6.1 profiles
Campos:
- id UUID, PK e FK para auth.users.
- full_name.
- phone.
- role.
- is_active.
- created_at.
- updated_at.

### 6.2 customer_addresses
Campos:
- id UUID.
- customer_id UUID.
- label.
- recipient_name.
- recipient_phone.
- postal_code.
- street.
- number.
- complement.
- neighborhood.
- city.
- state.
- reference.
- latitude e longitude opcionais.
- created_at.
- updated_at.

Somente o proprietário pode administrar seus endereços.

### 6.3 categories
Campos:
- id.
- name.
- slug.
- description.
- image_path.
- sort_order.
- is_active.
- created_at.
- updated_at.

### 6.4 products
Campos:
- id.
- category_id.
- name.
- slug.
- description.
- image_path.
- price em centavos, usando BIGINT.
- is_available.
- preparation_time_minutes.
- sort_order.
- created_at.
- updated_at.

Nunca utilizar números de ponto flutuante para cálculos monetários.

### 6.5 option_groups
Campos:
- id.
- name.
- selection_type.
- min_selections.
- max_selections.
- is_required.
- is_active.

### 6.6 product_option_groups
Campos:
- product_id.
- option_group_id.
- sort_order.

Criar chaves estrangeiras e restrição de unicidade para impedir vínculos duplicados.

### 6.7 product_options
Campos:
- id.
- option_group_id.
- name.
- price_delta em centavos.
- is_available.
- sort_order.

Permitir adicionais gratuitos ou pagos, com quantidades e limites quando aplicáveis.

### 6.8 orders
Campos:
- id UUID.
- order_number único, legível e não previsível como credencial de acesso.
- customer_id UUID opcional.
- customer_name.
- customer_phone.
- fulfillment_type: DELIVERY ou PICKUP.
- status.
- payment_status.
- payment_method.
- delivery_address_snapshot JSONB opcional.
- subtotal_cents.
- discount_cents.
- delivery_fee_cents.
- total_cents.
- customer_notes.
- cancellation_reason.
- created_at.
- confirmed_at.
- completed_at.
- cancelled_at.
- updated_at.

Para pedidos de visitantes, guardar os dados mínimos necessários e uma referência segura para acompanhamento.

Não utilizar o endereço atual do cliente como única fonte para um pedido antigo. O pedido precisa preservar o endereço utilizado no momento da compra.

### 6.9 order_items
Campos:
- id UUID.
- order_id.
- product_id opcional para preservar pedidos históricos mesmo que o produto seja excluído logicamente.
- product_name_snapshot.
- unit_price_cents.
- quantity.
- notes.
- line_total_cents.
- created_at.

### 6.10 order_item_options
Campos:
- id.
- order_item_id.
- option_id opcional.
- option_name_snapshot.
- unit_price_delta_cents.
- quantity.
- line_total_cents.

Guardar cópias dos nomes e preços dos adicionais no momento da compra.

### 6.11 payments
Campos:
- id.
- order_id.
- provider.
- provider_payment_id.
- method.
- status.
- amount_cents.
- external_reference.
- checkout_url opcional.
- pix_qr_code ou dados necessários à exibição, quando fornecidos pelo provedor.
- created_at.
- confirmed_at.
- updated_at.

Não guardar dados completos de cartões.

Criar restrições para impedir a duplicação de identificadores externos de pagamento quando presentes.

### 6.12 deliveries
Campos:
- id.
- order_id.
- courier_id.
- status.
- assigned_by.
- assigned_at.
- accepted_at, se aplicável.
- picked_up_at.
- out_for_delivery_at.
- delivered_at.
- failure_reason.
- notes.
- created_at.
- updated_at.

Implementar regra que impeça duas atribuições ativas simultâneas para a mesma entrega.

### 6.13 delivery_zones
Campos:
- id.
- name.
- neighborhoods ou áreas estruturadas.
- postal_code_prefixes, se necessário.
- fee_cents.
- minimum_order_cents.
- estimated_minutes.
- is_active.

O servidor deve calcular a taxa a partir da configuração vigente, nunca confiar no valor informado pelo cliente.

### 6.14 store_settings
Campos:
- id.
- store_name.
- logo_path.
- phone.
- address.
- is_open.
- accepting_orders.
- opening_hours JSONB validado.
- minimum_order_cents.
- default_preparation_minutes.
- delivery_enabled.
- pickup_enabled.
- timezone.

Utilizar o fuso horário America/Sao_Paulo para a operação local, mantendo timestamps no banco com fuso horário.

### 6.15 order_status_history
Campos:
- id.
- order_id.
- previous_status.
- new_status.
- changed_by.
- actor_type.
- reason.
- created_at.

Os registros devem ser imutáveis para os usuários comuns.

### 6.16 payment_events
Campos:
- id.
- provider.
- provider_event_id.
- payment_id opcional.
- event_type.
- processing_status.
- payload mínimo necessário, com dados sensíveis removidos.
- received_at.
- processed_at.

Criar restrição de unicidade para o identificador do evento do provedor.

### 6.17 notifications
Campos:
- id.
- recipient_id opcional.
- order_id opcional.
- type.
- title.
- message.
- read_at.
- created_at.

### 6.18 guest_order_access
Criar estrutura segura para acesso de visitantes, armazenando somente hash do token ou credencial equivalente, nunca o token em texto puro no banco.

O acesso deve expirar conforme a política definida e ser limitado às informações necessárias para acompanhar o pedido.

### 6.19 audit_logs
Campos:
- id.
- actor_id.
- action.
- entity_type.
- entity_id.
- metadata mínima.
- created_at.

Utilizar auditoria para ações privilegiadas e eventos relevantes.

Criar índices adequados para pedidos por status, data, cliente, entregador e identificadores externos de pagamento.

## 7. FLUXO DOS PEDIDOS

Utilizar estados explícitos:

AGUARDANDO_CONFIRMACAO
CONFIRMADO
EM_PREPARACAO
PRONTO
AGUARDANDO_RETIRADA
EM_ENTREGA
CONCLUIDO
CANCELADO

Fluxo de entrega:
AGUARDANDO_CONFIRMACAO → CONFIRMADO → EM_PREPARACAO → PRONTO → EM_ENTREGA → CONCLUIDO.

Fluxo de retirada:
AGUARDANDO_CONFIRMACAO → CONFIRMADO → EM_PREPARACAO → PRONTO → AGUARDANDO_RETIRADA → CONCLUIDO.

Permitir CANCELADO somente conforme as regras de autorização e cancelamento.

Validar todas as transições no servidor.

Cada transição deve:
- Conferir o estado atual.
- Validar a permissão do responsável.
- Registrar o histórico.
- Atualizar o pedido de forma consistente.
- Gerar notificações quando aplicável.
- Impedir atualizações simultâneas incompatíveis.

O status do pedido deve ser independente do status do pagamento e da entrega.

Não permitir que o entregador altere diretamente o status geral do pedido para qualquer valor arbitrário. Implementar operações específicas que atualizem os estados relacionados de forma consistente.

## 8. FLUXO DE CRIAÇÃO DO PEDIDO

Criar uma operação segura de criação de pedido.

O frontend enviará somente:
- Itens e quantidades.
- Identificadores de adicionais selecionados.
- Observações.
- Tipo de atendimento.
- Endereço selecionado ou dados necessários para o checkout.
- Método de pagamento.
- Identificador de idempotência.

O servidor deverá:
1. Validar a identidade ou a sessão de visitante.
2. Consultar produtos e adicionais no banco.
3. Verificar disponibilidade.
4. Validar limites de quantidade e seleção dos adicionais.
5. Validar o horário de funcionamento.
6. Validar o endereço e a área de entrega.
7. Calcular os preços, descontos, taxas e total.
8. Registrar o pedido e os itens com valores históricos.
9. Registrar o estado inicial.
10. Criar o registro de pagamento ou cobrança correspondente, quando necessário.
11. Registrar o histórico e os eventos iniciais.
12. Retornar somente os dados autorizados para o cliente.

Criar as operações com transações ou funções SQL adequadas para evitar pedidos incompletos.

Não confiar em totais, preços, descontos, taxas ou status enviados pelo navegador.

Utilizar idempotência para impedir pedidos duplicados por cliques repetidos, reenvio de requisições ou falhas de rede.

## 9. PAGAMENTOS

Implementar uma camada de integração desacoplada do frontend.

Criar uma interface de serviço de pagamento que permita adicionar ou trocar o provedor sem reescrever o checkout.

Métodos:
- PIX_ONLINE.
- CARD_ONLINE.
- CARD_ON_DELIVERY.
- CASH_ON_DELIVERY.

Estados:
PENDENTE
EM_PROCESSAMENTO
PAGO
RECUSADO
CANCELADO
REEMBOLSO_PENDENTE
REEMBOLSADO
PAGAMENTO_NA_ENTREGA
PAGO_NA_ENTREGA

Para Pix online:
- Criar cobrança no provedor.
- Exibir QR Code e código de pagamento quando disponíveis.
- Atualizar o estado por notificação autenticada do provedor.
- Permitir consulta de situação.
- Tratar expiração e falhas.

Para cartão online:
- Utilizar checkout seguro ou tokenização do provedor.
- Tratar aprovação, recusa, processamento e estorno.
- Não armazenar dados completos de cartão.

Para pagamento na entrega:
- Registrar o método e o valor esperado.
- Permitir confirmação somente por usuário autorizado.
- Registrar o responsável, o valor recebido e o horário.

Implementar webhook seguro, verificando assinatura conforme a documentação do provedor.

O processamento dos eventos deve ser idempotente e resistente a notificações repetidas.

Não marcar pagamentos online como pagos com base em parâmetros enviados pelo navegador.

Se as credenciais do provedor ainda não estiverem disponíveis, criar uma integração isolada em modo de configuração pendente. Não simular pagamentos reais nem exibir um status falso de pagamento confirmado.

## 10. CANCELAMENTOS E REEMBOLSOS

Criar regras para cancelamento pelo cliente e pelo administrador.

- O cliente pode solicitar cancelamento somente nos estados permitidos.
- O administrador pode autorizar exceções conforme as regras operacionais.
- Todo cancelamento deve registrar responsável e motivo.
- O pedido não deve ser apagado.
- Quando houver pagamento confirmado, avaliar a necessidade de reembolso.
- A solicitação de reembolso deve ser independente da confirmação do estorno.
- Atualizar o pagamento para REEMBOLSADO somente após confirmação confiável do provedor.
- Impedir reembolsos duplicados.
- Registrar as operações na auditoria.

## 11. MÓDULO ADMINISTRATIVO

Criar dashboard com:
- Quantidade de pedidos do dia.
- Pedidos aguardando confirmação.
- Pedidos em preparação.
- Pedidos aguardando entrega.
- Pedidos concluídos.
- Faturamento com definição clara do critério utilizado.
- Ticket médio.
- Produtos mais vendidos.
- Formas de pagamento.
- Filtros por período e status.

Criar telas de:
- Pedidos.
- Detalhes do pedido.
- Produtos.
- Categorias.
- Adicionais.
- Entregadores.
- Funcionários e permissões.
- Clientes.
- Taxas de entrega.
- Pagamentos.
- Reembolsos.
- Relatórios.
- Configurações.
- Histórico de auditoria.

O administrador deve conseguir atribuir manualmente um entregador a um pedido pronto.

Ao atribuir:
- Verificar se o entregador está ativo.
- Verificar se o pedido é de entrega.
- Verificar se não há outra atribuição ativa incompatível.
- Registrar responsável e horário.
- Notificar o entregador.
- Disponibilizar a entrega no painel dele.

## 12. MÓDULO DA COZINHA

Criar painel operacional com colunas:
- Confirmados.
- Em preparação.
- Prontos.
- Aguardando retirada ou coleta.

Cada cartão deverá exibir:
- Número do pedido.
- Horário de entrada.
- Tempo estimado.
- Itens e quantidades.
- Adicionais.
- Observações.
- Tipo de atendimento.

Permitir alterações de status somente conforme as permissões do perfil.

Atualizar o painel automaticamente com Supabase Realtime, mantendo consultas de recuperação para falhas de conexão.

Não perder pedidos quando o painel for atualizado ou o navegador for fechado.

## 13. MÓDULO DO ENTREGADOR

Criar interface mobile-first com:
- Entregas atribuídas.
- Detalhes do pedido.
- Nome e contato necessário do destinatário.
- Endereço e referência.
- Botão de navegação.
- Confirmação de retirada.
- Confirmação de saída.
- Confirmação de entrega.
- Registro de pagamento recebido na entrega.
- Histórico próprio.

Cada operação deve validar a identidade, a atribuição atual e o status da entrega no servidor.

Se a atribuição for alterada, o antigo entregador deve perder o acesso à entrega.

Não implementar rastreamento GPS contínuo sem necessidade, consentimento e configuração específica.

## 14. MÓDULO DO CLIENTE E ACOMPANHAMENTO

Criar acompanhamento com linha do tempo:
- Pedido recebido.
- Pedido confirmado.
- Em preparação.
- Pronto.
- Saiu para entrega ou aguardando retirada.
- Concluído.

Exibir cancelamento e informações sobre pagamento quando necessário.

Para usuários autenticados, limitar consultas aos próprios pedidos.

Para visitantes, criar acesso temporário seguro, com token de alta entropia, armazenamento seguro do hash e expiração. Não utilizar apenas o número do pedido ou o telefone como autenticação.

Evitar expor endereço completo, telefone ou outras informações sensíveis em URLs, logs ou canais públicos de atualização.

## 15. SUPABASE ROW LEVEL SECURITY

Ativar RLS em todas as tabelas expostas ao cliente.

Criar políticas específicas:
- Cliente consulta e gerencia seus próprios dados.
- Cliente consulta somente seus pedidos e respectivos registros autorizados.
- Cozinha consulta os dados necessários ao preparo e altera somente os estados permitidos.
- Entregador consulta somente entregas atribuídas a ele e os dados necessários ao serviço.
- Administrador consulta e gerencia os registros conforme sua função validada no servidor.
- Visitantes não recebem acesso irrestrito às tabelas de pedidos.

Não utilizar uma política genérica que permita todas as operações a qualquer usuário autenticado.

Não conceder acesso a todas as tabelas somente porque o usuário está logado.

Criar testes negativos para confirmar que um cliente não consegue consultar pedidos de outro cliente e que um entregador não consegue acessar entregas de terceiros.

Operações privilegiadas devem ser realizadas por Edge Functions ou funções SQL cuidadosamente protegidas.

## 16. STORAGE

Criar buckets e políticas para:
- Imagens públicas do catálogo.
- Logotipo e identidade visual.
- Arquivos privados administrativos, se necessários.

Validar tipo e tamanho dos arquivos enviados.

Impedir que usuários não autorizados alterem imagens de produtos.

Não armazenar comprovantes ou documentos privados em buckets públicos.

## 17. NOTIFICAÇÕES E TEMPO REAL

Utilizar Supabase Realtime para atualizar os pedidos e painéis.

Criar notificações internas para:
- Novo pedido.
- Pedido confirmado.
- Pedido pronto.
- Entregador atribuído.
- Saída para entrega.
- Pedido concluído.
- Cancelamento.
- Falha relevante de pagamento.

Utilizar notificações externas, como WhatsApp ou e-mail, somente após configurar um provedor apropriado.

Implementar tratamento de falhas, repetição controlada e deduplicação.

O banco de dados deve permanecer como fonte oficial dos status.

## 18. EXPERIÊNCIA VISUAL

Seguir fielmente as imagens de referência anexadas.

Construir componentes reutilizáveis, layout responsivo, navegação intuitiva, estados de carregamento, mensagens de erro, confirmações e telas vazias.

Todos os botões devem executar ações reais.

Implementar:
- Formatação de moeda brasileira.
- Datas e horários locais.
- Validação de formulários.
- Mensagens de sucesso e erro.
- Confirmação para operações destrutivas.
- Acessibilidade básica.
- Estados de carregamento.
- Tratamento de falhas de conexão.
- Layout otimizado para celular.

Não utilizar links sem destino, botões decorativos ou dados fictícios na operação real.

## 19. TESTES AUTOMATIZADOS

Criar testes para:
- Cadastro e autenticação.
- Permissões de cada perfil.
- Criação de pedido como visitante.
- Criação de pedido como cliente autenticado.
- Cálculos monetários.
- Adicionais obrigatórios e opcionais.
- Taxas de entrega.
- Horários de funcionamento.
- Pedidos duplicados.
- Transições inválidas de status.
- Atribuição e reatribuição de entregadores.
- Cancelamentos.
- Pagamentos pendentes, aprovados e recusados.
- Webhooks repetidos.
- Reembolsos.
- Acesso a pedidos de outros clientes.
- Acesso a entregas de outros entregadores.
- Funcionamento em telas mobile e desktop.

Criar testes unitários, de integração e testes de políticas RLS. Utilizar ambiente de testes separado da produção.

## 20. DOCUMENTAÇÃO E ENTREGA

Gerar:
1. Código completo do frontend.
2. Migrações SQL do banco.
3. Políticas RLS.
4. Funções SQL e Edge Functions.
5. Tipos TypeScript das entidades.
6. Serviços de integração.
7. Testes automatizados.
8. Arquivo .env.example.
9. README de instalação.
10. Manual de configuração do Supabase.
11. Manual de configuração de pagamentos.
12. Instruções para GitHub e Vercel.
13. Checklist de segurança e publicação.

Não afirmar que o sistema está implantado, que pagamentos estão funcionando ou que os testes passaram sem efetivamente verificar essas condições.

## 21. ESTRATÉGIA DE IMPLEMENTAÇÃO

Trabalhe em fases, mantendo o projeto executável após cada etapa.

FASE 1: arquitetura, estrutura do projeto, autenticação e banco de dados.

FASE 2: catálogo, carrinho, checkout e criação de pedidos.

FASE 3: painel administrativo e cozinha.

FASE 4: módulo de entregadores e atribuição manual.

FASE 5: pagamentos e notificações.

FASE 6: relatórios, auditoria, segurança, testes e publicação.

Comece analisando as imagens anexadas e apresentando a arquitetura, a estrutura de pastas, as entidades e o plano de execução.

Depois implemente os arquivos reais, começando pela fundação do projeto. Não se limite a fornecer exemplos de código ou uma explicação teórica.

Se houver limite de contexto ou de geração, conclua uma etapa funcional por vez, informe os arquivos criados e continue de forma incremental, preservando as decisões arquiteturais.

Ao finalizar cada fase, apresente:
- O que foi implementado.
- Arquivos criados ou modificados.
- Migrações executadas ou pendentes.
- Variáveis de ambiente necessárias.
- Testes executados e resultados reais.
- Configurações externas ainda necessárias.
- Próximos passos.

O resultado final deverá ser uma aplicação consistente, segura, responsiva, funcional e preparada para evolução, seguindo fielmente as imagens de referência fornecidas.
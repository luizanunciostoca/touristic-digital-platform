# Domain Map — Touristic Digital Platform

## 1. Objetivo

Definir os limites, responsabilidades, dependências permitidas, eventos e contratos públicos dos domínios da plataforma.

## 2. Mapa de alto nível

```text
Platform Core
├── Identity
├── Destination
├── Tenancy
├── Geospatial
├── Search
├── Catalog
├── Marketplace
├── Booking
├── Ordering
├── Financial
├── Affiliate
├── Business
├── Admin
├── Content
├── Assistant
├── Notifications
├── Analytics
└── Observability
```

## 3. Domínios

### Core
Responsável por primitivas compartilhadas, contratos base, contexto da requisição, configuração, eventos e políticas transversais. Não contém regras específicas de marketplace, pagamento, afiliados ou destinos.

### Identity
Responsável por usuários, credenciais, sessões, autenticação, recuperação, MFA futuro e identidade federada. Publica identidade autenticada; não decide permissões de negócio isoladamente.

### Destination
Responsável pelo ciclo de vida do destino, identidade, configuração, domínios, branding, locale, moeda, timezone, limites geográficos, módulos e feature flags.

### Tenancy
Responsável por tenants, membership, escopo empresarial, segregação e autorização contextual. Toda operação privada empresarial deve validar `tenantId` e `destinationId`.

### Geospatial
Responsável por coordenadas, boundaries, locais físicos, áreas de serviço, geocoding, routing, matrix, navegação, proximidade, geofencing e adapters de providers.

### Search
Responsável por indexação, consulta, ranking, filtros, autocomplete e descoberta cross-catalog. Consome projeções públicas; não é fonte de verdade dos dados.

### Catalog
Responsável por empresas, locais, categorias, produtos, serviços, eventos, passeios, hospedagem, mídia e disponibilidade editorial.

### Marketplace
Responsável pela experiência B2C de descoberta, favoritos, comparação, carrinho, intenção de compra e apresentação de ofertas.

### Booking
Responsável por disponibilidade, reservas, políticas, confirmação, cancelamento, no-show e reconciliação operacional.

### Ordering
Responsável por pedidos, itens, estados, preços consolidados, descontos e relação entre pedido, reserva e pagamento.

### Financial
Responsável por dinheiro, ledger, cobrança, split, estorno, repasse, reconciliação, carteira e liquidação. É a única fonte de verdade financeira.

### Affiliate
Responsável por afiliados da plataforma, evidência de referral/atribuição, associação de conversão a registros canônicos e direito comercial de comissão conforme política aprovada. Não pertence a sellers ou tenants. Não é fonte de verdade de Payment, ledger, payable, wallet, settlement ou payout; toda materialização monetária permanece em Financial.

### Business
Responsável pelas capacidades do Business Portal e operações permitidas ao tenant sobre seus próprios dados.

### Admin
Responsável pelas operações administrativas globais e por destino, suporte, auditoria operacional, moderação e governança.

### Content
Responsável por CMS, páginas, menus, guias, conteúdo editorial, traduções e publicação por destino.

### Assistant
Responsável por conversação, contexto, ferramentas, recomendações, ações e voz. Não escreve diretamente em domínios; usa APIs e comandos autorizados.

### Notifications
Responsável por templates, preferências, e-mail, push, SMS e mensageria. Recebe eventos e entrega notificações idempotentes.

### Analytics
Responsável por eventos analíticos, métricas de produto, conversão e relatórios. Não substitui o ledger financeiro ou auditoria.

### Observability
Responsável por logs, métricas, traces, alertas, correlação e saúde operacional.

## 4. Dependências permitidas

- Todos os domínios podem consumir contratos base do Core.
- Todos os domínios contextuais podem consumir Destination e Tenancy por contratos públicos.
- Marketplace pode consumir Search, Catalog, Booking e Ordering.
- Booking pode consumir Catalog e contratos financeiros, mas não SDKs de pagamento.
- Ordering pode consumir Catalog, Booking e Financial por ports.
- Financial não depende de Marketplace, Business ou Admin.
- Affiliate pode consumir contratos públicos de Identity/Destination e eventos ou records versionados de Ordering/Financial. Um futuro handoff de comissão deve usar um contrato Financial explícito; Affiliate nunca escreve persistência Financial diretamente.
- Business consome APIs públicas de Catalog, Booking, Ordering e Analytics.
- Admin consome APIs administrativas versionadas; não acessa bancos de outros domínios diretamente.
- Assistant consome APIs públicas e ferramentas autorizadas; não importa implementações internas.

## 5. Dependências proibidas

- Pacotes de domínio não dependem de aplicações.
- Frontends não acessam persistência, filas ou provedores externos diretamente.
- Financial não depende de UI.
- Affiliate não depende de sellers ou regras privadas de um tenant.
- Affiliate não cria Payment, ledger entry, Financial allocation/payable, settlement ou payout e não aceita o browser como autoridade de comissão.
- Search não é fonte de verdade.
- Analytics não altera estados de negócio.
- Admin CRM não compartilha banco diretamente com o Platform Core.

## 6. Eventos principais

- `DestinationCreated`
- `DestinationActivated`
- `TenantCreated`
- `UserAuthenticated`
- `BusinessPublished`
- `CatalogItemPublished`
- `BookingCreated`
- `BookingConfirmed`
- `OrderPlaced`
- `PaymentApproved`
- `PaymentRefunded`
- `LedgerEntryPosted`
- `CustomerAttributedToAffiliate`
- `AffiliateCommissionEntitlementRecorded`
- `PayoutCompleted`
- `NotificationRequested`

`AffiliateCommissionEntitlementRecorded` representa somente o direito comercial decidido pelo domínio Affiliate. `PayoutCompleted` e qualquer evento que represente movimento, liquidação ou saldo monetário são Financial-owned e podem ser consumidos por projeções Affiliate sem transferir autoridade.

## 7. Ownership de dados

Cada domínio possui suas tabelas e invariantes. Leituras cross-domain usam APIs, eventos ou projeções. Escritas cross-domain diretas são proibidas.

## 8. Contexto obrigatório

Operações devem propagar:

```text
destinationId
tenantId quando aplicável
userId quando autenticado
locale
timezone
currency
correlationId
```

## 9. Regra de evolução

Quando uma nova capacidade não possuir owner claro, ela não deve ser implementada até que o Domain Map e os Module Contracts sejam atualizados.
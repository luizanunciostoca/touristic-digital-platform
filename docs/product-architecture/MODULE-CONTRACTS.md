# Module Contracts — Touristic Digital Platform

## 1. Objetivo

Definir dependências permitidas, contratos públicos, dados, eventos e proibições de cada módulo para evitar acoplamento indevido.

## 2. Regras globais

- aplicações podem depender de pacotes e módulos públicos;
- módulos não dependem de aplicações;
- imports cross-module usam apenas exports públicos;
- persistência interna não é compartilhada;
- integrações externas são acessadas por ports e adapters;
- eventos e APIs são versionados;
- regras financeiras e de autorização são server-side;
- contexto de destino e tenant deve ser propagado;
- contratos transversais canônicos são registrados em `docs/contracts/registry.json` e validados no Quality Gate.

## 3. Contratos por módulo

### Core

Pode consumir: nenhuma regra de domínio.
Expõe: IDs tipados, Result, Money, contexto, envelopes de evento, observabilidade transversal, health/readiness, erros padronizados e configuração base.
Não pode: importar Marketplace, Financial, Affiliate, Admin ou apps.

O envelope público de evento é `PLATFORM-EVENT-ENVELOPE` (`docs/contracts/platform-event-envelope.v1.schema.json`). O envelope mínimo de observabilidade é `PLATFORM-OBSERVATION` (`docs/contracts/platform-observation.v1.schema.json`). O snapshot transversal de health/readiness é `PLATFORM-HEALTH-SNAPSHOT` (`docs/contracts/platform-health-snapshot.v1.schema.json`). Os três pertencem a Core e não podem ser redefinidos por módulos consumidores.

### Destination

Pode consumir: Core.
Expõe: resolução de destino, configuração validada, locale, timezone, currency, modules e feature flags.
Não pode: conter regras específicas codificadas de Morro, Itacaré ou outro destino.

### Identity

Pode consumir: Core, Destination.
Expõe: autenticação, sessão e identidade.
Não pode: decidir sozinho permissões de tenant ou regras financeiras.

### Tenancy

Pode consumir: Core, Destination, Identity.
Expõe: tenant context, membership, roles e scopes.
Não pode: acessar dados privados de outro tenant sem permissão administrativa explícita.

### Geospatial

Pode consumir: Core, Destination.
Expõe: MapProvider, GeocodingProvider, RoutingProvider, MatrixProvider, geofencing e localização.
Não pode: expor SDKs de providers aos apps ou assumir que rotas comerciais cobrem caminhos locais e marítimos.

### Search

Pode consumir: Core e projeções de Catalog, Content e Geospatial.
Expõe: query, autocomplete, filtros e ranking.
Não pode: ser fonte de verdade ou escrever em Catalog.

### Catalog

Pode consumir: Core, Destination, Tenancy, Geospatial.
Expõe: empresas, locais, produtos, serviços, eventos, mídia e publicação.
Não pode: processar pagamento ou comissão.

### Marketplace

Pode consumir: Core, Destination, Search, Catalog, Geospatial, Booking e Ordering.
Expõe: jornadas B2C, favoritos, carrinho e intenção de compra.
Não pode: acessar bancos, ledgers ou providers diretamente.

### Booking

Pode consumir: Core, Destination, Tenancy, Catalog e ports de Financial.
Expõe: disponibilidade, reserva, confirmação, cancelamento e políticas.
Não pode: armazenar saldo ou liquidar pagamento.

### Ordering

Pode consumir: Core, Catalog, Booking e Financial por contratos.
Expõe: pedidos, itens, estados e totais consolidados.
Não pode: recalcular ledger ou administrar afiliados.

### Financial

Pode consumir: Core, Destination, Tenancy e ports de providers.
Expõe: Payment, Ledger, Split, Refund, Transfer, Reconciliation, Allocation, Payable, Settlement e Wallet/financial position.
Não pode: depender de UI, Marketplace, Admin CRM ou SDK específico em regras de domínio.
É a única autoridade para materializar valores monetários, saldo, payable, settlement, payout/transfer e respectivas reversões. Um futuro entitlement de Affiliate somente pode produzir efeito financeiro por um port Financial versionado e validado pelas invariantes Financial.

### Affiliate

Pode consumir: Core, Identity, Destination e eventos ou records públicos versionados de Ordering/Financial.
Expõe: identidade de afiliado, evidência de referral/atribuição, associação de atribuição/conversão e direito comercial de comissão conforme política aprovada.
Não pode: pertencer a seller, tenant ou Business Portal; criar Payment; escrever ledger; criar ou alterar Financial Allocation/Payable/Wallet/Settlement; executar payout/transfer; acessar persistência Financial diretamente; tratar redirect, query string, local storage ou outro estado de browser como autoridade de conversão ou comissão.

Um futuro handoff Affiliate → Financial deve ser um contrato público versionado. Affiliate pode apresentar o direito comercial e sua evidência; Financial aceita ou rejeita a materialização monetária segundo sua própria autoridade e invariantes.

### Business

Pode consumir: Identity, Tenancy, Catalog, Booking, Ordering e Analytics por APIs públicas.
Expõe: casos de uso do Business Portal.
Não pode: administrar afiliados ou acessar outros tenants.

### Admin

Pode consumir: APIs administrativas versionadas de todos os domínios autorizados.
Expõe: operações globais e por destino, suporte e auditoria.
Não pode: compartilhar banco diretamente com o Platform Core ou ignorar RBAC.

### Content

Pode consumir: Core, Destination e Tenancy.
Expõe: páginas, menus, conteúdo editorial, tradução, preview e publicação.
Não pode: executar regras financeiras ou alterar catálogo sem comando autorizado.

### Assistant

Pode consumir: Core, Destination, Search, Catalog, Geospatial e ferramentas autorizadas.
Expõe: conversa, contexto, ações e voz.
Não pode: escrever diretamente em banco ou executar ação sem autorização e validação.

### Notifications

Pode consumir: eventos públicos.
Expõe: templates, preferências e entrega multicanal.
Não pode: ser fonte de verdade de estados de negócio.

### Analytics

Pode consumir: eventos sanitizados.
Expõe: métricas, funis e relatórios.
Não pode: alterar pedidos, pagamentos, reservas ou autorização.

## 4. Contrato de API

Toda API pública deve declarar:

- versão;
- autenticação e escopo;
- contexto de destino e tenant;
- schema de entrada e saída;
- idempotência quando aplicável;
- paginação e filtros;
- erros em formato padronizado;
- observabilidade e rate limit.

## 5. Contrato de evento, observabilidade e health/readiness

Todo evento deve usar `PLATFORM-EVENT-ENVELOPE` e declarar owner, versão, payload, produtor, consumidores, política de retry, idempotência, retenção e tratamento de dados pessoais.

Logs estruturados, métricas, traces, auditoria e alertas que atravessem fronteiras de módulo devem usar `PLATFORM-OBSERVATION` como envelope mínimo de contexto. Os contratos executáveis são `docs/contracts/platform-event-envelope.v1.schema.json` e `docs/contracts/platform-observation.v1.schema.json`.

Health/readiness transversal deve usar `PLATFORM-HEALTH-SNAPSHOT` (`docs/contracts/platform-health-snapshot.v1.schema.json`). Checks críticos que falham tornam o snapshot `unhealthy/not_ready`; checks não críticos podem degradar a saúde sem bloquear readiness. Serviços e apps podem transportar o snapshot em probes próprias, mas não redefinir essa agregação.

## 6. Gate

Uma dependência não prevista neste documento exige atualização do contrato e, quando estrutural, um ADR antes da implementação. Alterações nos contratos canônicos exigem registry, schema, runtime, fixtures quando aplicável, evidência e `pnpm platform:contracts:check` reconciliados no mesmo PR.

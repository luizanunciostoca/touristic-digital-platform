# Capability Matrix — Touristic Digital Platform

## 1. Objetivo

Relacionar capacidades de produto aos domínios responsáveis, Feature IDs, APIs, eventos, permissões, dados, testes e critérios de aceite.

## 2. Matriz inicial

| Capability ID | Capacidade | Feature | Domínio owner | Consumidores | Eventos principais | Permissões mínimas | Dados principais | Testes obrigatórios |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CAP-0001 | Resolver destino atual | FEATURE-0001 | Destination | Todas as aplicações | DestinationActivated | Público ou autenticado | Destination, Domain, Session | unit, integration, E2E |
| CAP-0002 | Exibir mapa interativo | FEATURE-0001 | Geospatial | Marketplace, Assistant | MapReady | Público | GeoPoint, Layer, Marker | visual, E2E, performance |
| CAP-0003 | Obter localização do usuário | FEATURE-0001 | Geospatial | Marketplace, Navigation | UserLocationResolved | Consentimento | GeoPoint, PermissionState | browser, denial, timeout |
| CAP-0004 | Pesquisar empresas e lugares | FEATURE-0002 | Search | Marketplace, Assistant | SearchPerformed | Público | SearchIndex, Filters | relevance, empty, error |
| CAP-0005 | Abrir detalhes de empresa | FEATURE-0002 | Catalog | Marketplace | BusinessViewed | Público | Business, Location, Media | contract, visual, E2E |
| CAP-0006 | Calcular rota | FEATURE-0003 | Geospatial | Navigation, Marketplace | RouteCalculated | Público | Origin, Destination, Route | provider, fallback, timeout |
| CAP-0007 | Iniciar navegação guiada | FEATURE-0003 | Geospatial | Marketplace | NavigationStarted | Geolocalização autorizada | Route, Instructions | E2E, TTS, recovery |
| CAP-0008 | Conversar com assistente | FEATURE-0004 | Assistant | Marketplace | AssistantMessageCompleted | Público com rate limit | Conversation, Context | safety, timeout, tool calls |
| CAP-0009 | Executar ação do assistente | FEATURE-0004 | Assistant | Marketplace | AssistantActionExecuted | Conforme ferramenta | Action, Authorization | authorization, idempotency |
| CAP-0010 | Autenticar empresa | FEATURE-0008 | Identity | Business Portal | UserAuthenticated | Credenciais válidas | User, Session | security, rate limit, E2E |
| CAP-0011 | Gerenciar perfil empresarial | FEATURE-0005 | Business/Catalog | Business Portal | BusinessUpdated | Tenant member | Business, Location, Media | RBAC, tenant isolation |
| CAP-0012 | Gerenciar produtos e serviços | FEATURE-0005 | Catalog | Business Portal | CatalogItemPublished | Tenant editor | Product, Service, Price | validation, authorization |
| CAP-0013 | Gerenciar disponibilidade | FEATURE-0005 | Booking | Business Portal | AvailabilityChanged | Tenant operator | Availability, Policy | concurrency, timezone |
| CAP-0014 | Criar reserva | FEATURE-0005 | Booking | Marketplace | BookingCreated | Cliente | Booking, Availability | concurrency, rollback |
| CAP-0015 | Criar pedido | FEATURE-0009 | Ordering | Marketplace | OrderPlaced | Cliente | Order, Item, Money | pricing, idempotency |
| CAP-0016 | Processar pagamento | FEATURE-0009 | Financial | Marketplace, Workers | PaymentApproved | Cliente autenticado ou guest autorizado | Payment, Ledger | sandbox, webhook, retry |
| CAP-0017 | Realizar split e repasse | FEATURE-0009 | Financial | Admin, Workers | LedgerEntryPosted | Backend only | Ledger, Transfer | ledger invariants, reconciliation |
| CAP-0018 | Registrar atribuição validada a afiliado | FEATURE-0010 | Affiliate | Marketplace, Workers | `AffiliateAttributionEstablished` reservado; schema pendente | Backend/plataforma | Affiliate, AttributionEvidence, Attribution | authority, expiry, deduplication, replay |
| CAP-0019 | Determinar e evidenciar direito comercial de comissão | FEATURE-0010 | Affiliate | Workers, Financial | `AffiliateCommissionEntitlementChanged` reservado; schema pendente | Backend only | CommissionEntitlement, PolicySnapshot, ConversionReference | deterministic, reversal, idempotency |
| CAP-0020 | Consultar posição financeira de afiliado | FEATURE-0010 | Financial | Affiliate Portal futuro | Financial read/projection contract a definir | Affiliate owner | FinancialPayable, FinancialSettlement, FinancialPositionProjection | ownership, pagination, authority isolation |
| CAP-0021 | Administrar destinos | FEATURE-0006 | Admin/Destination | Admin CRM | DestinationUpdated | SUPER_ADMIN | Destination, Config | RBAC, audit |
| CAP-0022 | Administrar empresas | FEATURE-0006 | Admin/Business | Admin CRM | TenantUpdated | Admin scoped | Tenant, Business | destination scope, audit |
| CAP-0023 | Administrar afiliados | FEATURE-0006 | Admin/Affiliate | Admin CRM | AffiliateUpdated | Admin scoped | Affiliate, AffiliateProgramState | audit, segregation |
| CAP-0024 | Publicar conteúdo editorial | FEATURE-0006 | Content | CMS/Admin | ContentPublished | CONTENT role | Page, Menu, Translation | preview, versioning |
| CAP-0025 | Emitir notificações | FEATURE-0005 | Notifications | Todos os domínios via evento | NotificationRequested | Backend only | Template, Preference | idempotency, provider fallback |
| CAP-0026 | Registrar analytics | FEATURE-0002 | Analytics | Apps e backend | AnalyticsEventRecorded | Público sanitizado | Event, Session | schema, privacy, delivery |
| CAP-0027 | Consultar auditoria | FEATURE-0006 | Admin/Observability | Admin CRM | AuditLogViewed | AUDITOR ou SUPER_ADMIN | AuditEntry | immutability, access control |
| CAP-0028 | Operar offline parcialmente | FEATURE-0002 | Marketplace/Infrastructure | Marketplace | OfflineModeEntered | Público | Cache, ServiceWorker | offline, reconnect, stale data |
| CAP-0029 | Trocar idioma | FEATURE-0002 | Destination/Content | Todas as aplicações | LocaleChanged | Público | Locale, Translation | RTL, fallback, persistence |
| CAP-0030 | Aplicar branding por destino | FEATURE-0007 | Destination/Design System | Todas as aplicações | ThemeResolved | Público | Tokens, Assets, Config | visual regression, fallback |

## 3. FEATURE-0010 — policy-neutral readiness boundary

CAP-0018, CAP-0019 and CAP-0020 preserve the domain direction while `FEATURE-0010` remains `planned` and `MIG-0011` remains `discovered`.

Policy-neutral technical work is now defined in:

- `AFFILIATES-CANONICAL-SCOPE.md`;
- `AFFILIATES-TECHNICAL-CONTRACT.md`;
- `AFFILIATES-THREAT-MODEL.md`;
- `AFFILIATES-DECISION-SHEET.md`;
- `../migration/AFFILIATES-MIGRATION-MATRIX.md`;
- `../qa/AFFILIATES-FEATURE-0010-TEST-PLAN.md`;
- `../operations/AFFILIATES-ROLLOUT-ROLLBACK.md`.

The fixed ownership is:

- Affiliate owns only platform affiliate identity/program semantics, validated referral/attribution evidence, attribution/conversion association and commercial entitlement evidence under an approved policy;
- Ordering owns canonical order identity/state;
- Financial exclusively owns Payment, ledger, allocation, payable, wallet/position, settlement, transfer/payout and monetary reversal;
- Business cannot administer Affiliate;
- browser/public data is untrusted evidence and never authoritative conversion/commission state.

Idempotency, audit, authorization boundaries, privacy engineering controls, canonical event families, Affiliate → Financial port shape, threat model, migration plan, tests and rollout/rollback no longer require a commercial decision and are fixed by the technical contract.

Runtime remains blocked only where product policy is still required. The exact gate contains 19 items in `AFFILIATES-DECISION-SHEET.md`; no value may be inferred.

## 4. Campos obrigatórios para novas capacidades

Cada nova capacidade deve declarar:

- ID permanente;
- descrição e valor de produto;
- Feature ID;
- domínio owner;
- consumidores autorizados;
- contratos de entrada e saída;
- eventos produzidos e consumidos;
- permissões e escopo;
- dados e retenção;
- métricas e observabilidade;
- testes e baselines;
- risco, rollback e status de migração.

## 5. Critério de prontidão

Uma capacidade somente pode ser considerada pronta quando contratos, autorização, persistência, eventos, testes, observabilidade, documentação e rollback estiverem aprovados.
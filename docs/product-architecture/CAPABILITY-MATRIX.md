# Capability Matrix — Touristic Digital Platform

## 1. Objetivo

Relacionar capacidades de produto aos domínios responsáveis, Feature IDs, APIs, eventos, permissões, dados, testes e critérios de aceite.

## 2. Matriz inicial

| Capability ID | Capacidade | Feature | Domínio owner | Consumidores | Eventos principais | Permissões mínimas | Dados principais | Testes obrigatórios |
|---|---|---|---|---|---|---|---|---|
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
| CAP-0018 | Atribuir cliente a afiliado | FEATURE-0010 | Affiliate | Marketplace | CustomerAttributedToAffiliate | Plataforma | Affiliate, Attribution | expiry, deduplication |
| CAP-0019 | Calcular comissão | FEATURE-0010 | Affiliate/Financial | Workers | AffiliateCommissionAccrued | Backend only | Commission, Ledger | deterministic, reversal |
| CAP-0020 | Consultar carteira de afiliado | FEATURE-0010 | Affiliate | Affiliate Portal futuro | WalletViewed | Affiliate owner | Wallet, Statement | ownership, pagination |
| CAP-0021 | Administrar destinos | FEATURE-0006 | Admin/Destination | Admin CRM | DestinationUpdated | SUPER_ADMIN | Destination, Config | RBAC, audit |
| CAP-0022 | Administrar empresas | FEATURE-0006 | Admin/Business | Admin CRM | TenantUpdated | Admin scoped | Tenant, Business | destination scope, audit |
| CAP-0023 | Administrar afiliados | FEATURE-0006 | Admin/Affiliate | Admin CRM | AffiliateUpdated | Admin scoped | Affiliate, Wallet | audit, segregation |
| CAP-0024 | Publicar conteúdo editorial | FEATURE-0006 | Content | CMS/Admin | ContentPublished | CONTENT role | Page, Menu, Translation | preview, versioning |
| CAP-0025 | Emitir notificações | FEATURE-0005 | Notifications | Todos os domínios via evento | NotificationRequested | Backend only | Template, Preference | idempotency, provider fallback |
| CAP-0026 | Registrar analytics | FEATURE-0002 | Analytics | Apps e backend | AnalyticsEventRecorded | Público sanitizado | Event, Session | schema, privacy, delivery |
| CAP-0027 | Consultar auditoria | FEATURE-0006 | Admin/Observability | Admin CRM | AuditLogViewed | AUDITOR ou SUPER_ADMIN | AuditEntry | immutability, access control |
| CAP-0028 | Operar offline parcialmente | FEATURE-0002 | Marketplace/Infrastructure | Marketplace | OfflineModeEntered | Público | Cache, ServiceWorker | offline, reconnect, stale data |
| CAP-0029 | Trocar idioma | FEATURE-0002 | Destination/Content | Todas as aplicações | LocaleChanged | Público | Locale, Translation | RTL, fallback, persistence |
| CAP-0030 | Aplicar branding por destino | FEATURE-0007 | Destination/Design System | Todas as aplicações | ThemeResolved | Público | Tokens, Assets, Config | visual regression, fallback |

## 3. Campos obrigatórios para novas capacidades

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

## 4. Critério de prontidão

Uma capacidade somente pode ser considerada pronta quando contratos, autorização, persistência, eventos, testes, observabilidade, documentação e rollback estiverem aprovados.
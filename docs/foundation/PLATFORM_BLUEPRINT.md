# Touristic Digital Platform Blueprint

## 1. Visão executiva

A Touristic Digital Platform é uma plataforma SaaS multi-destino para operar ecossistemas turísticos digitais. Morro Digital é o primeiro destino configurado. Novos destinos reutilizam o mesmo core e variam por configuração, branding, conteúdo, regras autorizadas e integrações.

## 2. Aplicações

- `platform-admin`: operação global, governança, segurança, financeiro, destinos e suporte.
- `marketplace`: experiência B2C por destino.
- `business-portal`: operação B2B por empresas e equipes.
- `platform-api`: APIs públicas e internas.
- `workers`: processamento assíncrono, eventos, conciliação e notificações.

## 3. Camadas

```text
Apps
  ↓
Application Services
  ↓
Domain Modules
  ↓
Ports
  ↓
Infrastructure Adapters
```

Apps não acessam infraestrutura nem internals de outros apps. Domínio não depende de framework, banco ou provedor.

## 4. Bounded contexts iniciais

- Identity
- Tenancy
- Destination
- Catalog
- Ordering
- Booking
- Ticketing
- Financial
- Affiliate
- Notifications
- Search
- Audit

## 5. Multi-destino

`Destination` representa unidade turística, geográfica, operacional e de marca. `Tenant` representa empresa ou organização dentro de um destino.

Toda operação relevante usa `DestinationContext`:

```ts
interface DestinationContext {
  destinationId: string;
  tenantId?: string;
  locale: string;
  timezone: string;
  currency: string;
  correlationId: string;
  userId?: string;
}
```

## 6. Resolução de destino

Ordem padrão:

1. domínio ou subdomínio;
2. slug explícito;
3. sessão persistida;
4. geolocalização autorizada;
5. seleção manual.

A resolução deve retornar evidência, confiança e origem da decisão.

## 7. Geografia

- PostgreSQL com PostGIS.
- Polígonos ou multipolígonos como fonte oficial.
- Raios apenas para descoberta, proximidade e fallback.
- Índices GiST ou SP-GiST conforme perfil de consulta.
- Áreas de sede e atendimento modeladas separadamente.
- Sobreposição resolvida por prioridade, especificidade e regra administrativa auditada.

## 8. Persistência

- PostgreSQL como banco transacional principal.
- PostGIS para dados espaciais.
- Ledger e auditoria append-only.
- Outbox para publicação confiável de eventos.
- Migrations versionadas e revisadas.
- Backups, restore drills e retenção definidos por criticidade.

## 9. Eventos

Envelope mínimo:

```ts
interface EventEnvelope<T> {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  destinationId?: string;
  tenantId?: string;
  correlationId: string;
  causationId?: string;
  payload: T;
}
```

Eventos são nomeados no passado, versionados, idempotentes no consumo e rastreáveis.

## 10. APIs

- REST com OpenAPI como contrato inicial.
- Erros estruturados e códigos estáveis.
- Idempotency-Key em comandos críticos.
- Paginação por cursor para coleções extensas.
- Webhooks assinados, versionados e com retry.
- APIs administrativas e públicas separadas por escopo.

## 11. Financeiro

- Ledger-first.
- Valores em unidades mínimas inteiras.
- Partidas balanceadas.
- Split, comissão, payout, refund e chargeback auditáveis.
- Reversões por lançamentos compensatórios.
- Conciliação com provedores como processo obrigatório.

## 12. Afiliados

Afiliados pertencem à plataforma. A atribuição registra cliente, origem, destino de aquisição, campanha, regra e período de validade. Empresas não administram afiliados diretamente.

## 13. Segurança

- OIDC/OAuth onde aplicável.
- MFA para operações privilegiadas.
- RBAC e ABAC complementar.
- Isolamento por destino e tenant em API e persistência.
- Segredos fora do repositório.
- Auditoria para ações administrativas e cross-destination.
- LGPD desde o desenho.

## 14. Observabilidade

- Logs estruturados.
- Métricas por app, domínio, destino e integração.
- Traces distribuídos com correlationId.
- SLI/SLO para fluxos críticos.
- Alertas acionáveis e runbooks.

## 15. Deploy e evolução

O monorepo permite deploy independente por aplicação e execução seletiva de pipelines. Módulos podem ser extraídos para serviços somente quando métricas, escala, isolamento operacional ou ownership justificarem.

## 16. Destinos

```text
destinations/
  _template/
  morro-digital/
```

Cada destino define branding, domínios, categorias, feature flags, locale, timezone, moeda, integrações autorizadas e parâmetros de operação. Não contém lógica autoritativa duplicada.

## 17. Roadmap técnico

1. Foundation Freeze.
2. Scaffold executável do monorepo.
3. Contracts, Destination Core e Identity Core.
4. Event Bus e persistência.
5. Financial e Affiliate Core.
6. Marketplace, Business Portal e Platform Admin.
7. Booking, Ticketing, Search e Notifications.
8. Escala multi-destino e APIs públicas.

## 18. Critérios de saída da fundação

- Manifest aprovado.
- Glossário e nomenclatura congelados.
- Matriz de dependências definida.
- Error Catalog inicial criado.
- Regras de eventos definidas.
- ADRs críticos aceitos.
- Monorepo, CI e checks arquiteturais executáveis.

## 19. Fonte de verdade

GitHub é a fonte oficial para arquitetura técnica, contratos e código. Google Drive registra visão executiva, planejamento e operação. Divergências seguem a política de governança documental.

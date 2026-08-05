# Architecture

## Visão estrutural

A Touristic Digital Platform é um monorepo orientado a domínios, preparado para múltiplos destinos turísticos e aplicações independentes.

```text
apps/
  platform-admin/
  marketplace/
  business-portal/
  platform-api/
  workers/
packages/
  contracts/
  ui/
  design-tokens/
  auth-client/
  observability/
  config-eslint/
  config-typescript/
  testing/
modules/
  identity/
  tenancy/
  destination/
  catalog/
  ordering/
  booking/
  financial/
  affiliate/
  notifications/
destinations/
  morro-digital/
  _template/
infra/
  docker/
  database/
  observability/
  deployment/
docs/
  architecture/
  adr/
  api/
  database/
  domains/
  engineering/
  security/
  testing/
  operations/
tooling/
  scripts/
```

## Fronteiras

- Apps não importam internals de outros apps.
- Frontends consomem APIs e contratos públicos.
- Módulos de domínio não importam apps ou infraestrutura.
- Infraestrutura implementa portas definidas pelos módulos.
- Financial e Affiliate mantêm lógica autoritativa apenas no backend.
- Cada módulo expõe uma API pública por `index.ts`.
- Dependências cíclicas são proibidas.

## Multi-destino

`Destination` é a unidade turística, geográfica, operacional e de marca. `Tenant` é a organização ou empresa que opera dentro de um destino.

O `DestinationContext` deve acompanhar as operações relevantes e conter, no mínimo:

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

## Geografia

A persistência geoespacial usará PostgreSQL com PostGIS. Polígonos e multipolígonos definem a área oficial do destino. Raios podem ser usados para descoberta aproximada e fallback.

## Fonte oficial

Este repositório é a fonte oficial para arquitetura, contratos, ADRs, padrões técnicos e código. O Google Drive permanece como camada de governança executiva e operacional.

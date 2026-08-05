# Touristic Digital Platform

Plataforma multi-destino que evolui a V1 do Morro Digital sem reconstruí-la de forma desconectada.

## Princípios obrigatórios

1. Preservar antes de substituir.
2. Transformar a V1 na plataforma, mantendo equivalência visual, funcional e comportamental.
3. Novos destinos entram por configuração, não por duplicação de código.
4. Mapbox permanece como engine geoespacial principal; OpenRouteService e Leaflet compõem a estratégia de resiliência.
5. Nenhuma remoção ocorre sem inventário, ADR, testes e evidência de equivalência.

## Estrutura

- `apps/`: produtos executáveis por público e operação.
- `packages/`: capacidades reutilizáveis e contratos.
- `services/`: processos de backend, filas e integrações.
- `tooling/`: engenharia, migração e observatórios.
- `infrastructure/`: deploy, ambientes e observabilidade.
- `docs/`: constituição, handbook, ADRs e migração.

## Primeiros pacotes

- `@touristic/core`
- `@touristic/shared`
- `@touristic/design-system`
- `@touristic/geospatial`

## Comandos

```bash
corepack enable
pnpm install
pnpm check
```

## Estado

Fundação oficial em construção. A V1 continua como baseline funcional e comportamental até que cada onda obtenha equivalência comprovada.

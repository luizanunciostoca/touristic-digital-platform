# ADR-0003 — Estratégia de providers geoespaciais

- Status: Accepted
- Data: 2026-08-05

## Contexto

Mapa, localização e navegação são capacidades centrais da plataforma. A V1 utiliza Mapbox e possui estratégias complementares que precisam ser preservadas durante a migração.

## Decisão

1. Mapbox permanece como provider principal de mapa.
2. Mapbox Directions permanece como roteamento primário.
3. OpenRouteService é o fallback de roteamento.
4. Leaflet permanece como contingência e compatibilidade controlada.
5. Aplicações não acessam SDKs ou APIs dos providers diretamente; usam contratos de `@touristic/geospatial`.
6. Chaves, limites, timeouts, telemetria, cache e fallback são tratados por adapters.
7. Alterações de provider exigem ADR, teste de equivalência geoespacial e rollback.

## Alternativas consideradas

- Remover Mapbox e reescrever o mapa: rejeitado por risco de regressão e perda de comportamento da V1.
- Permitir acesso direto dos apps aos providers: rejeitado por acoplamento e dificuldade de contingência.

## Consequências

### Positivas

- Preservação da experiência atual.
- Fallbacks testáveis e substituição futura controlada.
- Métricas e custos centralizados.

### Negativas

- Exige adapters e contratos adicionais.
- Nem toda capacidade de um provider será exposta diretamente.

## Preservação da V1

Camadas, marcadores, câmera, rotas, geolocalização, estilos e fallbacks devem possuir baselines antes da migração.

## Rollback

Cada capacidade migrada poderá retornar ao adapter legado correspondente por feature flag controlada.

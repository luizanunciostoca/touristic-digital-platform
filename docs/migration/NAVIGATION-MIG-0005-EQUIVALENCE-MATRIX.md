# Navigation MIG-0005 — Matriz de Equivalência Executável

## Objetivo

Consolidar os 24 cenários obrigatórios definidos em `NAVIGATION-V1-BASELINE.md` para `MIG-0005 / FEATURE-0003`, sem reabrir checkpoints já comprovados.

Fonte V1 congelada:

```text
luizidebook/morro-de-sao-paulo-digital
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

## Checkpoints V2 consolidados

```text
Baseline funcional/visual anterior
PR #49 / NAV-26
head fe6da25bab17a1cbecf510de3002b82cf088f4c7
Quality Gate #542 — success
Navigation Visual Baseline #19 — success

Accuracy V1
PR #52
head 211054cebd4e5e991958e2292e7eb4d3bbecb0f6
bootstrap max accuracy 1500 m
guidance max accuracy 300 m

Routing fallback Mapbox Directions
PR #53
head 54ee3ca76e46b59fe8e4aa622bd3afae0ab8c835
Quality Gate #568 — success
Navigation Visual Baseline #41 — success

Acessibilidade durante navegação ativa
PR #54
head 68177abb57f648ac73b0e3d3d999a510badfd5a4
Quality Gate #569 — success
Navigation Accessibility Baseline #1 — success
artifact 9031022524
sha256 a23b789045ee557d4001cefed8f1a8603f704ef59c1ddc787d05f965ce89d161

Provider fallback durante navegação
PR #55
head d2a169b29ec991c9fb42918af593cdbff10fbb05
Quality Gate #575 — success
```

## Estados da matriz

- `PASS`: existe teste executável ou prova browser aplicável e o contrato V1 está materializado na V2.
- `PARTIAL`: parte do contrato está provada, mas falta uma condição obrigatória.
- `GAP`: não existe implementação/prova suficiente.

## Matriz obrigatória

| # | Cenário V1 obrigatório | Estado | Evidência V2 | Pendência |
| --: | --- | --- | --- | --- |
| 1 | iniciar navegação com localização válida | PASS | NAV-10/NAV-11/NAV-25B + Navigation Visual Baseline | nenhuma |
| 2 | permissão de localização negada | PASS | `browser-geolocation.test.ts`: denial, rejeição e cleanup do watcher | nenhuma |
| 3 | localização imprecisa | PASS | PR #52: baseline V1 materializado com `1500 m` no bootstrap e `300 m` no guidance | nenhuma |
| 4 | coordenadas inválidas | PASS | request port + routing parity rejeitam coordenadas inválidas antes de lifecycle/rede | nenhuma |
| 5 | routing proxy success | PASS | routing parity + browser journey com `POST /api/routing/directions` | nenhuma |
| 6 | routing proxy timeout | PASS | timeout tipado/abort; limites e default V1 preservados | nenhuma |
| 7 | routing proxy unavailable | PASS | indisponibilidade same-origin e erro primário distinguidos | nenhuma |
| 8 | fallback elegível | PASS | PR #53: provider Mapbox Directions concreto no boundary geospatial/app, troca primário → fallback e adaptação ao contrato consumido pela navegação | nenhuma |
| 9 | cancelamento durante request | PASS | bootstrap cancelável + session `AbortSignal`; stop impede ativação tardia | nenhuma |
| 10 | sessão A substituída por sessão B | PASS | supersession monotônica + geração/sessão oficial | nenhuma |
| 11 | callback tardio da sessão A | PASS | stale work, stale route result e recalculation stale-session | nenhuma |
| 12 | atualização de progresso ao longo da rota | PASS | geometry parity + runtime/status browser | nenhuma |
| 13 | ruído GPS com pequeno movimento para trás | PASS | regressão geométrica + visual backward guard | nenhuma |
| 14 | mudança de bearing | PASS | bearing/tangente + smoothing/dead-band + presenter/câmera | nenhuma |
| 15 | aproximação de manobra e histerese de zoom | PASS | fixture V1 e fronteiras `65 / 22 / 38 / 90 m` | nenhuma |
| 16 | polling sem movimento real | PASS | polling sem mudança visual não reinicia `easeTo` | nenhuma |
| 17 | minimizar/maximizar banner | PASS | Navigation Visual Baseline em mobile/tablet/desktop, incluindo `aria-expanded` | nenhuma |
| 18 | cancelamento manual | PASS | botão Encerrar → `navigationEnded.reason=cancelled` + teardown | nenhuma |
| 19 | chegada ao destino | PASS | core `100 m / 30 m / auto-end 5 s` + browser integration + reason `arrived` | nenhuma |
| 20 | cleanup após `navigationEnded` | PASS | lifecycle/installer teardown idempotente + browser proof | nenhuma |
| 21 | fallback de mapa/provider quando aplicável | PASS | PR #55 + `NAVIGATION-PROVIDER-FALLBACK-V1-CONTRACT.md`: runtime Mapbox é destruído antes do fallback e navegação guiada não é duplicada em Leaflet/development | nenhuma |
| 22 | alto contraste | PASS | PR #54 / Navigation Accessibility Baseline #1: navegação ativa em `forced-colors: active` nas três viewports | nenhuma |
| 23 | texto ampliado | PASS | PR #54 / Navigation Accessibility Baseline #1: navegação ativa a 200%, sem clipping/overlap impeditivo e com controles utilizáveis | nenhuma |
| 24 | mobile/tablet/desktop | PASS | Navigation Visual Baseline + Accessibility Baseline em mobile/tablet/desktop | nenhuma |

## Resultado consolidado

```text
PASS     24
PARTIAL   0
GAP       0
TOTAL    24
```

## Decisão do cenário 21

A V1 congelada não implementa dois motores visuais de navegação concorrentes. Mapbox e Leaflet não devem renderizar a mesma rota guiada em sequência ou simultaneamente. A navegação first-person/câmera/marcador depende do Mapbox real.

Na V2, portanto:

1. `prepareMapContainerForFallback()` destrói o runtime de navegação Mapbox antes da troca de provider;
2. aliases Mapbox são limpos antes do fallback;
3. `installBrowserNavigationRuntime()` é instalado somente quando `provider.mode === "real"`;
4. Leaflet/development continua sendo fallback cartográfico da Home, sem um motor de navegação guiada inventado fora do contrato V1.

Esse contrato está documentado e testado no PR #55.

## Decisão de estado de MIG-0005

Todos os 24 cenários obrigatórios estão em `PASS`, com evidência comportamental, browser/visual onde aplicável, testes automatizados, boundaries arquiteturais e caminho de teardown/rollback preservados.

Assim, `MIG-0005` pode avançar de `mapped` para `equivalent`, condicionado ao Quality Gate verde do checkpoint de consolidação que atualiza esta matriz, o Master Migration Tracker e o Feature Registry no mesmo head.

`equivalent` não significa `released`: publicação/rollout continua sendo uma etapa posterior e separada.

## Higiene da pilha

- PR #50 / NAV-27 permanece superseded pelo PR #49.
- Checkpoints de accuracy, routing fallback, acessibilidade e provider fallback foram mantidos isolados.
- Workflows temporários usados para diagnóstico/formatação foram removidos antes dos heads finais considerados como evidência.
- Nenhuma funcionalidade Leaflet de navegação foi criada por inferência.

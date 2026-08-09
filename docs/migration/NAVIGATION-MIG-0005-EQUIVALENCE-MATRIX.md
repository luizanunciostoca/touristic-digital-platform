# Navigation MIG-0005 — Matriz de Equivalência Executável

## Objetivo

Consolidar, sem reabrir escopos já comprovados, os 24 cenários obrigatórios definidos em `NAVIGATION-V1-BASELINE.md` para `MIG-0005 / FEATURE-0003`.

Fonte V1 congelada:

```text
luizidebook/morro-de-sao-paulo-digital
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

Checkpoint V2 usado nesta matriz:

```text
PR #49 / NAV-26
head fe6da25bab17a1cbecf510de3002b82cf088f4c7
Quality Gate #542 — success
Navigation Visual Baseline #19 — success
artifact 9030069586
sha256 c5f088203e99e5251a2a9f74585e08c8ed92ccae0ddbb9917ef31f65990b575d
```

## Estados da matriz

- `PASS`: existe teste executável ou prova browser aplicável e o contrato está materializado na V2.
- `PARTIAL`: parte do contrato está provada, mas falta uma condição obrigatória V1 ou prova no boundary correto.
- `GAP`: não existe implementação/prova suficiente para declarar equivalência.

## Matriz obrigatória

|   # | Cenário V1 obrigatório                     | Estado  | Evidência V2                                                                                                                             | Pendência objetiva                                                                                                                              |
| --: | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | iniciar navegação com localização válida   | PASS    | NAV-10/NAV-11/NAV-25B + Navigation Visual Baseline #19                                                                                   | nenhuma                                                                                                                                         |
|   2 | permissão de localização negada            | PASS    | NAV-07 `browser-geolocation.test.ts`: permission denial rejeita requests e cleanup do watcher                                            | nenhuma                                                                                                                                         |
|   3 | localização imprecisa                      | GAP     | `BrowserLocation.accuracy` é transportado, porém o serviço atual só valida coordenadas/freshness                                         | materializar e testar baseline V1: bootstrap max accuracy `1500 m` e guidance max accuracy `300 m`                                              |
|   4 | coordenadas inválidas                      | PASS    | NAV-14 request port + NAV-16 routing parity rejeitam coordenadas inválidas antes do lifecycle/rede                                       | nenhuma                                                                                                                                         |
|   5 | routing proxy success                      | PASS    | NAV-02/NAV-16 + jornada browser #19 com `POST /api/routing/directions` determinístico                                                    | nenhuma                                                                                                                                         |
|   6 | routing proxy timeout                      | PASS    | NAV-02 cobre timeout tipado/abort e limites 1–30 s, default 12 s                                                                         | nenhuma                                                                                                                                         |
|   7 | routing proxy unavailable                  | PASS    | NAV-16 congela indisponibilidade same-origin e distinção de backend real indisponível                                                    | nenhuma para erro primário; fallback é tratado no cenário 8                                                                                     |
|   8 | fallback elegível                          | GAP     | core NAV-02 possui seleção abstrata de fallback, mas não há prova de provider Mapbox Directions concreto integrado ao browser navigation | implementar adapter concreto no boundary geospatial/app e provar troca primário → fallback sem segredo no browser                               |
|   9 | cancelamento durante request               | PASS    | NAV-10 bootstrap cancelável + session AbortSignal; stop impede ativação tardia                                                           | nenhuma                                                                                                                                         |
|  10 | sessão A substituída por sessão B          | PASS    | NAV-01/NAV-17 supersession monotônica + NAV-10 geração/sessão oficial                                                                    | nenhuma                                                                                                                                         |
|  11 | callback tardio da sessão A                | PASS    | NAV-17 stale work + NAV-18 stale route result + NAV-22 recalculation stale-session                                                       | nenhuma                                                                                                                                         |
|  12 | atualização de progresso ao longo da rota  | PASS    | NAV-03/NAV-15 geometry parity + NAV-25B runtime/status real                                                                              | nenhuma                                                                                                                                         |
|  13 | ruído GPS com pequeno movimento para trás  | PASS    | NAV-03/NAV-15 regressão geométrica + NAV-04 visual backward guard                                                                        | nenhuma                                                                                                                                         |
|  14 | mudança de bearing                         | PASS    | NAV-03 bearing/tangente + NAV-04 smoothing/dead-band + NAV-26 presenter/câmera                                                           | nenhuma                                                                                                                                         |
|  15 | aproximação de manobra e histerese de zoom | PASS    | NAV-26 fixture V1 e testes das fronteiras `65 / 22 / 38 / 90 m`                                                                          | nenhuma                                                                                                                                         |
|  16 | polling sem movimento real                 | PASS    | NAV-26 prova que polling sem mudança visual não reinicia `easeTo`                                                                        | nenhuma                                                                                                                                         |
|  17 | minimizar/maximizar banner                 | PASS    | Navigation Visual Baseline #19 nas três viewports; `aria-expanded` e secondary state validados                                           | nenhuma                                                                                                                                         |
|  18 | cancelamento manual                        | PASS    | Navigation Visual Baseline #19: botão Encerrar → `navigationEnded.reason=cancelled` + teardown                                           | nenhuma                                                                                                                                         |
|  19 | chegada ao destino                         | PASS    | NAV-20 core 100 m / 30 m / auto-end 5 s + NAV-21 browser integration + NAV-25B reason `arrived`                                          | nenhuma funcional; visual de chegada não é requisito separado nesta linha                                                                       |
|  20 | cleanup após `navigationEnded`             | PASS    | NAV-21/NAV-25B + installer teardown idempotente + browser #19 após cancelamento                                                          | nenhuma                                                                                                                                         |
|  21 | fallback de mapa/provider quando aplicável | PARTIAL | regressões Geospatial comprovam fallback/rollback Mapbox da Home; Navigation runtime é instalado somente no Mapbox real                  | decidir/registrar contrato esperado da navegação quando mapa cai para Leaflet/development e adicionar teste explícito de não-vazamento/teardown |
|  22 | alto contraste                             | GAP     | Home possui contrato `forced-colors`, mas Navigation Visual Baseline #19 não executa `forced-colors` com banner ativo                    | adicionar captura/asserções de navegação ativa e minimizada em `forced-colors`                                                                  |
|  23 | texto ampliado                             | GAP     | Home possui regressão de text enlargement, mas o banner de navegação ativo não é coberto                                                 | adicionar browser proof com texto ampliado, sem clipping/overlap e com controles utilizáveis                                                    |
|  24 | mobile/tablet/desktop                      | PASS    | Navigation Visual Baseline #19: `390×844`, `768×1024`, `1440×900`                                                                        | nenhuma                                                                                                                                         |

## Resultado consolidado

```text
PASS    19
PARTIAL  1
GAP      4
TOTAL   24
```

Os quatro gaps objetivos são:

1. `NAV-MATRIX-ACCURACY` — limites V1 de accuracy (`1500 m` bootstrap / `300 m` guidance);
2. `NAV-MATRIX-ROUTING-FALLBACK` — provider fallback Mapbox Directions concreto e integrado;
3. `NAV-MATRIX-FORCED-COLORS` — prova browser de navegação em alto contraste;
4. `NAV-MATRIX-TEXT-ENLARGEMENT` — prova browser de navegação com texto ampliado.

O cenário 21 permanece `PARTIAL` até o contrato de fallback de mapa durante uma sessão de navegação ser explicitamente congelado e testado. Ele não autoriza criar navegação Leaflet por inferência; a decisão deve seguir a V1 congelada.

## Decisão de estado de MIG-0005

Esta matriz **não promove automaticamente** `MIG-0005` para `equivalent`.

Enquanto `GAP` ou `PARTIAL` permanecerem, o tracker deve continuar sem equivalência final. Cada correção deve ser feita em checkpoint isolado, com Quality Gate completo e sem workflow temporário no head final.

## Sequência mínima recomendada

1. congelar e implementar `accuracy` V1, pois é regra funcional/safety de guidance e não depende de browser visual;
2. materializar o routing fallback concreto no boundary correto, sem token/segredo no browser;
3. congelar o comportamento V1 quando o provider de mapa cai para fallback durante navegação e resolver o cenário 21 sem inventar funcionalidade;
4. estender o workflow permanente de Navigation Visual Baseline para `forced-colors` e texto ampliado;
5. reexecutar os 24 cenários e só então decidir promoção de `MIG-0005`.

## Higiene da pilha

O PR #50 / NAV-27 foi fechado como `superseded` pelo PR #49. A implementação final de guidance está em `navigation-guidance-ui.ts` e foi comprovada no mesmo head da captura browser real; nenhuma funcionalidade do PR #50 precisa ser reaplicada.

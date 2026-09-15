# Navigation V1 Source Re-certification — 2026-09-15

## Objetivo

Registrar a reconciliação direta de `MIG-0005 / FEATURE-0003` contra os bytes do ZIP canônico da V1, substituindo a limitação anterior em que a revisão dependia apenas de documentação secundária e checkpoints históricos.

Esta evidência deve ser lida em conjunto com `NAVIGATION-V1-GAP-REGISTER.md`, `NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md`, `MASTER-MIGRATION-TRACKER.md` e PR #60.

## Proveniência do snapshot V1

Arquivo fornecido para a re-certificação: `morro-de-sao-paulo-digital-main.zip`.

O próprio snapshot contém `release.json` com:

```text
sourceCommit = 55acb639c1112a3c9a646dd103b01ad9cf5dd106
```

SHA-256 do arquivo recebido:

```text
d438109fc6a76ddc11f7f90d7f02c98d4b95fe456f78f34b66eae5cbeb5eaf97
```

Hashes dos módulos críticos usados nesta reconciliação:

| Fonte V1 | SHA-256 |
| --- | --- |
| `js/navigation/navigationInstructions/translateInstruction.js` | `32d9187a6eda6bf4aeeaf484e133149708f38406c15ea344128c107223cabf8c` |
| `js/navigation/navigationSuggestions/navigation-suggestions.js` | `6a99811b861f21485c31e75e192dce88e3a1f0ef443202160532c2bfccc4a0c4` |
| `js/navigation/navigationSuggestions/navigation-sponsors.js` | `a9749a82f54263522f62773a66227d89fcdc2e897b0f257b365ff0ed5946cb1d` |
| `js/navigation/navigationServices/mapboxDirectionsService.js` | `44275abcaeb4022bb361612c18d71ca8be1db65389d3a5afe2cc8227649efb7b` |
| `js/navigation/navigationServices/routing-client.js` | `3c564b3c8d23a148db038413be1e93d83a9c769690f37482b349ccea6d1248cb` |

O ZIP não é incorporado ao repositório V2. A rastreabilidade é feita por `sourceCommit`, SHA-256 do arquivo e SHA-256 dos módulos críticos.

## NAV-PJ-09 — processamento semântico multilíngue

A jornada ativa da V1 usa `js/navigation/navigationUi/bannerUI.js` para transformar a instrução de provider em uma ação curta apresentada no cabeçalho do banner. O contrato observado cobre tipos ORS numéricos `0..12`, nomes string compatíveis (`continue`, `turn-left`, `turn-right`, `turn-slight-*`, `turn-sharp-*`, `keep-*`, `uturn`, `arrive`, `destination`), fallback por análise do texto inglês do provider, ação localizada em PT/EN/ES/HE e preservação da instrução original.

O detalhe do banner é montado como `ação + conector localizado + rua + conector localizado + distância`, com detecção separada de chegada e extração da rua a partir de `streetName`, `name`, ` on ` ou ` onto `.

| Idioma | `navigation_on` | `navigation_for` |
| --- | --- | --- |
| PT | `na` | `por` |
| EN | `on` | `for` |
| ES | `en` | `por` |
| HE | `על` | `עבור` |

A fonte contém uma peculiaridade histórica: `navigation_turn_slight_right` não está definido no conjunto genérico carregado e `bannerUI.js` cai no literal `Slight right`. A camada de paridade V2 preserva deliberadamente esse fallback.

A PR #60 mantém `processNavigationInstructionText` como sanitização sem perda semântica e adiciona o simplificador semântico V1, transporte de `type/maneuver.type`, idioma e `streetName/name`, preservação de `guidance.original` e reconstrução do detalhe do banner segundo `buildDetailsText` da V1.

Resultado source-exactness: **PASS**.

## NAV-PJ-10 — sugestões contextuais durante a rota

A fonte `navigation-suggestions.js` + `navigation-sponsors.js` define:

```text
warmup                              20 s
movimento mínimo                    30 m
intervalo global                    60 s
cooldown por local                   5 min
máximo por sessão                   10
máximo simultâneo                    1
raio padrão                        200 m
duração visual                       8 s
monitoramento                       15 s
```

Categorias orgânicas habilitadas: `restaurants`, `shops`, `attractions`, `hotels`, `nightlife`, `tours`.

Prioridade canônica — menor número vence:

```text
emergencies   0
restaurants   1
attractions   2
shops         3
tours         4
hotels        5
nightlife     6
```

Candidatos orgânicos usam `(categoryPriority[category] || 5) + 10`, mantendo patrocinadores à frente. O array canônico `SPONSORS` não contém entrada ativa; apenas exemplos comentados.

Raios por categoria:

```text
emergencies  500 m
restaurants  200 m
shops        150 m
attractions  300 m
hotels       250 m
nightlife    200 m
tours        300 m
```

A seleção ordena primeiro por prioridade crescente e depois por distância crescente, usa Haversine, atualiza a última posição avaliada mesmo sem candidato e permite repetir o mesmo local depois do cooldown. A fonte também contém templates localizados PT/EN/ES/HE por categoria e faixas `nearby`, metros e quilômetros.

Os defaults provisórios anteriores da PR #60 (`30 s`, `20 m`, `80 m`, `10 min`, máximo `3` e ranking diferente) foram substituídos pela política canônica e protegidos por testes determinísticos. A V2 preserva o evento tipado novo e também emite o evento histórico `navigationSuggestion`.

Resultado source-exactness: **PASS**.

## NAV-PJ-11 — routing/provider degradado

`js/navigation/navigationServices/routing-client.js` confirma:

1. provider primário `POST /api/routing/directions` same-origin;
2. upstream server-side OpenRouteService;
3. perfil `foot-walking`;
4. idiomas `pt/en/es/he`;
5. fallback Mapbox Directions apenas para proxy indisponível, resposta inválida ou HTTP `404/405/501`;
6. endpoint `https://api.mapbox.com/directions/v5/mapbox/walking`;
7. `alternatives=false`, `geometries=geojson`, `overview=full`, `steps=true`, `voice_units=metric`;
8. resposta Mapbox adaptada para FeatureCollection/segments/steps.

O bootstrap visual da V1 usa Mapbox como primário e Leaflet como contingência. O core de rota/guidance permanece separado da capacidade visual do provider.

`packages/navigation/src/routing.ts` e `packages/geospatial/src/adapters/routing-mapbox.ts` já reproduzem esse contrato em forma tipada. A PR #60 mantém o mesmo Navigation core sob provider visual degradado e reduz apenas capacidades de câmera não suportadas pela contingência.

Não foi necessária mudança de política de routing nesta rodada; os bytes canônicos confirmaram a implementação existente.

Resultado source-exactness: **PASS**.

## Itens deliberadamente não reintroduzidos

O snapshot contém `poiEnricher.js`, porém a auditoria não encontrou chamada ativa desse enriquecedor OSM na jornada principal de turn-by-turn certificada. Ele não é reintroduzido como dependência morta na V2.

## Evidência executável obrigatória

A promoção de `MIG-0005 / FEATURE-0003` exige que o mesmo exact-head desta reconciliação passe Quality Gate, Navigation Turn-by-Turn Parity, Navigation Visual Baseline, Navigation Accessibility Baseline, Map Provider Regression, V1 Explore Locations Browser Regression, Map Tour Browser Regression e demais contracts acionados pela PR.

`Navigation Turn-by-Turn Parity` continua a prova P0 da jornada `step 0 → 1 → 2 → approaching → arrived → auto-end`. Os testes unitários source-dependent protegem o mapeamento semântico e a política exata de sugestões recuperada do ZIP.

## Decisão de equivalência

Com a disponibilidade dos bytes canônicos, a antiga classe de bloqueio `source-exactness PARTIAL` deixa de existir. A promoção para `equivalent` é tecnicamente válida quando o exact-head desta reconciliação concluir os gates obrigatórios com sucesso.

`equivalent` continua distinto de `released` e não autoriza produção por si só.

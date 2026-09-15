# Navigation MIG-0005 — Matriz de Equivalência Executável

## Objetivo

Consolidar a evidência de paridade de `MIG-0005 / FEATURE-0003` contra o ZIP canônico V1 e contra os gates executáveis da V2.

## Fontes V1

Baseline histórica dos checkpoints anteriores:

```text
luizidebook/morro-de-sao-paulo-digital
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

Snapshot canônico diretamente inspecionado em 2026-09-15:

```text
sourceCommit = 55acb639c1112a3c9a646dd103b01ad9cf5dd106
ZIP SHA-256 = d438109fc6a76ddc11f7f90d7f02c98d4b95fe456f78f34b66eae5cbeb5eaf97
```

A reconciliação byte/source-dependent está registrada em `NAVIGATION-V1-SOURCE-RECERTIFICATION-2026-09-15.md`.

## Estados

- `PASS`: implementação e prova aplicável existem;
- `PARTIAL`: implementação existe, mas falta prova necessária;
- `GAP`: responsabilidade V1 reconhecida sem implementação/prova suficiente.

## Matriz histórica de 24 cenários

| # | Cenário histórico | Estado | Evidência / observação |
| --: | --- | --- | --- |
| 1 | iniciar navegação com localização válida | PASS | bootstrap + browser journey |
| 2 | permissão de localização negada | PASS | denial + cleanup |
| 3 | localização imprecisa | PASS | 1500 m bootstrap / 300 m guidance |
| 4 | coordenadas inválidas | PASS | rejeição pré-rede |
| 5 | routing proxy success | PASS | same-origin routing |
| 6 | routing proxy timeout | PASS | Navigation fixa 15 s |
| 7 | routing proxy unavailable | PASS | erro primário distinguível |
| 8 | fallback elegível | PASS | proxy ORS → Mapbox apenas nos erros V1 elegíveis |
| 9 | cancelamento durante request | PASS | AbortSignal da sessão |
| 10 | sessão A substituída por B | PASS | supersession monotônica |
| 11 | callback tardio da sessão A | PASS | stale protection |
| 12 | progresso ao longo da rota | PASS | geometry/runtime |
| 13 | ruído GPS / pequeno retorno | PASS | backward guard |
| 14 | bearing | PASS | tangente + smoothing |
| 15 | aproximação de manobra / zoom | PASS | câmera/histerese |
| 16 | polling sem movimento | PASS | sem easeTo redundante |
| 17 | minimizar/maximizar banner | PASS | visual baseline |
| 18 | cancelamento manual | PASS | teardown |
| 19 | chegada ao destino | PASS | aproximação/chegada/auto-end + UI/TTS |
| 20 | cleanup após navigationEnded | PASS | teardown idempotente |
| 21 | mapa/provider degradado | PASS | ZIP `55ac...` confirma Mapbox visual primário + Leaflet contingência; V2 mantém o mesmo Navigation core e degrada apenas câmera não suportada |
| 22 | alto contraste | PASS | accessibility baseline |
| 23 | texto ampliado | PASS | accessibility baseline |
| 24 | mobile/tablet/desktop | PASS | visual/accessibility baseline |

Resultado:

```text
PASS     24
PARTIAL   0
GAP       0
TOTAL    24
```

## Obrigações da jornada completa

| ID | Obrigação | Estado | Evidência |
| --- | --- | --- | --- |
| NAV-PJ-01 | avanço automático `step 0 → 1 → 2` | PASS | threshold ~20 m + unit/browser turn-by-turn |
| NAV-PJ-02 | voz por nova manobra | PASS | Navigation TTS + browser evidence |
| NAV-PJ-03 | GPS inicial com até 3 tentativas | PASS | 15 s / 20 s / 25 s |
| NAV-PJ-04 | reutilizar localização recente | PASS | recent-location cache |
| NAV-PJ-05 | timeout efetivo de rota em 15 s | PASS | session bootstrap |
| NAV-PJ-06 | supressão inicial de recálculo | PASS | 15 s normal / 120 s tutorial |
| NAV-PJ-07 | aviso de aproximação e chegada | PASS | banner + TTS + auto-end |
| NAV-PJ-08 | feedback do Assistant após término | PASS | assistant navigation feedback |
| NAV-PJ-09 | processamento multilíngue de apresentação | PASS | ZIP `55ac...` comparado diretamente com `bannerUI.js`; simplificador semântico, tipo, idioma, rua, detalhes e original reconciliados; source tests |
| NAV-PJ-10 | sugestões contextuais durante rota | PASS | ZIP `55ac...` comparado diretamente; política 20 s/30 m/60 s/5 min/10, ranking/raios/templates/evento/lifecycle materializados e testados |
| NAV-PJ-11 | navegação quando Mapbox não está disponível | PASS | `routing-client.js`/Mapbox fallback e Mapbox→Leaflet contingência comparados diretamente; V2 typed routing contract + provider regression |

```text
NAV-PJ PASS     11
NAV-PJ PARTIAL   0
NAV-PJ GAP       0
```

## Contrato executável obrigatório

`.github/workflows/navigation-turn-by-turn-parity.yml` conduz GPS determinístico por:

```text
step 0 → step 1 → step 2 → approaching → arrived → auto-end
```

O gate valida progressão de manobra, banner, status observável, TTS de cada nova instrução, aproximação, chegada e feedback final do Assistant. Provider/Visual/Accessibility permanecem cobertos por seus gates próprios.

O checkpoint funcional anterior `b98e7bfe5d9e262035701831bade7bb36787b2be` já provou a jornada integral antes da recuperação da fonte. A rodada atual adiciona a prova que faltava: comparação direta contra o ZIP `55ac...` e correção das diferenças source-dependent encontradas em NAV-PJ-09/10.

## Decisão de MIG-0005

Com a fonte canônica diretamente reconciliada, o estado de conteúdo passa a:

```text
Navigation Core                 EQUIVALENT
Navigation Geometry/Camera      EQUIVALENT
Navigation Product Journey      EQUIVALENT
Runtime GAP                     0
Source-exactness PARTIAL        0
MIG-0005 / FEATURE-0003         EQUIVALENT CANDIDATE
```

A promoção registral para `equivalent` é válida somente no exact-head que contém esta matriz e conclui os gates obrigatórios da PR com sucesso. O resultado final do exact-head fica registrado na PR #60 e no bloqueio #62 sem exigir alteração adicional desta matriz.

`equivalent` continua distinto de `released`.

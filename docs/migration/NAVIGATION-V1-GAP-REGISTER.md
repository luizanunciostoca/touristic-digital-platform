# Navigation V1 Gap Register — MIG-0005 / FEATURE-0003

## Objetivo

Registrar de forma auditável os gaps descobertos na revisão da jornada V1 e o fechamento contra o snapshot canônico `55acb639c1112a3c9a646dd103b01ad9cf5dd106`.

## Fonte canônica reconciliada

Em 2026-09-15 os bytes de `morro-de-sao-paulo-digital-main.zip` foram disponibilizados diretamente para a re-certificação.

```text
sourceCommit = 55acb639c1112a3c9a646dd103b01ad9cf5dd106
ZIP SHA-256 = d438109fc6a76ddc11f7f90d7f02c98d4b95fe456f78f34b66eae5cbeb5eaf97
```

A evidência detalhada de provenance, módulos e hashes está em `NAVIGATION-V1-SOURCE-RECERTIFICATION-2026-09-15.md`.

A baseline histórica `60746fd7fed97b805758b37adfdbe3bad2582bfe` continua preservada como evidência dos checkpoints anteriores, mas não é usada para substituir o snapshot canônico nesta recertificação.

## Checkpoints anteriores preservados

Continuam válidos no escopo original:

- NAV-15 — geometry baseline;
- NAV-16 — routing baseline;
- NAV-17 — session/concurrency baseline;
- NAV-18 — stale route result baseline;
- GAP-NAV-001 — arrival lifecycle core;
- GAP-NAV-002 — route recalculation core;
- GAP-NAV-003 — event/state snapshot;
- GAP-NAV-004 — visual/camera executable baseline.

## Gaps descobertos na auditoria 2026-09-15

### GAP-NAV-005 — Automatic maneuver progression

**Estado:** REMEDIATED / PASS CANDIDATE

- avanço automático ~20 m;
- usa endpoint geométrico do step quando disponível;
- suporta ultrapassagem de waypoint;
- fallback sem `stepEnds` consome no máximo uma manobra por snapshot;
- browser contract percorre `0 → 1 → 2`.

### GAP-NAV-006 — Turn-by-turn speech and arrival feedback

**Estado:** REMEDIATED / PASS CANDIDATE

- TTS pertence ao runtime Navigation;
- nova manobra falada uma vez por sessão/step;
- aproximação, chegada e recálculo possuem speech;
- PT/EN/ES/HE;
- chegada possui estado próprio de UI;
- Assistant recebe feedback final sem duplicar o motor de navegação.

### GAP-NAV-007 — Initial GPS acquisition parity

**Estado:** REMEDIATED / PASS CANDIDATE

- reutilização de localização recente aceitável;
- até três aquisições: 15 s, 20 s, 25 s;
- permission denied interrompe imediatamente;
- limite bootstrap 1500 m;
- localização aceita alimenta cache recente.

### GAP-NAV-008 — Effective routing timeout

**Estado:** REMEDIATED / PASS CANDIDATE

- Navigation fixa 15 s para route request e recalculation request;
- default genérico do cliente permanece independente.

### GAP-NAV-009 — Initial recalculation suppression

**Estado:** REMEDIATED / PASS CANDIDATE

- 15 s normal;
- 120 s tutorial;
- `tutorial` atravessa request port → DOM lifecycle → bootstrap → composition.

### GAP-NAV-010 — Multilingual semantic instruction presentation

**Estado:** REMEDIATED + SOURCE-RECONCILED / PASS CANDIDATE

A inspeção direta de `js/navigation/navigationUi/bannerUI.js` confirmou que a V1 possuía simplificador semântico ativo, não apenas limpeza textual.

A PR #60 passa a reproduzir:

- tipos ORS numéricos `0..12`;
- tipos string compatíveis;
- fallback textual histórico;
- ação localizada PT/EN/ES/HE;
- peculiaridade V1 `Slight right` quando a chave genérica está ausente;
- preservação de `guidance.original`;
- transporte de maneuver type e street/name;
- `buildDetailsText` V1 com conectores localizados, rua e distância;
- idioma ativo propagado pelo bootstrap até runtime/banner/TTS.

`poiEnricher.js` não foi reintroduzido porque não possui chamada ativa na jornada principal do snapshot canônico.

### GAP-NAV-011 — Contextual route suggestions

**Estado:** REMEDIATED + SOURCE-RECONCILED / PASS CANDIDATE

Os valores provisórios da primeira remediação foram substituídos pela política canônica recuperada de `navigation-suggestions.js` e `navigation-sponsors.js`:

```text
warmup                        20 s
movement threshold            30 m
global suggestion interval    60 s
per-place cooldown             5 min
session maximum               10
simultaneous maximum           1
default radius               200 m
display duration               8 s
monitor interval              15 s
```

Categorias orgânicas: `restaurants`, `shops`, `attractions`, `hotels`, `nightlife`, `tours`.

Prioridade V1 — menor número vence:

```text
emergencies 0, restaurants 1, attractions 2, shops 3,
tours 4, hotels 5, nightlife 6
```

Raios V1:

```text
emergencies 500, restaurants 200, shops 150, attractions 300,
hotels 250, nightlife 200, tours 300 (metros)
```

A V2 também reproduz Haversine, ordenação prioridade→distância, cooldown, reset, máximo por sessão, templates PT/EN/ES/HE, labels de distância, 8 s de exibição e o evento histórico `navigationSuggestion`, preservando em paralelo o evento tipado V2.

O `SPONSORS` canônico não possui entradas ativas; o contrato de prioridade/radius patrocinado permanece suportado para configuração futura.

### GAP-NAV-012 — Degraded navigation without Mapbox

**Estado:** REMEDIATED + SOURCE-RECONCILED / PASS CANDIDATE

A inspeção direta de `navigationServices/routing-client.js`, `mapboxDirectionsService.js` e do bootstrap visual V1 confirmou:

- routing primário via `POST /api/routing/directions` same-origin → ORS server-side;
- fallback Mapbox Directions somente em proxy indisponível, resposta inválida ou HTTP 404/405/501;
- perfil walking, GeoJSON full overview, steps e metric voice units;
- Mapbox visual primário com Leaflet como contingência;
- core de rota/guidance separado da capacidade visual do mapa.

`packages/navigation/src/routing.ts` e `packages/geospatial/src/adapters/routing-mapbox.ts` já materializavam o contrato de routing. A PR #60 mantém o mesmo Navigation core no provider visual degradado e reduz apenas capacidades de câmera não suportadas.

## Gate obrigatório

`.github/workflows/navigation-turn-by-turn-parity.yml` conduz a jornada:

```text
step 0 → step 1 → step 2 → approaching → arrived → auto-end
```

A promoção exige, no mesmo exact-head:

- Quality Gate;
- Navigation Turn-by-Turn Parity;
- Navigation Visual Baseline;
- Navigation Accessibility Baseline;
- Map Provider Regression;
- V1 Explore Locations Browser Regression;
- Map Tour Browser Regression;
- demais contracts acionados pela PR.

## Estado consolidado

Após a comparação direta do ZIP, não resta classe conhecida de source-exactness pendente:

```text
GAP-NAV-005   PASS CANDIDATE
GAP-NAV-006   PASS CANDIDATE
GAP-NAV-007   PASS CANDIDATE
GAP-NAV-008   PASS CANDIDATE
GAP-NAV-009   PASS CANDIDATE
GAP-NAV-010   PASS CANDIDATE / SOURCE-RECONCILED
GAP-NAV-011   PASS CANDIDATE / SOURCE-RECONCILED
GAP-NAV-012   PASS CANDIDATE / SOURCE-RECONCILED

RUNTIME GAP                  0
SOURCE-EXACTNESS PARTIAL     0
```

`PASS CANDIDATE` torna-se `PASS` quando o exact-head que contém esta reconciliação encerra todos os gates obrigatórios com sucesso. O exact-head e os run IDs finais são registrados na PR #60 e no issue #62 sem exigir alteração posterior deste arquivo.

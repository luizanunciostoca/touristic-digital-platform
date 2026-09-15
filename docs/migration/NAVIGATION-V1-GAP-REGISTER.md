# Navigation V1 Gap Register — MIG-0005 / FEATURE-0003

## Objetivo

Registrar de forma explícita e auditável a diferença entre o core de Navigation já comprovado e a jornada integral do ZIP V1 canônico. Este registro supersede a afirmação anterior de que não existia gap funcional conhecido.

## Fontes e estado

Baseline histórica:

- repositório: `luizidebook/morro-de-sao-paulo-digital`;
- commit usado pelos checkpoints anteriores: `60746fd7fed97b805758b37adfdbe3bad2582bfe`.

Snapshot ZIP auditado em 2026-09-15:

- `sourceCommit = 55acb639c1112a3c9a646dd103b01ad9cf5dd106`.

A relação entre esses snapshots não é assumida porque o repositório V1 antigo não está acessível pela conexão GitHub atual e o ZIP disponível na Library não pôde ser materializado como bytes nesta sessão.

Estado após a remediação funcional da PR #60:

```text
Navigation Core             equivalent
Geometry / Camera           equivalent
Product Journey             functionally remediated / source-exactness partial
MIG-0005 / FEATURE-0003     migrating / re-certification
```

## Checkpoints anteriores preservados

Os checkpoints abaixo continuam válidos para as responsabilidades que realmente provaram:

- NAV-15 — geometry baseline;
- NAV-16 — routing baseline;
- NAV-17 — session/concurrency baseline;
- NAV-18 — stale route result baseline;
- GAP-NAV-001 — arrival lifecycle core;
- GAP-NAV-002 — route recalculation core;
- GAP-NAV-003 — event/state snapshot;
- GAP-NAV-004 — visual/camera executable baseline.

Eles não são descartados. A correção é de **escopo de certificação**: esses checkpoints não provaram sozinhos toda a jornada `55ac...`.

## Gaps descobertos na auditoria 2026-09-15

### GAP-NAV-005 — Automatic maneuver progression

**Estado:** REMEDIATED / REQUIRED PR GATE PASS

Problema observado na `main` `9e36e3f84bdc7785dafb157931ad12617aa01e4f`:

- `stepIndex` existia;
- `setStepIndex()` existia;
- nenhum consumidor de produção avançava automaticamente a instrução conforme o GPS atravessava uma manobra.

Correção:

- threshold de avanço em aproximadamente 20 m;
- cálculo usa os endpoints geométricos dos steps quando disponíveis;
- avanço suporta GPS que ultrapassa o waypoint e pode consumir mais de um step obsoleto quando a geometria por step existe;
- o fallback sem `stepEnds` consome no máximo uma manobra por snapshot, impedindo que a mesma distância seja reutilizada para pular instruções subsequentes;
- snapshot antigo não é apresentado depois de o step avançar;
- teste unitário e browser contract percorrem `0 → 1 → 2`.

### GAP-NAV-006 — Turn-by-turn speech and arrival feedback

**Estado:** REMEDIATED / REQUIRED PR GATE PASS

Correção:

- TTS pertence ao runtime de Navigation, não à resposta conversacional do Assistant;
- cada nova manobra é falada uma única vez por sessão/step;
- aproximação, chegada e recálculo possuem mensagens faladas;
- PT/EN/ES/HE possuem locale explícito;
- chegada possui apresentação própria no banner;
- Assistant recebe feedback após `navigationEnded` por chegada/cancelamento sem duplicar o motor de Navigation.

### GAP-NAV-007 — Initial GPS acquisition parity

**Estado:** REMEDIATED / REQUIRED PR GATES PASS

Correção:

- reutiliza localização recente quando ela ainda é aceitável;
- quando aquisição é necessária, tenta até três vezes;
- timeouts por tentativa: 15 s, 20 s e 25 s;
- permission denied encerra imediatamente;
- precisão bootstrap permanece limitada a 1500 m;
- localização aceita passa a alimentar o cache recente.

### GAP-NAV-008 — Effective routing timeout

**Estado:** REMEDIATED / REQUIRED PR GATES PASS

Correção:

- o fluxo de Navigation fixa 15 s para route request e recalculation request;
- o default genérico do cliente continua independente.

### GAP-NAV-009 — Initial recalculation suppression

**Estado:** REMEDIATED / REQUIRED PR GATES PASS

Correção:

- 15 s na navegação normal;
- 120 s no fluxo `tutorial`;
- o contexto `tutorial` agora atravessa request port → DOM lifecycle → session bootstrap → composition;
- o core existente de `2 × accuracy + 30 m`, velocidade mínima, cooldown e retry/backoff permanece preservado.

### GAP-NAV-010 — Multilingual instruction processing

**Estado:** FUNCTIONALLY REMEDIATED / ZIP EXACTNESS PARTIAL

A PR #60 agora possui processamento sem perda semântica compartilhado por PT/EN/ES/HE em `@touristic/navigation`:

- remoção de markup de provider;
- decoding das entidades HTML comuns;
- normalização de espaços e pontuação;
- remoção de controles bidi espúrios preservando o texto hebraico;
- `guidance.original` continua preservando a instrução original para rastreabilidade;
- `guidance.instruction` recebe a forma processada usada por banner e TTS;
- testes explícitos cobrem PT/EN/ES/HE.

A **simplificação semântica exata** do ZIP `55ac...` não é inventada. Até os bytes do snapshot ficarem legíveis, este item permanece `PARTIAL` apenas quanto à exatidão textual histórica, não quanto à existência de processamento multilíngue seguro.

### GAP-NAV-011 — Contextual route suggestions

**Estado:** FUNCTIONALLY MATERIALIZED / ZIP POLICY CONSTANTS PARTIAL

A PR #60 materializa o subsistema no runtime de Navigation usando o catálogo canônico compartilhado `morroV1SearchCatalog` e cobre:

- GPS proximity;
- movement threshold;
- navigation warmup;
- category/sponsor priority;
- per-place cooldown;
- uma sugestão visível por ciclo;
- máximo por sessão;
- lifecycle start/stop por sessão;
- mensagem na área de Navigation;
- speech pelo mesmo runtime TTS;
- evento observável `navigationContextualSuggestion`;
- testes determinísticos de warmup, movimento, ranking, cooldown, limite de sessão, reset e PT/EN/ES/HE.

Como o ZIP canônico não pode ser materializado nesta sessão, os valores numéricos exatos e o ranking histórico não podem ser afirmados como idênticos. Por isso os defaults funcionais ficam centralizados em `NAVIGATION_SUGGESTION_FUNCTIONAL_POLICY`, atualmente:

```text
warmup                  30 s
movement threshold      20 m
proximity               80 m
per-place cooldown      10 min
session maximum         3
```

Esses números são **defaults funcionais de remediação, não constantes V1 certificadas**. A arquitetura permite substituí-los em um único ponto assim que o ZIP `55ac...` puder ser lido.

### GAP-NAV-012 — Degraded navigation without Mapbox

**Estado:** REMEDIATED FUNCTIONALLY / ZIP EXACTNESS PARTIAL

A `main` anterior destruía o Navigation runtime ao cair para Leaflet/development e só instalava guidance no provider Mapbox real.

A PR #60 altera o boundary para:

- destruir o runtime Mapbox anterior antes da troca;
- iniciar o mesmo runtime de Navigation no provider fallback;
- manter geometry, progress, instructions, TTS, arrival, contextual suggestions e lifecycle;
- degradar apenas a apresentação da câmera para center/zoom quando pitch/bearing não são suportados pelo provider.

A equivalência funcional passa a existir, mas o detalhe exato do comportamento do ZIP `55ac...` continua `PARTIAL` até comparação direta do snapshot.

## Gate obrigatório e checkpoint executável

`.github/workflows/navigation-turn-by-turn-parity.yml` é evidência obrigatória para qualquer nova promoção de MIG-0005. Ele conduz GPS simulado através de uma rota multi-step no runtime determinístico de Navigation e exige:

```text
step 0 → step 1 → step 2 → approaching → arrived → auto-end
```

O contrato é deliberadamente independente da disponibilidade externa do SDK Mapbox. A equivalência Mapbox/câmera continua coberta pelos gates de Provider/Visual; este gate prova especificamente a jornada turn-by-turn.

Também exige atualização do banner, eventos/status, fala de cada nova instrução, fala de aproximação/chegada e feedback final do Assistant.

No checkpoint funcional certificado em 2026-09-15 (`b98e7bfe5d9e262035701831bade7bb36787b2be`), o conjunto aplicável ficou verde: Quality Gate, Navigation Turn-by-Turn Parity, Navigation Visual Baseline, Navigation Accessibility Baseline, Map Provider Regression, V1 Explore Locations Browser Regression, Map Tour Browser Regression e o contrato V1 Assistant Single Message POI Markers. O log do gate P0 registrou `stepIndex` 0, 1 e 2, TTS das três instruções, aproximação, `phase: arrived`, progresso final 1, `navigationEnded(reason="arrived")` e feedback final do Assistant.

## Estado consolidado

Os antigos `GAP-NAV-001` a `GAP-NAV-004` continuam resolvidos no escopo original. Os novos gaps refletem a auditoria do snapshot ZIP canônico:

```text
REMEDIATED / REQUIRED GATES PASS   5  (005, 006, 007, 008, 009)
FUNCTIONAL / ZIP EXACTNESS PARTIAL 3  (010, 011, 012)
RUNTIME GAP                        0
```

`MIG-0005` não deve voltar a `equivalent` enquanto os itens source-dependent `010`, `011` e `012` não forem reconciliados contra o ZIP `55ac...` ou aceitos formalmente como diferenças documentadas. Qualquer head posterior deve preservar os gates obrigatórios verdes.

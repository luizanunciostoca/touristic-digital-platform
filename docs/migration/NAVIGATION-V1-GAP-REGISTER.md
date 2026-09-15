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

Estado durante a remediação PR #60:

```text
Navigation Core             equivalent
Geometry / Camera           equivalent
Product Journey             partial
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

**Estado:** REMEDIATED IN PR #60 / EXACT-HEAD GATE PENDING

Problema observado na `main` `9e36e3f84bdc7785dafb157931ad12617aa01e4f`:

- `stepIndex` existia;
- `setStepIndex()` existia;
- nenhum consumidor de produção avançava automaticamente a instrução conforme o GPS atravessava uma manobra.

Correção:

- threshold de avanço em aproximadamente 20 m;
- cálculo usa os endpoints geométricos dos steps quando disponíveis;
- avanço suporta GPS que ultrapassa o waypoint e pode consumir mais de um step obsoleto;
- snapshot antigo não é apresentado depois de o step avançar;
- novo teste unitário e browser contract percorrem `0 → 1 → 2`.

### GAP-NAV-006 — Turn-by-turn speech and arrival feedback

**Estado:** REMEDIATED IN PR #60 / EXACT-HEAD GATE PENDING

Correção:

- TTS pertence ao runtime de Navigation, não à resposta conversacional do Assistant;
- cada nova manobra é falada uma única vez por sessão/step;
- aproximação, chegada e recálculo possuem mensagens faladas;
- PT/EN/ES/HE possuem locale explícito;
- chegada possui apresentação própria no banner;
- Assistant recebe feedback após `navigationEnded` por chegada/cancelamento sem duplicar o motor de Navigation.

### GAP-NAV-007 — Initial GPS acquisition parity

**Estado:** REMEDIATED IN PR #60 / EXACT-HEAD GATE PENDING

Correção:

- reutiliza localização recente quando ela ainda é aceitável;
- quando aquisição é necessária, tenta até três vezes;
- timeouts por tentativa: 15 s, 20 s e 25 s;
- permission denied encerra imediatamente;
- precisão bootstrap permanece limitada a 1500 m;
- localização aceita passa a alimentar o cache recente.

### GAP-NAV-008 — Effective routing timeout

**Estado:** REMEDIATED IN PR #60 / EXACT-HEAD GATE PENDING

Correção:

- o fluxo de Navigation fixa 15 s para route request e recalculation request;
- o default genérico do cliente continua independente.

### GAP-NAV-009 — Initial recalculation suppression

**Estado:** REMEDIATED IN PR #60 / EXACT-HEAD GATE PENDING

Correção:

- 15 s na navegação normal;
- 120 s no fluxo `tutorial`;
- o contexto `tutorial` agora atravessa request port → DOM lifecycle → session bootstrap → composition;
- o core existente de `2 × accuracy + 30 m`, velocidade mínima, cooldown e retry/backoff permanece preservado.

### GAP-NAV-010 — Multilingual instruction processing

**Estado:** PARTIAL

A PR #60 amplia a apresentação/reconhecimento direcional para PT/EN/ES/HE e o TTS usa locale explícito. Ainda falta prova direta de que a **simplificação textual** aplicada às instruções é idêntica ao ZIP `55ac...`.

Não serão inventadas transformações sem fonte canônica verificável.

### GAP-NAV-011 — Contextual route suggestions

**Estado:** GAP / SOURCE-DEPENDENT

A documentação V2 já reconhece que Navigation é responsável durante a rota por:

- GPS proximity;
- movement threshold;
- navigation warmup;
- category/sponsor priority;
- per-place cooldown;
- uma sugestão visível por ciclo;
- máximo por sessão;
- message lifecycle;
- speech.

A implementação de produção equivalente não foi encontrada na `main` auditada.

O ZIP canônico está listado na Library, mas seus bytes não puderam ser materializados nesta sessão. Portanto os thresholds/constantes e regras de ranking exatas ainda não podem ser reproduzidos com integridade. Este gap permanece aberto em vez de receber valores inventados.

### GAP-NAV-012 — Degraded navigation without Mapbox

**Estado:** REMEDIATED FUNCTIONALLY / ZIP EXACTNESS PARTIAL

A `main` anterior destruía o Navigation runtime ao cair para Leaflet/development e só instalava guidance no provider Mapbox real.

A PR #60 altera o boundary para:

- destruir o runtime Mapbox anterior antes da troca;
- iniciar o mesmo runtime de Navigation no provider fallback;
- manter geometry, progress, instructions, TTS, arrival e lifecycle;
- degradar apenas a apresentação da câmera para center/zoom quando pitch/bearing não são suportados pelo provider.

A equivalência funcional passa a existir, mas o detalhe exato do comportamento do ZIP `55ac...` continua `PARTIAL` até comparação direta do snapshot.

## Novo gate obrigatório

`.github/workflows/navigation-turn-by-turn-parity.yml` passa a ser evidência obrigatória para qualquer nova promoção de MIG-0005. Ele conduz GPS real simulado através de uma rota multi-step e exige:

```text
step 0 → step 1 → step 2 → approaching → arrived → auto-end
```

Também exige atualização do banner, eventos/status, fala de cada nova instrução, fala de aproximação/chegada e feedback final do Assistant.

## Estado consolidado

Os antigos `GAP-NAV-001` a `GAP-NAV-004` continuam resolvidos no escopo original. Os novos gaps refletem a auditoria do snapshot ZIP canônico:

```text
REMEDIATED / GATE PENDING  5  (005, 006, 007, 008, 009)
PARTIAL                    2  (010, 012)
GAP                        1  (011)
```

`MIG-0005` não deve voltar a `equivalent` enquanto o exact-head desta remediação não estiver verde e os itens source-dependent não forem reconciliados contra o ZIP `55ac...`.

# Navigation MIG-0005 — Matriz de Equivalência Executável

## Objetivo

Consolidar a evidência de paridade de `MIG-0005 / FEATURE-0003` sem confundir a matriz histórica de 24 cenários com certificação integral da jornada de navegação do ZIP canônico.

## Fontes V1 conhecidas

Baseline histórica usada pela migração anterior:

```text
luizidebook/morro-de-sao-paulo-digital
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

Snapshot do ZIP canônico auditado em 2026-09-15:

```text
sourceCommit = 55acb639c1112a3c9a646dd103b01ad9cf5dd106
```

Esses hashes são diferentes. A conexão GitHub atual não expõe o repositório V1 antigo e o ZIP listado na Library não possui, nesta sessão, um caminho de materialização de bytes autorizado. Portanto a relação de ancestralidade entre `60746...` e `55ac...` não é assumida.

## Regra de certificação revisada

Os 24 cenários históricos continuam válidos como evidência dos contratos que realmente cobrem. Eles **não** bastam, isoladamente, para declarar equivalência integral ao ZIP `55ac...`, porque não percorriam uma rota completa com transição automática de manobras nem comprovavam todas as responsabilidades da jornada de produto.

Estados usados abaixo:

- `PASS`: implementação e prova executável aplicável existem;
- `PARTIAL`: o core está materializado, mas a equivalência integral ao ZIP ainda depende de prova adicional;
- `GAP`: responsabilidade V1 reconhecida sem implementação/prova suficiente.

## Matriz histórica de 24 cenários

|   # | Cenário histórico                        | Estado revisado | Evidência / observação                                                                                                       |
| --: | ---------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
|   1 | iniciar navegação com localização válida | PASS            | bootstrap e browser journey                                                                                                  |
|   2 | permissão de localização negada          | PASS            | geolocation denial + cleanup                                                                                                 |
|   3 | localização imprecisa                    | PASS            | 1500 m bootstrap / 300 m guidance                                                                                            |
|   4 | coordenadas inválidas                    | PASS            | rejeição pré-rede                                                                                                            |
|   5 | routing proxy success                    | PASS            | same-origin routing                                                                                                          |
|   6 | routing proxy timeout                    | PASS            | fluxo de navegação fixa 15 s                                                                                                 |
|   7 | routing proxy unavailable                | PASS            | erro primário distinguível                                                                                                   |
|   8 | fallback elegível                        | PASS            | same-origin + provider fallback                                                                                              |
|   9 | cancelamento durante request             | PASS            | AbortSignal da sessão                                                                                                        |
|  10 | sessão A substituída por B               | PASS            | supersession monotônica                                                                                                      |
|  11 | callback tardio da sessão A              | PASS            | stale protection                                                                                                             |
|  12 | progresso ao longo da rota               | PASS            | geometry/runtime                                                                                                             |
|  13 | ruído GPS / pequeno retorno              | PASS            | backward guard                                                                                                               |
|  14 | bearing                                  | PASS            | tangente + smoothing                                                                                                         |
|  15 | aproximação de manobra / zoom            | PASS            | câmera/histerese                                                                                                             |
|  16 | polling sem movimento                    | PASS            | sem easeTo redundante                                                                                                        |
|  17 | minimizar/maximizar banner               | PASS            | baseline visual                                                                                                              |
|  18 | cancelamento manual                      | PASS            | Encerrar + teardown                                                                                                          |
|  19 | chegada ao destino                       | PASS            | 100 m / 30 m / auto-end 5 s + UI/voz nesta remediação                                                                        |
|  20 | cleanup após navigationEnded             | PASS            | teardown idempotente                                                                                                         |
|  21 | mapa/provider degradado                  | PARTIAL         | mesmo Navigation runtime opera em Leaflet/development; equivalência exata ao ZIP `55ac...` ainda requer inspeção do snapshot |
|  22 | alto contraste                           | PASS            | accessibility baseline                                                                                                       |
|  23 | texto ampliado                           | PASS            | accessibility baseline                                                                                                       |
|  24 | mobile/tablet/desktop                    | PASS            | visual/accessibility baseline                                                                                                |

Resultado desta matriz histórica após a reconciliação de fonte:

```text
PASS     23
PARTIAL   1
GAP       0
TOTAL    24
```

## Obrigações de jornada V1 que a matriz histórica não provava

| ID        | Obrigação de jornada                        | Estado na remediação PR #60               | Evidência nova                                                                                                                                               |
| --------- | ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NAV-PJ-01 | avanço automático `step 0 → 1 → 2`          | PASS no código; exact-head gate pendente  | threshold ~20 m no composition + teste unitário + workflow `Navigation Turn-by-Turn Parity`                                                                  |
| NAV-PJ-02 | voz por nova manobra                        | PASS no código; exact-head gate pendente  | `navigation-speech.ts` + journey browser com speech capturado                                                                                                |
| NAV-PJ-03 | GPS inicial com até 3 tentativas            | PASS no código; exact-head gate pendente  | 15 s / 20 s / 25 s + teste unitário                                                                                                                          |
| NAV-PJ-04 | reutilizar localização recente              | PASS no código; exact-head gate pendente  | cache de localização recente + teste unitário                                                                                                                |
| NAV-PJ-05 | timeout efetivo de rota em 15 s             | PASS no código; exact-head gate pendente  | bootstrap fixa `NAVIGATION_ROUTE_TIMEOUT_MS = 15000`                                                                                                         |
| NAV-PJ-06 | supressão inicial de recálculo              | PASS no código; exact-head gate pendente  | 15 s normal / 120 s tutorial + propagação do contexto tutorial                                                                                               |
| NAV-PJ-07 | aviso de aproximação e chegada              | PASS no código; exact-head gate pendente  | banner + TTS PT/EN/ES/HE + auto-end                                                                                                                          |
| NAV-PJ-08 | feedback do Assistant após término          | PASS no código; exact-head gate pendente  | `assistant-navigation-feedback.ts`                                                                                                                           |
| NAV-PJ-09 | processamento multilíngue de apresentação   | FUNCTIONAL / ZIP exactness PARTIAL        | processor no `@touristic/navigation`: markup/entities/whitespace/punctuation/bidi + testes PT/EN/ES/HE; simplificador semântico exato do ZIP não é presumido |
| NAV-PJ-10 | sugestões contextuais durante rota          | FUNCTIONAL / ZIP policy constants PARTIAL | catálogo canônico + proximity/movement/warmup/ranking/cooldown/session max/message lifecycle/TTS + testes determinísticos                                    |
| NAV-PJ-11 | navegação quando Mapbox não está disponível | FUNCTIONAL / ZIP exactness PARTIAL        | mesmo core opera em fallback com câmera degradada; comportamento exato do ZIP ainda requer comparação direta                                                 |

Não existe mais `runtime GAP` conhecido dentro dessas obrigações. Os três `PARTIAL` restantes são deliberadamente **source-exactness**: a implementação está materializada, mas o snapshot `55ac...` indisponível impede afirmar que constantes/texto/fallback histórico são byte/behavior-exact.

## Novo browser contract obrigatório

A PR #60 adiciona `.github/workflows/navigation-turn-by-turn-parity.yml`. O contrato move a geolocalização por uma rota com três manobras no runtime determinístico de Navigation e exige, nesta ordem:

```text
step 0
→ cruzar threshold da primeira manobra
step 1
→ cruzar threshold da segunda manobra
step 2
→ approaching
→ arrived
→ auto-end
```

O gate é independente da disponibilidade externa do SDK Mapbox. Mapbox/câmera continuam cobertos pelos contratos Provider/Visual; este gate prova especificamente a jornada turn-by-turn e o comportamento degradado do mesmo Navigation core.

Também valida banner, status observável, TTS de cada manobra, mensagem de aproximação, chegada e feedback final do Assistant.

A equivalência de jornada não pode voltar a ser promovida sem esse gate verde no exact-head considerado.

## Decisão atual de MIG-0005

Estado tecnicamente defensável durante a remediação:

```text
Navigation Core                 EQUIVALENT
Navigation Geometry/Camera      EQUIVALENT
Navigation Product Journey      FUNCTIONALLY REMEDIATED / SOURCE-EXACTNESS PARTIAL
MIG-0005 / FEATURE-0003         MIGRATING (re-certification)
```

A antiga conclusão `PASS 24 / PARTIAL 0 / GAP 0 = equivalent` fica superseded como certificação integral ao ZIP `55ac...`.

Promoção de volta para `equivalent` exige simultaneamente:

1. Quality Gate verde no exact-head;
2. Navigation Visual/Accessibility regressions aplicáveis verdes;
3. `Navigation Turn-by-Turn Parity` verde no exact-head;
4. comparação direta dos itens source-dependent `NAV-PJ-09`, `NAV-PJ-10` e `NAV-PJ-11` contra o ZIP canônico, ou decisão formal que aceite explicitamente a diferença;
5. reconciliação do Gap Register, Feature Registry e Master Migration Tracker no mesmo checkpoint documental.

`equivalent` continua distinto de `released`.

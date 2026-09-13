# Navigation V1 Gap Register — MIG-0005 / FEATURE-0003

## Objetivo

Registrar, de forma explícita e auditável, os comportamentos da navegação V1 e sua equivalência materializada na V2. Este documento complementa `NAVIGATION-V1-BASELINE.md` e deve permanecer consistente com `NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md` e `NAVIGATION-MIG-0005-INTEGRATION-GATE.md`.

## Fonte congelada

- Repositório V1: `luizidebook/morro-de-sao-paulo-digital`
- Commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- Feature: `FEATURE-0003`
- Migration item: `MIG-0005`
- Estado atual: `equivalent`

## Evidências executáveis concluídas

### NAV-15 — geometry baseline

- PR #37
- head `5e0b41228065c689ab59a966989d16204aa7a314`
- Quality Gate #470: success
- cobre métricas derivadas, summary oficial, distância até manobra, bearing local, jitter e formatação V1.

### NAV-16 — routing baseline

- PR #38
- head `fe102ac929dec2c9e3eb0a6f36196052ab9b5d91`
- Quality Gate #474: success
- cobre normalização, proxy same-origin, ausência de credenciais, fallback elegível, não mascarar 503 e rejeição pré-rede.

### NAV-17 — session/concurrency baseline

- PR #39
- head `76efb9e4d954eaf570d46663fe6191d15b3ba9af`
- Quality Gate #475: success
- cobre supersession, abort, timers stale, intervals/cleanup, wait cancelável e erro tipado de sessão obsoleta.

### NAV-18 — stale route result baseline

- PR #40
- head `dfd0ebd50c042085874fd7777979d4764aefc24c`
- Quality Gate #476: success
- cobre resposta de rota obsoleta após novo start e após stop, impedindo criação/ativação de wiring stale.

### GAP-NAV-001 — Arrival lifecycle

**Estado:** RESOLVED / MATERIALIZED IN V2

- PR #43
- merge `8be41e85b0ae9f02526af7a08496b8d429c9a14b`
- exact-head aceito `2fc5ee91ecd657b82d1e52618525eb72c8bfb684`
- Quality Gate #518: success
- Navigation Visual Baseline #288: success
- Navigation Accessibility Baseline #234: success
- cobre sessão ativa, destino vinculado à sessão, fase observável `arrived`, idempotência herdada do lifecycle canônico e supressão explícita de callback stale após stop.

### GAP-NAV-002 — Route recalculation lifecycle

**Estado:** RESOLVED / MATERIALIZED IN V2

- PR #44
- merge `ed0f93a18d9137dedd444f85e49752a467ef8e47`
- exact-head aceito `87fbe2ee201c8c66923d9275b5bad01d8b7d1e0d`
- Quality Gate #534: success
- Navigation Visual Baseline #304: success
- Navigation Accessibility Baseline #250: success
- Business Onboarding Profile Browser Contract #340: success
- Business Onboarding Adapter Browser Contract #340: success
- Business Onboarding Route Browser Contract #340: success
- cobre request com `AbortSignal` da sessão, política 3 tentativas/2s/4s, supressão de rota stale, abort no stop e cancelamento de backoff sem nova tentativa.

### GAP-NAV-003 — Event/state snapshot

**Estado:** RESOLVED / MATERIALIZED IN V2

- PR #45
- merge `73b0d828c888d16b03b3e405d1b97a2cdf20e49a`
- exact-head aceito `d3b535530745968d9b6e2cb0911053d7a81faa4f`
- Quality Gate: success
- Navigation Visual Baseline: success
- Navigation Accessibility Baseline: success
- congela as sequências `navigationStarted -> active`, `navigationEnded(cancelled) -> ended`, `navigationEnded(arrived) -> arrived` e falha de bootstrap -> `failed`;
- protege contra publicação de `failed` stale após `stop()`/supersession.

### GAP-NAV-004 — Visual/camera executable baseline

**Estado:** RESOLVED / EXECUTABLE BASELINE MATERIALIZED

Evidência executável consolidada:

- `Navigation Visual Baseline` valida banner/instruction UI, botão Encerrar, progresso, distância, tempo, first-person camera, camera motion/easing, ownership de sessão, estados dinâmicos, minimize/expand e teardown em mobile/tablet/desktop;
- `Navigation Accessibility Baseline` valida `forced-colors: active` e texto a 200% em mobile/tablet/desktop;
- `NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md` registra 24/24 cenários obrigatórios em `PASS`;
- PR #42 restaura o contrato V1 de perspectiva 3D sem segunda instância de mapa e sincroniza a câmera global com o estado 3D;
- PR #42 exact-head aceito `c8704e5468d59263972be3919184bfb592ee3439`;
- merge da PR #42: `5b5b438b31922da05751f7d4c42e50e23f615d34`;
- Quality Gate #544: success;
- Mapbox Visual Contract Regression #367: success;
- Navigation Visual Baseline #314: success;
- Navigation Accessibility Baseline #260: success;
- V1 Home Parity Browser Regression #34: success;
- V1 Explore Locations Browser Regression #25: success;
- Home First Run Browser Regression #76: success.

## Estado consolidado de MIG-0005

Todos os gaps `GAP-NAV-001` a `GAP-NAV-004` estão resolvidos/materializados e a matriz executável oficial registra:

```text
PASS     24
PARTIAL   0
GAP       0
TOTAL    24
```

Assim, `MIG-0005` está em estado `equivalent`, em conformidade com `NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md` e `NAVIGATION-MIG-0005-INTEGRATION-GATE.md`.

`equivalent` não significa `released`: qualquer rollout, promoção para produção ou Release Promotion Gate permanece separado e exige autorização e evidência próprias.

## Decisão atual

A paridade de navegação V1 → V2 não possui gap funcional conhecido no registro canônico. Novas divergências reais devem ser registradas como novos gaps com evidência reproduzível, sem reabrir checkpoints aceitos por memória ou suposição.

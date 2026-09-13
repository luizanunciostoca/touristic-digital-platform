# Navigation V1 Gap Register — MIG-0005 / FEATURE-0003

## Objetivo

Registrar, de forma explícita e auditável, os comportamentos da navegação V1 que ainda não possuem equivalência materializada na V2. Este documento complementa `NAVIGATION-V1-BASELINE.md` e impede que evidências parciais sejam confundidas com conclusão da migração.

## Fonte congelada

- Repositório V1: `luizidebook/morro-de-sao-paulo-digital`
- Commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- Feature: `FEATURE-0003`
- Migration item: `MIG-0005`
- Estado permitido enquanto houver blocker crítico abaixo: `mapped`

## Evidências executáveis já concluídas

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

## Estado dos gaps funcionais

### GAP-NAV-003 — Event/state snapshot

**Estado:** MATERIALIZED IN CANDIDATE — pending exact-head acceptance before merge

A auditoria identificou um gap funcional real: a V2 já publicava início/estado ativo, encerramento e chegada, mas uma falha de bootstrap não produzia o estado observável `failed` exigido pelo contrato de snapshot.

O candidate `fix/v1-navigation-event-state-snapshot-20260913` materializa e congela:

- `navigationStarted` seguido de `navigationStatusChanged(active)`;
- `navigationEnded(cancelled)` seguido de `navigationStatusChanged(ended)`;
- `navigationEnded(arrived)` seguido de `navigationStatusChanged(arrived)`;
- falha de bootstrap publicada como `navigationStatusChanged(failed)`, sem ativar sessão, rota ou UI;
- session id presente somente enquanto a navegação está ativa e removido nos estados terminais.

Evidência executável:

- `apps/morro-digital-platform/src/navigation/navigation-event-state-snapshot.test.ts`;
- `apps/morro-digital-platform/src/navigation/navigation-dom-lifecycle.ts` publica agora o snapshot `failed` apenas quando a geração de start ainda é a geração corrente, preservando a proteção contra callback stale/superseded.

**Critério de saída:** Quality Gate e baselines aplicáveis verdes no exact-head final, seguido de merge.

## Blockers de baseline ainda abertos

### GAP-NAV-004 — Visual/camera executable baseline

Ainda falta captura executável V1 × V2 para:

- banner/instruction UI;
- botão Encerrar;
- progresso, distância e tempo;
- first-person camera;
- ownership da câmera;
- estados dinâmicos durante deslocamento;
- matriz mobile/tablet/desktop;
- acessibilidade/forced-colors/text enlargement quando aplicável.

## Regra de promoção

`MIG-0005` deve permanecer `mapped` enquanto qualquer item `GAP-NAV-001` a `GAP-NAV-004` estiver aberto ou pendente de acceptance.

A promoção para `snapshotted` exige, no mínimo:

1. contratos comportamentais V1 executáveis para os fluxos críticos;
2. arrival e recalculation materializados ou formalmente substituídos por decisão arquitetural aprovada e equivalente;
3. sequência de eventos/state congelada;
4. baseline visual/câmera executável com matriz responsiva;
5. Quality Gate completo no mesmo head final;
6. ausência de workflows temporários no head final.

## Decisão atual

Arrival e recalculation estão materializados e integrados. O GAP-NAV-003 está materializado em candidate e aguarda acceptance do exact-head. O GAP-NAV-004 permanece aberto; portanto `MIG-0005` continua obrigatoriamente em `mapped`.

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

## Estado dos gaps funcionais

### GAP-NAV-002 — Route recalculation lifecycle

**Estado:** RESOLVED / MATERIALIZED IN V2 — pending exact-head acceptance of PR #44 before merge

A implementação V2 já materializa o contrato V1 em `packages/navigation/src/recalculation.ts` e no bootstrap browser:

- recálculo carrega o session id ativo;
- request recebe o `AbortSignal` da sessão;
- política explícita: até 3 tentativas, com esperas canceláveis de 2s e 4s;
- apenas a sessão ainda ativa pode publicar a nova rota;
- supersession invalida resposta tardia;
- stop aborta request em andamento e cancela o backoff antes de nova tentativa.

Evidência proposta na PR #44:

- teste determinístico de supersession já existente continua cobrindo resposta stale;
- teste determinístico de stop comprova abort do request pelo signal da sessão e ausência de publicação stale;
- teste determinístico de stop durante backoff comprova que nenhuma tentativa adicional é iniciada.

Fonte de contrato V1:

- `js/navigation/navigationController/navigationController.js`
- `js/navigation/navigationState/__tests__/navigation-session-contract.test.js`

**Critério de saída:** satisfeito funcionalmente; fechamento canônico condicionado aos gates oficiais verdes no exact-head final da PR #44 e ao merge dessa PR.

## Blockers de baseline ainda abertos

### GAP-NAV-003 — Event/state snapshot

Ainda falta congelar e comparar a sequência observável dos eventos/estados principais, incluindo pelo menos início, navegação ativa, encerramento, erro e chegada.

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

Arrival está materializado e integrado. Recalculation está materializado no runtime e a PR #44 adiciona a última evidência determinística de stop necessária para fechamento do GAP-NAV-002. `GAP-NAV-003` e `GAP-NAV-004` permanecem abertos; portanto `MIG-0005` continua obrigatoriamente em `mapped`.

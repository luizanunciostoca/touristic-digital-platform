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

## Blockers funcionais ainda abertos

### GAP-NAV-001 — Arrival lifecycle

**Estado:** BLOCKED / NOT MATERIALIZED IN V2

A V1 possui contrato explícito de chegada no `navigationController.js`:

- chegada só pode ser processada por sessão ativa;
- o destino precisa ser resolvido antes da transição de fase;
- a fase muda para `arrived` somente depois da validação;
- a notificação/avanço associado não pode acontecer duas vezes;
- callbacks tardios de uma sessão encerrada não podem sinalizar chegada.

Fonte de contrato:

- `js/navigation/navigationController/navigationController.js`
- `js/navigation/navigationState/__tests__/navigation-session-contract.test.js`
- test blob `4df4fd6fe7924198a0139e3ba44e62540fa8e167`

**Critério de saída:** implementar um lifecycle de chegada V2 com sessão ativa, idempotência, evento/estado observável e testes de sessão stale.

### GAP-NAV-002 — Route recalculation lifecycle

**Estado:** BLOCKED / NOT MATERIALIZED IN V2

A V1 possui recálculo vinculado à sessão atual:

- recálculo carrega o session id ativo;
- request recebe o `AbortSignal` da sessão;
- retries/esperas são canceláveis pela sessão;
- apenas o recálculo ainda pertencente à sessão ativa pode publicar resultado;
- supersession ou stop invalidam o recálculo anterior.

Fonte de contrato:

- `js/navigation/navigationController/navigationController.js`
- `js/navigation/navigationState/__tests__/navigation-session-contract.test.js`

**Critério de saída:** materializar recálculo V2 com request cancelável, política de retry explícita, proteção stale e testes determinísticos de supersession/stop.

## Blockers de baseline ainda abertos

### GAP-NAV-003 — Event/state snapshot

Ainda falta congelar e comparar a sequência observável dos eventos/estados principais, incluindo pelo menos início, navegação ativa, encerramento, erro e chegada quando GAP-NAV-001 for resolvido.

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

`MIG-0005` deve permanecer `mapped` enquanto qualquer item `GAP-NAV-001` a `GAP-NAV-004` estiver aberto.

A promoção para `snapshotted` exige, no mínimo:

1. contratos comportamentais V1 executáveis para os fluxos críticos;
2. arrival e recalculation materializados ou formalmente substituídos por decisão arquitetural aprovada e equivalente;
3. sequência de eventos/state congelada;
4. baseline visual/câmera executável com matriz responsiva;
5. Quality Gate completo no mesmo head final;
6. ausência de workflows temporários no head final.

## Decisão atual

A migração já possui evidência forte de equivalência em geometry, routing, sessão e proteção contra resultados stale, mas isso ainda é **evidência parcial**. Não existe base técnica para promover `MIG-0005` acima de `mapped` neste momento.

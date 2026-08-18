# Morro Digital V2 — Final Pre-CI Report

**Branch:** `feat/affiliates-m154-persistence`  
**Final local/remote head:** `19c4cb6b1c58a2e84c9d8bb4f2c30cf61dd23fe8`  
**Base:** `main` at `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`  
**Pull Request:** [#290](https://github.com/luizidebook/touristic-digital-platform/pull/290)  
**Local state:** clean and published; branch is 9 commits ahead of `origin/main`.

## Executive result

O repositório foi deixado no estado **READY_FOR_CI / PRE-CI OPERATIONAL READINESS**. O trabalho técnico, documental e de validação que podia ser executado no sandbox foi concluído com commits incrementais e publicado no PR #290. O PR está `OPEN`, `MERGEABLE` e `CLEAN`, mas não foi feito bypass de CI nem merge forçado, porque os checks externos ainda não produziram evidência e a branch protection está bloqueada pela conta do GitHub.

> Este relatório não declara `equivalent`, `released`, production-ready ou GO. Esses estados continuam condicionados ao head final pós-merge, GitHub Actions, staging, MySQL, providers, observabilidade e rollback drill.

## Trabalho implementado

| Área                       | Resultado                                                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affiliates domain          | Foundation `AFFILIATE-POLICY-V1` incorporada e formatada; `FEATURE-0010` permanece `migrating`, sem equivalência visual/API alegada.                                                                                                     |
| Affiliates persistence     | Schema MySQL aditivo para accounts, memberships, referral evidence, attribution, conversions, entitlement revisions, idempotency claims, audit events, materialization requests e outbox.                                                |
| Affiliates application     | Mutation transacional de referral/attribution com lock de Order, idempotência exata, auditoria e outbox no mesmo commit; repositories para account/membership/evidence/attribution/conversion/entitlement/materialization.               |
| Affiliates adapters/API    | Adapters provider-neutral para Ordering/Financial evidence, authorization/eligibility e materialization; API autenticada, destination-scoped, correlation-aware e bloqueadora de amount/currency/payout/provider credentials no browser. |
| Payments observability     | Helper Financial sobre `Platform Observation v1` com nomes canônicos para checkout, webhook, verified outcome, refund, reconciliation, provider degradation/recovery e rate limiting.                                                    |
| Payments topology          | Guard do rate limiter de checkout que falha fechado quando há mais de uma réplica sem store distribuído.                                                                                                                                 |
| Environment reconciliation | `pnpm environment:check`, inventário em `.env.example`, `PAYMENTS_RUNTIME_REPLICA_COUNT` e flag explícita de store distribuído.                                                                                                          |
| Governance/documentation   | Feature Registry, Master Migration Tracker, Affiliates matrix, M154 evidence, pre-CI readiness, rollback docs e evidence index reconciliados.                                                                                            |

## Local evidence

| Gate                                 | Result                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `pnpm format:check`                  | PASS                                                                        |
| `pnpm architecture:check`            | PASS; 22 workspaces / canonical contracts valid                             |
| `pnpm features:check`                | PASS; 11 features                                                           |
| `pnpm environment:check`             | PASS; 38 documented keys; Payments replicas=1; distributed rate-limit=false |
| `pnpm lint`                          | PASS                                                                        |
| `pnpm typecheck`                     | PASS                                                                        |
| `pnpm test`                          | PASS                                                                        |
| `pnpm build`                         | PASS; 22 workspaces                                                         |
| `pnpm check`                         | PASS                                                                        |
| Browser/Auth/Payments targeted tests | 35 tests passed                                                             |
| Financial server                     | 74 passed; 10 MySQL tests skipped                                           |
| Ordering server                      | 34 passed; 7 MySQL tests skipped                                            |
| Ticketing server                     | 18 passed; 13 MySQL tests skipped                                           |
| Affiliates domain                    | 8 passed                                                                    |
| Affiliates server                    | 3 HTTP security tests passed; 1 MySQL integration test skipped              |
| `git diff --check`                   | PASS                                                                        |

## External blockers

Docker is not installed in the sandbox and no MySQL server is listening on `127.0.0.1:3306`. Therefore migration and persistence integration suites were not falsely marked as passed; they remain skipped with the prerequisite documented. Provider sandbox endpoint/token/webhook secret, staging database credentials, routed observation sink, dashboards/alerts, backup target and release identity are also not configured.

The GitHub PR is healthy enough for CI: `OPEN`, `MERGEABLE`, `CLEAN`, head `19c4cb6b`, base `ec4f51e0`. No checks were available at the time of final inspection. GitHub branch-protection API returned HTTP 403 stating that the private repository requires GitHub Pro or public visibility for this feature; protection was not fabricated or bypassed.

## Commits in the published branch

| Commit     | Scope                                                   |
| ---------- | ------------------------------------------------------- |
| `8b8baada` | Affiliates policy/domain foundation                     |
| `1c84ec13` | Durable persistence and transactional attribution       |
| `187973e2` | Account and program membership repositories             |
| `af44c092` | Adapters, materialization and authenticated API         |
| `12b451d0` | Affiliates evidence and migration documentation         |
| `dfced91c` | Payments observation contract and topology-safe limiter |
| `36e6e602` | Environment and rollback readiness checks               |
| `1a7493c1` | Foundation formatting normalization                     |
| `19c4cb6b` | Registry, tracker and evidence index reconciliation     |

## Required post-CI gates

The next operator/CI sequence is to run required Actions on PR #290, configure branch protection when the repository/account supports it, provision staging-only secrets and separate database users, execute MySQL migrations against a disposable staging database, run provider sandbox checkout/webhook/refund/reconciliation, route and alert on Platform Observations, execute Ticketing and Payments browser E2E, perform backup/restore and rollback drills, then reassess the exact post-merge SHA. Only after all gates pass may the project be considered for `equivalent` or release promotion.

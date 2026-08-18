# Morro Digital V2 — Pré-CI Operational Readiness

## Scope

This document records the maximum operational readiness that can be established from the repository sandbox without GitHub Actions, a configured staging environment, provider credentials, or a running MySQL instance. It is a **pre-CI readiness record**, not a production release approval.

## Local executable checks

| Area                                  | Command                                                  | Result in this run                             |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Workspace formatting                  | `pnpm format:check`                                      | PASS                                           |
| Architecture and canonical contracts  | `pnpm architecture:check`                                | PASS                                           |
| Feature Registry                      | `pnpm features:check`                                    | PASS                                           |
| Environment inventory                 | `pnpm environment:check`                                 | PASS after M154/M153 additions                 |
| Full lint/typecheck/test/build        | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | PASS; 22 workspaces                            |
| Browser/Auth/Payments local contracts | targeted Vitest suites                                   | PASS; 35 tests                                 |
| Ticketing service                     | `pnpm --filter @touristic/ticketing-server test`         | 18 passed; 13 MySQL tests skipped              |
| Financial service                     | `pnpm --filter @touristic/financial-server test`         | 74 passed; 10 MySQL tests skipped              |
| Affiliates service                    | `pnpm --filter @touristic/affiliates-server test`        | 3 HTTP tests passed; MySQL integration skipped |

## Staging and provider reconciliation

Staging activation remains blocked until the operator supplies distinct server-side credentials and confirms the destination, exact HTTPS return origins, webhook target, sandbox provider base URL, provider bearer token, webhook secret, Financial and Ordering database URLs, Affiliates database URL, and the production release identity. No credential was fabricated or copied into the repository.

The repository now contains a fail-closed environment inventory check. It verifies that required keys are documented and rejects a multi-replica Payments topology unless a distributed atomic rate-limit store is explicitly configured. It does not claim that the configured values are reachable or that provider credentials work.

## Observability and alerts

Payments observations use `Platform Observation v1` and expose canonical names for checkout creation, webhook receipt, verified outcome, refund request/completion, reconciliation completion, provider degradation/recovery and rate limiting. An injected sink is required for delivery. The repository proves event construction and primitive attributes locally; alert routing, retention, dashboards and on-call delivery still require staging infrastructure.

## Provider sandbox drill

The provider-neutral Financial contracts and sandbox provider unit tests pass locally. A live sandbox drill is not claimed because no provider endpoint, bearer token or webhook signing secret is configured. The safe sequence for staging is: configure the sandbox provider, issue a checkout with a fresh idempotency key, deliver the signed webhook, wait for verified outcome, verify ledger/accounting, exercise refund/reconciliation, and capture observation IDs and correlation IDs.

## Backup and rollback drill

No destructive migration or financial-history deletion is authorized. The Affiliates schema is additive. The rollback procedure is therefore: stop the Affiliates outbox consumer, disable the HTTP composition, keep the tables and append-only audit/outbox history, and revert the application commit through the normal release mechanism. A real backup/restore and rollback drill requires a reachable staging database and operator-owned backup target; neither is available in this sandbox, so it remains a mandatory external gate.

## Release boundary

The repository may be described as **READY_FOR_CI / PRE-CI OPERATIONAL READYNESS** after the final local checks and documentation reconciliation. It must not be described as `equivalent`, `released`, production-ready, or GO until GitHub Actions, staging integrations, MySQL migrations, provider sandbox, observability routing and rollback evidence pass on the exact final head.

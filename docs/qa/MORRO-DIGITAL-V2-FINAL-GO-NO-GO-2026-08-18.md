# Morro Digital V2 — Final Go/No-Go — 2026-08-18

## Decision

**NO-GO for production promotion.**

This is a release-evidence decision, not a statement that the implementation is incomplete. The repository has strong historical local evidence and the remaining PR #285 workflow hardening has been applied directly to `main`, but the exact post-merge/post-governance HEAD could not be re-executed end-to-end in the current runner. Provider/Render validation also remains external.

## Release identity

- User-requested starting baseline: `main@d5e1da4a6e619d705a096d62c6b6e6eaa6d8b779`.
- PR #293 (Mercado Pago + Render V2) is included in that baseline.
- Workflow hardening from PR #285 was applied directly to `main`, without merging its diverged branch.
- Workflow hardening commit: `a4be956a57edba2e21dd2c8073594eb0c573f387`.
- Affiliates workflow reconciliation/pinning commit: `ff197b3758b0f1c02a5c1bff8073e424a7f37521`.
- Feature Registry truth reconciliation commit: `175fa1b927a3476e05c292624710faa11863049c`.
- PR #285 is closed unmerged after the safe residual changes were ported directly to `main`.
- This document is evidence-only and does not alter runtime behavior.

## Exact-head execution environment

The current execution runner was inspected before making release claims:

- Node.js 22.16.0 is available.
- Chromium is available at `/usr/bin/chromium`.
- `pnpm` is not locally available; Corepack attempts to resolve pnpm through `registry.npmjs.org` and the request fails in this runner.
- `mysql` and `mysqladmin` are unavailable.
- No Mercado Pago/provider sandbox, Ordering DB or Financial DB environment variables are present in the runner.
- The runner cannot therefore install the repository dependency graph, install/start MySQL, or contact the provider sandbox.

These are execution-environment blockers. They must not be converted into PASS results.

## Requested validation matrix

| # | Gate | Exact final HEAD result | Evidence / decision |
|---|---|---|---|
| 1 | Full local Quality Gate — lint, typecheck, test, build | **BLOCKED / NOT REEXECUTED** | Repository contract is `pnpm check`; historical individual/local gates exist, but pnpm/dependencies cannot be resolved in this runner. No exact-final-HEAD PASS is claimed. |
| 2 | MySQL integration — 331 tests | **BLOCKED / NOT REEXECUTED** | Historical evidence records Financial 91 + Ordering 41 + CRM 164 + Ticketing 31 + Affiliates 4 = **331/331 PASS**. MySQL is unavailable in the current runner and Affiliates/Payments changed after the historical checkpoint. |
| 3 | Browser E2E — 374 tests | **BLOCKED / NOT REEXECUTED** | Historical evidence records **75 files / 374 tests PASS**. Chromium exists, but repository dependencies/runtime cannot be materialized in this runner. |
| 4 | Local rollback drill | **BLOCKED / NOT REEXECUTED** | Historical drill proves good readiness 200 -> bad readiness 503 -> good readiness/health 200. It is not exact-final-HEAD or staging rollback proof. |
| 5 | Mercado Pago/provider E2E with test credentials | **BLOCKED_EXTERNAL** | No provider credentials/DB URLs are available here. PR #293 itself classifies the provider path as external-validation-required. No provider verification is claimed. |
| 6 | Feature Registry promotion | **RECONCILED / NO UNSUPPORTED PROMOTION** | FEATURE-0001..0008 and FEATURE-0011 remain `equivalent`. FEATURE-0009 Payments and FEATURE-0010 Affiliates remain `migrating`; notes now distinguish historical evidence from the required exact-HEAD rerun. |
| 7 | Final Go/No-Go report | **DONE** | This document is the canonical closeout record for this execution. |
| 8 | PR #285 workflow closeout directly on main | **DONE / CLOSED UNMERGED** | The diverged #285 branch was not merged. Its safe residual workflow hardening was ported directly onto current main, preserving newer Mercado Pago/Render and Affiliates work; the PR was then closed with evidence links. |

## Historical local evidence that remains valid as historical evidence

The existing `docs/qa/MORRO-DIGITAL-V2-FINAL-POST-VALIDATION-REPORT.md` records:

- MySQL: **331/331 PASS**.
- Browser suite: **374/374 PASS** across 75 files.
- Local rollback drill: PASS.
- Provider sandbox E2E: fail-closed because sandbox credentials were missing.

Those results are real evidence from their recorded checkpoint. They are deliberately not relabeled as exact-final-HEAD results because subsequent commits modified Payments, Platform/Auth and Affiliates paths.

## PR #285 workflow closeout evidence

The direct-main closeout applies the safe residual value of #285 instead of merging its branch, which was 111 commits behind the starting main:

- external GitHub Actions are pinned to immutable commit SHAs;
- `quality.yml` executes `pnpm ci:supply-chain:strict`;
- `tooling/quality/check-workflow-supply-chain.mjs` enforces immutable action references and rejects unsafe workflow patterns;
- GitHub Actions Dependabot maintenance is configured;
- CODEOWNERS explicitly covers workflows/quality governance;
- three historical `capture-v2-*` one-shot workflows are removed;
- current main-only `affiliates-feature-0010-contract.yml` is preserved, pinned and reconciled with the durable `services/affiliates` runtime and `migrating` registry state;
- current Mercado Pago/Render/package scripts are preserved.

## Feature Registry release truth

No new equivalence promotion is justified solely from historical evidence after the runtime changed.

- **FEATURE-0009 / Payments:** stays `migrating`. Mercado Pago/Render code is merged, but provider E2E, Render smoke and exact-final-HEAD local/browser validation remain required.
- **FEATURE-0010 / Affiliates:** stays `migrating`. Durable runtime exists on main, but Affiliate runtime changed after the historical 96fefbb5 validation; exact-current-HEAD rerun and remaining Ordering/Financial/browser evidence are required.
- Existing equivalent features remain equivalent; none is promoted to `released` by this report.

## GO criteria still required

Production GO requires all of the following on the same exact release SHA:

1. `pnpm install --frozen-lockfile` succeeds in a checkout-capable runner.
2. Full `pnpm check` / Quality Gate succeeds.
3. MySQL integration suite is rerun and returns 331/331 (or the updated canonical test total, if the suite has legitimately grown).
4. Browser suite is rerun and returns 374/374 (or the updated canonical total).
5. Local/staging rollback drill succeeds for the exact release artifact.
6. Mercado Pago test-mode E2E succeeds with real test credentials, including checkout/readback/webhook/reconciliation/refund evidence required by the current provider implementation.
7. Render `/healthz`, `/readyz`, release identity and shutdown/readiness behavior are verified on the deployed candidate.
8. GitHub Actions official Quality/domain/browser/release gates execute successfully once Actions infrastructure is available.

## Failure / rollback criteria

Remain **NO-GO** or roll back if any exact-SHA Quality/integration/browser gate fails, provider reconciliation disagrees with authoritative amount/currency/status, webhook verification is not proven, readiness is not fail-closed during dependency/shutdown failure, release identity mismatches the approved SHA, migration dry-run fails, or the rollback drill cannot restore a healthy prior release.

## Final classification

**CODE_INTEGRATED / GOVERNANCE_HARDENED / HISTORICAL_LOCAL_EVIDENCE_STRONG / EXACT_HEAD_RERUN_BLOCKED / PROVIDER_EXTERNAL_VALIDATION_REQUIRED / PRODUCTION_NO-GO**

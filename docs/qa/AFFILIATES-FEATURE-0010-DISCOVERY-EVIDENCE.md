# FEATURE-0010 Affiliates — Canonical Discovery Evidence

## Revalidated checkpoint

GitHub is the source of truth.

```text
main: ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6
PR: #264
base: main
```

The exact PR head is intentionally read from GitHub metadata during validation rather than hard-coded into this file, because changing this evidence would itself create a new head. The branch must remain zero-behind and mergeable against the checkpoint above before official CI and before merge.

The current main already includes the relevant Ordering/Financial foundation. Nothing in it supplies the missing Affiliate commercial policy.

## Canonical state inspected

- Feature Registry: `FEATURE-0010`, domain `affiliates`, wave 9, `planned`, no legacy sources, target `@touristic/affiliates`, equivalence behavior/visual/API all false.
- Master Migration Tracker: `MIG-0011`, domain Affiliates, wave 9, `discovered`.
- Domain Map: Affiliate is separate; Financial is the only monetary source of truth.
- Module Contracts: Affiliate consumes only public contracts; Business cannot administer Affiliate; Financial materialization is Financial-owned.
- Capability Matrix: CAP-0018/19/20 reserve attribution, commercial entitlement and Financial position ownership without executable commercial policy.
- Ordering: canonical order ID/status and `OrderPlacedEvent` exist; no Affiliate authority exists there.
- Financial settlement domain/service: allocation/payable/settlement primitives, Payment confirmation/evidence, ledger and amount conservation already exist; Affiliate must reuse this authority rather than duplicate it.

## PR and branch reconciliation

PR #264 is the active Affiliate canonical-boundary PR.

During reconciliation, concurrent commits temporarily placed Payments, Ticketing, Business and broad Master Tracker edits on the branch. They were not force-overwritten. Instead, a later fast-forward reconciliation restored those paths exactly to the current `main` blobs so the net PR diff returned to FEATURE-0010 scope.

The post-reconciliation net diff contains only the Affiliate contract workflow, Affiliate documentation/QA/operations documents and the directly necessary Affiliate sections of Capability Matrix, Domain Map and Module Contracts.

No `packages/affiliates`, `services/affiliates`, Affiliate migration, API, UI, provider, wallet or payout runtime is part of the target diff.

Older Affiliate/synchronization branches are not implementation sources for promotion. Previously contaminated runtime must not be reintroduced from historical branches.

## Policy-neutral technical work now completed

This update closes everything that can be fixed without deciding commercial policy:

- canonical domain/ownership boundaries;
- conceptual schemas;
- Ordering/Financial read boundaries;
- versioned Affiliate → Financial materialization request/result contract shape without monetary/browser authority;
- canonical event family and ownership;
- durable idempotency/replay/divergence strategy;
- immutable audit contract;
- authorization/trust boundaries;
- privacy/LGPD engineering requirements;
- threat model;
- test/invariant plan;
- migration sequence;
- staged rollout/kill switches/rollback.

No Affiliate runtime, migration, provider, wallet, payout, payment, commission formula or browser commission authority is introduced.

## Updated readiness

```text
PASS       15
PARTIAL     3
GAP         7
N/A         2
TOTAL      27
```

The remaining PARTIAL/GAP items correspond to explicit product-policy decisions, not missing generic engineering work.

## Decision gate

`docs/product-architecture/AFFILIATES-DECISION-SHEET.md` contains exactly 19 decisions required to unlock runtime:

1. affiliate identity;
2. eligibility;
3. suspension;
4. referral evidence;
5. attribution subject;
6. attribution precedence;
7. attribution window;
8. qualifying conversion;
9. commission base;
10. fixed vs percentage;
11. rate;
12. rounding;
13. caps;
14. currency;
15. effective dates/versioning;
16. pending/earned/reversed/cancelled/disputed lifecycle;
17. refund/cancellation consequences;
18. Financial materialization timing;
19. retention/LGPD.

Missing values fail closed. The repository must not infer them from roadmap wording, Financial primitives, historical event names or browser behavior.

## Runtime contamination check

The target state for this PR is intentionally:

```text
packages/affiliates     ABSENT
services/affiliates     ABSENT
Affiliate DB migration  ABSENT
Affiliate API/UI        ABSENT
Affiliate payout/wallet ABSENT
```

The permanent contract workflow asserts the runtime directories remain absent in this phase.

## Validation available while Actions is unavailable

Connector/static validation completed during this reconciliation:

- revalidated `main` ref and SHA directly;
- fetched Registry and Master Tracker from `main` rather than relying on stale code-search snapshots;
- fetched PR #264 metadata and compared the branch directly to `main`;
- inspected Ordering and Financial source contracts used by the boundary;
- inspected changed filenames and removed unrelated net-diff contamination by restoring those files to exact `main` blobs;
- confirmed `packages/affiliates` and `services/affiliates` are absent at the reconciled head;
- prepared a permanent Affiliate contract workflow that checks the Decision Sheet cardinality, Registry state, MIG-0011 state and absence of Affiliate runtime;
- normalized changed documentation for repository formatting checks.

GitHub Actions is currently unavailable and the observed workflow execution failure is a startup failure rather than a completed named Quality result. Therefore official Quality cannot be claimed. Do not merge to `main` until the exact final head has passed the repository Quality Gate and the Affiliate contract workflow after Actions returns.

## Required CI on final head

At minimum:

- frozen install;
- `pnpm format:check`;
- `pnpm architecture:check`;
- `pnpm features:check`;
- lint;
- typecheck;
- full tests;
- build;
- `Affiliates FEATURE-0010 Contract`.

The exact head must be re-compared to `main` immediately before those checks and again before merge; `behind_by` must be zero and the PR must remain mergeable.

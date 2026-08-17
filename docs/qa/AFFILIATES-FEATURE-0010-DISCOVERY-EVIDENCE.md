# FEATURE-0010 Affiliates — Canonical Discovery Evidence

## Revalidated checkpoint

GitHub is the source of truth.

```text
main: ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6
PR #264 base before this update: ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6
PR #264 head before this update: 823a8661c0ca18edbb4ea4f2d753d191305ab17e
compare: ahead 1 / behind 0 / mergeable
```

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

PR #264 is the active Affiliate canonical-boundary PR. It was rebuilt on current main and the current diff contains documentation plus an Affiliate contract workflow only.

Current changed-file inspection before this update contained no Affiliate runtime directories or implementation files.

Affiliate-related branch search also found older/synchronization branches. They are not implementation sources for promotion. The previously contaminated runtime noted by coordination history is not present in the current #264 diff and must not be reintroduced from an old branch.

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

Connector/static validation completed:

- revalidated `main` ref and SHA;
- fetched Registry and Master Tracker from `main` directly rather than relying on stale code-search snapshots;
- fetched current PR #264 metadata/diff;
- verified `behind_by = 0` against `main` before this update;
- inspected changed filenames and confirmed no Affiliate runtime;
- inspected Ordering and Financial source contracts used by the boundary;
- reconciled stale discovery evidence to current main;
- prepared permanent Affiliate contract checks for the exact final head.

GitHub Actions is currently unavailable, so official Quality cannot be claimed. Do not merge to `main` until the exact final head has passed the repository Quality Gate and the Affiliate contract workflow after Actions returns.

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

The PR must remain 0-behind and mergeable when those checks run.
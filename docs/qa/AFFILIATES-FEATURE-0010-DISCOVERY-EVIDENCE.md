# FEATURE-0010 Affiliates — Canonical Discovery and Implementation Evidence

## Revalidated checkpoint

GitHub is the source of truth.

```text
main: ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6
PR: #264
base: main
```

The exact PR head is read from GitHub metadata during validation rather than hard-coded into this file. Before official CI and before merge, the branch must be re-compared with current `main`, remain zero-behind and remain mergeable.

## Canonical state

- Feature Registry: `FEATURE-0010`, domain `affiliates`, wave 9, `planned`, target `@touristic/affiliates`, equivalence behavior/visual/API false.
- Master Migration Tracker: `MIG-0011`, Affiliates, wave 9, `discovered`.
- Domain Map/Module Contracts: Affiliate is separate; Ordering owns canonical Order identity/state; Financial is the only monetary authority; Business cannot administer Affiliate by inheritance.
- Ordering: canonical Order states exist, including `pending_payment`, `payment_confirmed` and `cancelled`.
- Financial: Payment/ledger/allocation/payable/settlement/reconciliation primitives and authority already exist and must be consumed through public evidence/materialization contracts rather than duplicated.

## Branch reconciliation history

PR #264 remains the active FEATURE-0010 branch.

Earlier concurrent commits temporarily placed Payments, Ticketing, Business and broad Master Tracker edits on this branch. They were reconciled without force-push by restoring those unrelated paths to exact `main` blobs. Subsequent Affiliate work has continued by fast-forward commits only after exact-head revalidation.

Historical/stale Affiliate branches are not promotion sources and must not be used to reintroduce contaminated runtime.

## Product-policy gate

The former 19-item product gate is **satisfied** by `AFFILIATE-POLICY-V1` in `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`.

The approved policy fixes identity/program semantics, eligibility/suspension, referral sources, acquisition subject, precedence, 30-day window, qualifying conversion, Financial net eligible revenue base, 3000-bps percentage commission, half-up minor-unit rounding, no cap/minimum, currency authority, immutable versioning, lifecycle/maturity, refund/reversal behavior, Financial materialization timing and LGPD/retention defaults.

No implementation may silently deviate from that policy. Future commercial changes require an explicit new version.

## Executable domain foundation now present

`packages/affiliates` now exists and contains the pure FEATURE-0010 domain foundation:

```text
packages/affiliates/README.md
packages/affiliates/package.json
packages/affiliates/tsconfig.json
packages/affiliates/src/policy.ts
packages/affiliates/src/ids.ts
packages/affiliates/src/eligibility.ts
packages/affiliates/src/attribution.ts
packages/affiliates/src/conversion.ts
packages/affiliates/src/commission.ts
packages/affiliates/src/materialization.ts
packages/affiliates/src/ports.ts
packages/affiliates/src/events.ts
packages/affiliates/src/index.ts
packages/affiliates/src/index.test.ts
```

Implemented and locally validated invariants include:

- server-normalized branded IDs;
- attribution/materialization eligibility separation;
- server-validated referral evidence and SHA-256 fingerprint boundary;
- source precedence and Order attribution lock;
- 30-day server-clock attribution expiry;
- canonical Ordering `payment_confirmed` plus verified Financial evidence requirement;
- subscription renewal rejection in V1;
- 3000-bps integer calculation and half-up rounding;
- seven-day/service-aware maturity;
- pending/earned/cancelled/reversed/disputed transitions;
- refund repricing and explicit post-earned reversal evidence;
- Financial materialization request without amount/rate/currency/payout/settlement instructions;
- canonical idempotency-key construction;
- authorization/evidence/repository/idempotency/audit/materialization ports;
- versioned Affiliate event payload/envelope types.

## Intentionally absent

The current PR still has no:

```text
services/affiliates             ABSENT
Affiliate DB migration          ABSENT
Affiliate HTTP API              ABSENT
Affiliate browser/admin UI      ABSENT
Affiliate provider adapter      ABSENT
Affiliate-owned payout/wallet   PROHIBITED
```

The next implementation stage is application orchestration plus additive durable persistence. Financial materialization remains non-executable/dark until a Financial-owned adapter and integration evidence exist.

## Workspace/lockfile transition

The `@touristic/affiliates` ESM manifest exists, but `packages/affiliates` is temporarily excluded from pnpm workspace linking so the existing `pnpm-lock.yaml` is not manually falsified while the pinned pnpm runtime is unavailable in the current execution environment.

Root scripts explicitly provide:

- `affiliates:lint`;
- `affiliates:typecheck`;
- `affiliates:test`;
- `affiliates:build`;
- `affiliates:check`.

The main repository `check` command includes `affiliates:check`. When the pinned pnpm environment is available, the package must be added normally to workspace linking and `pnpm-lock.yaml` regenerated/revalidated before release promotion.

## Current migration readiness

```text
PASS       15
PARTIAL    10
GAP         0
N/A         2
TOTAL      27
```

The former commercial-policy GAPs are resolved. Remaining PARTIAL rows are implementation/evidence work: durable identity/membership persistence, source validation adapters, durable attribution/conversion concurrency, entitlement persistence/reconciliation, retention operations and complete integration evidence.

## Validation performed without GitHub Actions

Completed during this implementation sequence:

- direct `main`, branch and PR metadata revalidation;
- exact compare of candidate commits before branch fast-forward;
- atomic Git tree/commit construction with no force-push;
- strict TypeScript compilation of the Affiliate domain foundation under equivalent repository compiler settings;
- typed compilation of test source using a local Vitest declaration boundary because repository dependencies are not mounted in the execution container;
- compiled-JavaScript smoke validation for policy, attribution, conversion, commission, lifecycle, refund/reversal, materialization boundary and idempotency behavior;
- manual formatting normalization of new code in preparation for repository Prettier gate;
- workflow hardening against cross-domain implementation imports and payout/provider instructions.

These validations are useful engineering evidence but are not substitutes for the official repository gates.

## GitHub Actions state

GitHub Actions has been failing at workflow startup for current events rather than completing named Quality jobs. Empty statuses/startup failure are not a green result.

Therefore:

- keep PR #264 draft;
- do not merge critical FEATURE-0010 work to `main`;
- do not promote Feature Registry equivalence or MIG state based only on local/static validation.

## Required gates on the final exact head

At minimum:

1. `pnpm install --frozen-lockfile` after workspace/lockfile reconciliation;
2. `pnpm format:check`;
3. `pnpm architecture:check`;
4. `pnpm features:check`;
5. repository lint;
6. repository typecheck;
7. repository tests;
8. repository build;
9. `pnpm affiliates:check`;
10. `Affiliates FEATURE-0010 Contract`;
11. future persistence/Ordering/Financial/security/privacy/E2E gates as those stages are introduced.

Immediately before official CI and immediately before any merge, revalidate current `main`, exact PR head, mergeability and `behind_by = 0`.

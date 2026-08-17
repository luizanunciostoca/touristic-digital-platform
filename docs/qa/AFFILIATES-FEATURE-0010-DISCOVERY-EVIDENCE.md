# FEATURE-0010 Affiliates — Canonical Discovery Evidence

## Discovery lineage

Initial discovery started against `main` at:

```text
8d07e4db0e3c619d520f1a3fc36dc4b14a6a65a2
```

Before the original pull request was prepared, `main` advanced with Ordering M150 and the work was rebuilt cleanly on:

```text
91830cdbb485fbf4145e5655e81bffc13b459627
```

For the final V2 documentary reconciliation, the branch was revalidated against and remains zero-behind:

```text
main@ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6
```

That current `main` already includes M153 Payments reconciliation and the final Ticketing documentary reconciliation. Neither addition supplies the missing Affiliate attribution/commission policy or transfers Financial monetary authority to Affiliate.

## Sources inspected

- `docs/features/registry.json` — `FEATURE-0010` is `planned`, wave 9, no legacy sources, target `@touristic/affiliates`, all equivalence flags false.
- `docs/migration/MASTER-MIGRATION-TRACKER.md` — `MIG-0011` is `discovered`; the final rollup preserves FEATURE-0010 as planned/discovered and keeps production release separate.
- `docs/product-architecture/DOMAIN-MAP.md` — Affiliate is a separate platform domain; Financial is the only source of financial truth.
- `docs/product-architecture/MODULE-CONTRACTS.md` — Business cannot administer affiliates; Ordering cannot administer affiliates; Affiliate can affect monetary state only through a future explicit Financial boundary.
- `docs/product-architecture/CAPABILITY-MATRIX.md` — CAP-0018/19/20 provide architectural direction but do not define executable product policy.
- `docs/product-architecture/PRODUCT-ROADMAP.md` — the platform affiliate program is a future transaction/revenue initiative whose prioritization gate requires owner, contract, risk, acceptance criteria, dependencies and success metric before implementation.
- `docs/product-architecture/FEATURE-LIFECYCLE.md` — implementation readiness requires closed scope, acceptance criteria, resolved dependencies, security/LGPD, planned tests and metrics.
- `packages/business/src/onboarding-commercial-conversion.ts` — Business hands a normalized commercial checkout request to Payments and accepts only a verified payment result; it contains no Affiliate commission authority.
- Ordering contracts — canonical order/subscription records exist, but there is no approved Affiliate attribution or qualifying-conversion contract.
- Financial settlement contracts — Financial owns allocation, payable, settlement, provider transfer verification and settlement idempotency.
- `docs/qa/PAYMENTS-M146-EVIDENCE.md` and the later Payments matrix — Financial only materializes money from persisted verified/reconciled authority; browser amounts are non-authoritative and no Affiliate payout authority is implied.

## Existing implementation search

At the discovery checkpoint and again at the final documentary reconciliation:

- no `packages/affiliates` directory is part of `main`;
- no `services/affiliates` directory is part of `main`;
- no approved Affiliate runtime implementation is used as evidence;
- the current PR is intentionally documentation/governance only.

## Discovery conclusion

There is approved architectural/product direction for a separate platform Affiliate domain, but there is no approved executable scope sufficient for runtime implementation.

Missing policy includes:

- affiliate onboarding/eligibility/identity relationship;
- accepted referral evidence and trust model;
- attribution subject and precedence/conflict rules;
- attribution-window duration and renewal semantics;
- qualifying conversion event;
- commission formula/base/rounding/caps/currency/versioning;
- commission state machine and refund/cancellation/dispute/reversal behavior;
- exact Affiliate-to-Financial materialization contract;
- Affiliate authorization/RBAC;
- privacy/retention rules;
- metrics, observability and rollback criteria.

Implementing persistence, APIs, events, commission calculation, browser/admin or payout behavior without those decisions would invent product policy and violate the feature lifecycle gate.

## Canonical decision produced by this change

The branch therefore performs documentation/architecture reconciliation only:

1. preserves `FEATURE-0010` as `planned`;
2. preserves `MIG-0011` as `discovered`;
3. defines Affiliate as the owner of platform affiliate identity, validated referral/attribution evidence, conversion association and commercial commission entitlement under an approved policy;
4. makes Financial exclusively authoritative for Payment, ledger, allocation, payable, wallet/financial position, settlement, transfer/payout and monetary reversals;
5. makes browser/redirect evidence non-authoritative;
6. records the detailed readiness matrix in `docs/migration/AFFILIATES-MIGRATION-MATRIX.md`;
7. deliberately creates no Affiliate runtime, persistence, provider, payment or payout path.

## Capability readiness

```text
PASS       3
PARTIAL    2
GAP       10
N/A        2
TOTAL     17
```

This tally is a discovery-readiness matrix, not a parity or release-equivalence score.

## Final validation scope

The current PR diff is documentation-only and is compared directly against current `main`. No runtime test is fabricated for a runtime that intentionally does not exist.

GitHub Actions is temporarily unavailable at this checkpoint. Therefore this evidence does **not** claim fresh exact-head CI success. The documentary audit can still verify source-of-truth consistency, ownership, changed-file scope, merge-base/behind state and absence of runtime changes. Official exact-head Quality/contract checks remain a pending promotion gate to execute when Actions is functional again.

Historical green checks remain supporting evidence only and are not reused as proof for the current PR head.
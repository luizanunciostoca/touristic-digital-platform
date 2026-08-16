# FEATURE-0010 Affiliates — Canonical Discovery Evidence

## Checkpoint

Discovery was performed against `main` at:

```text
8d07e4db0e3c619d520f1a3fc36dc4b14a6a65a2
```

The checkpoint already contains Financial M152 bounded provider retries and the M146 Financial allocation/payable/settlement authority that Affiliates must not duplicate.

## Sources inspected

- `docs/features/registry.json` — `FEATURE-0010` is `planned`, wave 9, no legacy sources, target `@touristic/affiliates`, all equivalence flags false.
- `docs/migration/MASTER-MIGRATION-TRACKER.md` — `MIG-0011` is `discovered`; visual, behavior and tests were pending. The Payments section explicitly preserves Affiliates as a separate feature without implicit financial authority.
- `docs/product-architecture/DOMAIN-MAP.md` — Affiliate is a separate platform domain; Financial is the only source of financial truth.
- `docs/product-architecture/MODULE-CONTRACTS.md` — Business cannot administer affiliates; Ordering cannot administer affiliates; Financial and Affiliate communicate only through public boundaries.
- `docs/product-architecture/CAPABILITY-MATRIX.md` — CAP-0018/19/20 provide architectural direction, including expiry/deduplication and reversal expectations, but did not define executable policy.
- `docs/product-architecture/PRODUCT-ROADMAP.md` — the platform affiliate program is a V2.1 transaction/revenue initiative; the prioritization gate still requires owner, contract, risk, acceptance criteria, dependencies and success metric before entering a sprint.
- `docs/product-architecture/FEATURE-LIFECYCLE.md` — `READY` requires closed scope, acceptance criteria, resolved dependencies, security/LGPD, planned tests and metrics.
- `packages/business/src/onboarding-commercial-conversion.ts` — Business hands a normalized commercial checkout request to Payments and accepts only a verified payment result; it contains no Affiliate commission authority.
- `packages/ordering/src/index.ts` — Ordering owns canonical order identity/state and produces the architectural `OrderPlaced` record/event shape.
- `packages/financial/src/settlement.ts` — Financial owns allocation, payable, settlement, provider transfer verification and settlement idempotency.
- `docs/qa/PAYMENTS-M146-EVIDENCE.md` — Financial only allocates from persisted verified/reconciled authority; browser amounts are not authoritative; M146 explicitly does not infer commission rules or grant payout authority to Affiliates.

## Existing implementation search

At the checkpoint:

- no `packages/affiliates` directory exists;
- no `services/affiliates` directory exists;
- branch search for `affiliate` returned no Affiliate branch;
- pull-request search found no Affiliate implementation PR; only historical Payments/status PRs that explicitly kept Affiliates blocked or separate.

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
7. deliberately does not create runtime code.

## Capability readiness

```text
PASS       3
PARTIAL    2
GAP       10
N/A        2
TOTAL     17
```

This tally is a discovery-readiness matrix, not a parity or release-equivalence score.

## Validation scope

Because the decision intentionally creates no executable Affiliate runtime, no Affiliate runtime test is fabricated. The branch must instead preserve the repository Quality Gate, formatting, architecture boundaries, Feature Registry validity, lint/typecheck/tests/build and existing Financial/Ordering/Business regressions.

A final head and CI status are recorded in the pull request after the branch diff is complete.

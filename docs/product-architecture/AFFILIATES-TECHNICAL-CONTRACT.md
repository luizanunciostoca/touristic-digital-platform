# Affiliates Technical Contract — FEATURE-0010

## Status

`AFFILIATE-POLICY-V1` is approved and the first executable domain foundation now exists in `packages/affiliates`.

Canonical integration checkpoint remains `main@ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`. `FEATURE-0010` remains `planned` and `MIG-0011` remains `discovered` until persistence, adapters, application behavior, security/integration evidence and final release gates justify promotion.

This contract authorizes only the behavior explicitly frozen by `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`. It does not authorize Affiliate-owned Payment, ledger, payable, wallet, settlement, transfer, payout, provider access or browser monetary authority.

## Canonical ownership

1. Affiliate is a platform domain separate from Business, Ordering and Financial.
2. Affiliate owns affiliate account/program semantics, referral evidence, attribution, conversion association and commercial commission-entitlement evidence.
3. Ordering remains authoritative for canonical Order identity and state.
4. Financial remains authoritative for Payment, eligible platform revenue, ledger, allocation, payable, wallet/position, settlement, transfer/payout, reconciliation, FX and monetary reversals.
5. Affiliate never writes Financial persistence directly.
6. Browser state, redirects, query strings, cookies and local storage are untrusted evidence/transport only.
7. Business/tenant membership does not confer Affiliate authority.
8. Cross-domain interaction uses versioned ports/events and explicit authorization.
9. Exact idempotent replay converges; divergent replay fails closed.
10. Historical policy/evidence is immutable; later policy versions never silently rewrite prior rights.

## Approved runtime policy

`packages/affiliates/src/policy.ts` freezes `AFFILIATE-POLICY-V1`:

- global Affiliate account linked to canonical Identity and program memberships;
- two eligibility levels: attribution and Financial materialization;
- suspension blocks new attribution/materialization and freezes affected entitlement review;
- accepted V1 evidence: platform link/deep-link, platform QR, explicit checkout code and authenticated/versioned server referral;
- pseudonymous server-owned `AcquisitionSubjectId`;
- precedence: checkout code > authenticated server referral > platform link/QR, latest valid evidence inside the same tier;
- 30-day server-clock attribution window;
- Order attribution locks at `pending_payment`;
- qualifying conversion requires Ordering `payment_confirmed` plus verified Financial evidence;
- subscription renewals are not commissionable in V1;
- commission base is Financial-authoritative net eligible platform revenue;
- percentage model only, 3000 basis points, integer minor units, final half-up rounding;
- no commercial cap/minimum in V1;
- entitlement currency equals the Financial eligible-revenue currency; Affiliate performs no FX;
- policy snapshot freezes when authoritative attribution is established;
- entitlement lifecycle is `pending`, `earned`, `cancelled`, `reversed`, `disputed`;
- maturity is at least seven calendar days after verified payment and not before service/performance when a canonical service date exists;
- refund/cancellation/chargeback behavior follows the approved Decision Sheet while Financial retains monetary reversal authority;
- Financial materialization is allowed only for `earned` entitlement plus Financial-eligible beneficiary;
- default engineering retention is 90 days raw referral evidence, 24 months pseudonymous attribution/conversion metadata and five years commercial/audit evidence, subject to jurisdictional/legal hold.

## Executable domain foundation

`packages/affiliates` contains no external runtime dependency and is split by responsibility:

- `ids.ts`: branded server identifiers and bounded timestamp/digest/currency validators;
- `eligibility.ts`: Affiliate account/program membership and attribution/materialization eligibility invariants;
- `attribution.ts`: server-validated referral evidence, expiry and deterministic precedence/lock resolution;
- `conversion.ts`: canonical Ordering/Financial evidence boundary and one initial-purchase conversion shape;
- `commission.ts`: integer commission calculation, maturity, lifecycle, dispute and refund/reversal consequences;
- `materialization.ts`: Financial request/result contract without amount/rate/currency/payout/settlement instructions;
- `ports.ts`: authorization, evidence, repositories, durable idempotency, audit and Financial handoff ports;
- `events.ts`: versioned TypeScript event payload/envelope types owned by Affiliate;
- `index.test.ts`: executable policy/invariant tests.

No `services/affiliates`, Affiliate database migration, HTTP API, browser/admin UI or monetary provider adapter exists yet.

## Domain records

### Affiliate account and membership

Canonical runtime types use opaque `AffiliateId`, `AffiliateProgramId` and `AffiliateMembershipId`. Affiliate stores canonical Identity references rather than copying credentials/PII. Membership state controls program participation independently from Business roles.

### Referral evidence and attribution

Only server-validated evidence can become `ReferralEvidence`. Evidence requires a SHA-256 fingerprint and server timestamps. Attribution uses a server-owned `AcquisitionSubjectId`, evidence reference/fingerprint, source, policy version, establishment timestamp and 30-day expiry. Order lock prevents later referral input from hijacking an already locked Order attribution.

### Conversion association

A conversion association requires public canonical Ordering evidence with status `payment_confirmed` and verified Financial evidence containing the authoritative eligible-revenue basis, currency, evidence digest and contract version. Browser callbacks and subscription renewals cannot qualify in V1.

Repository/persistence must enforce one canonical conversion association per Order; the domain type alone is not treated as sufficient concurrency proof.

### Commission entitlement

The entitlement stores Affiliate/program/conversion/attribution identity, policy version, revision, commercial status, eligible revenue snapshot, calculated commission minor units, currency, 3000-bps policy snapshot and maturity timestamp.

Calculation uses `BigInt` integer arithmetic and half-up rounding. No JavaScript floating-point percentage calculation is allowed.

Partial refund before `earned` reprices the pending right using authoritative Financial basis. Refund after `earned` creates an explicit reversal consequence; it does not mutate Financial state or silently rewrite monetary history.

## Public port boundaries

`AffiliateOrderingEvidencePort` reads canonical Order state only.

`AffiliateFinancialEvidencePort` reads verified payment/conversion and eligible-revenue evidence only.

`AffiliateFinancialMaterializationPort` receives `AffiliateFinancialMaterializationRequestV1` containing only:

- request ID;
- entitlement ID and revision;
- Affiliate ID;
- conversion-association ID;
- policy version;
- entitlement digest;
- correlation ID.

The request deliberately contains no amount, rate, currency, payout destination, provider credential, ledger posting or settlement instruction. Financial independently resolves/validates its monetary consequence. `accepted` means request accepted by Financial, never paid/settled/transferred.

The port also defines durable materialization readback so uncertain delivery can be resolved before retry.

## Idempotency and audit

Mutation identities use:

```text
affiliate:v1:<operation>:<sha256(canonical immutable inputs)>
```

The canonical input serializer sorts object keys recursively. Durable implementations must claim the key atomically. Exact replay returns the original semantic outcome; a reused key with divergent semantic digest is a conflict and fails closed.

Every authoritative state-changing application operation must append immutable audit containing actor, authorization decision, Affiliate/subject references, policy/contract version, before/after digest where applicable, idempotency digest, correlation/causation, server time, outcome and machine-readable reason. Secrets, raw referral tokens, full URLs, provider credentials and copied identity documents are forbidden.

## Authorization

- public/browser callers can submit only untrusted evidence through an authenticated/validated server boundary;
- authoritative attribution, conversion, entitlement and materialization changes are server-side operations;
- Affiliate self-service must prove canonical Identity ownership;
- admin operations require explicit platform/admin capability; tenant membership is insufficient;
- Affiliate service-to-Financial handoff uses an authenticated Affiliate service principal;
- Financial independently authorizes and validates the request;
- cross-affiliate and cross-destination access fails closed unless explicitly authorized.

## Events

TypeScript event types now exist for:

- `AffiliateReferralEvidenceRecorded`;
- `AffiliateAttributionEstablished`;
- `AffiliateConversionAssociated`;
- `AffiliateCommissionEntitlementChanged`;
- `AffiliateFinancialMaterializationRequested`.

They conform structurally to `PLATFORM-EVENT-ENVELOPE` v1. These are not yet registered as externally executable contracts in `docs/contracts/registry.json`: registration requires a real producer/consumer, canonical JSON schema, compatibility tests and evidence on the exact implementation head.

Historical labels `CustomerAttributedToAffiliate` and `AffiliateCommissionAccrued` remain non-executable and must not be emitted by new runtime.

## Privacy/LGPD

Identity remains owner of canonical PII. Affiliate persists stable references and minimized evidence/digests. Raw referral evidence is retained only when necessary and follows the approved 90-day maximum default. Pseudonymous and commercial/audit retention follows the approved policy, with jurisdictional configuration and lawful holds. Analytics/logs/traces must not contain raw referral tokens, unnecessary direct identifiers or credentials.

## Implementation sequence

### Phase 0 — complete

Canonical ownership, Decision Sheet, threat model, test plan, migration matrix and rollout/rollback contract.

### Phase 1 — complete

`AFFILIATE-POLICY-V1` approved and frozen in documentation/code.

### Phase 2A — complete on this PR head

Pure `@touristic/affiliates` domain types/invariants, ports, TypeScript events and unit/invariant tests. No database or external side effect.

The package manifest exists, but the package is temporarily excluded from pnpm workspace linking until the pinned pnpm version can regenerate `pnpm-lock.yaml` reproducibly. Root `affiliates:*` commands explicitly lint/typecheck/test/build it, so the source remains inside repository quality gates during this transition.

### Phase 2B — next

Add application services, durable persistence, unique/idempotency claims and immutable audit using additive migrations. Keep external Financial materialization disabled.

### Phase 3

Add read-only Ordering/Financial adapters and event consumers; validate durable attribution/conversion/entitlement behavior and concurrency.

### Phase 4

Implement Financial-owned materialization adapter disabled/dark first, with accepted/rejected/readback/replay evidence and no Affiliate monetary persistence.

### Phase 5

Authenticated read APIs/projections after authorization/privacy tests.

### Phase 6

Browser/admin surfaces last. Browser remains presentation/input only.

## Release invariants

1. Affiliate source must not import Business/Ordering/Financial implementations, service internals or apps.
2. Browser-controlled monetary values cannot create entitlement/Financial state.
3. Every authoritative mutation is authorized, durable-idempotent and audited.
4. Ordering/Financial evidence crosses public ports only.
5. One Order cannot create multiple authoritative Affiliate conversions.
6. Financial may reject materialization without Affiliate mutating monetary state.
7. Materialization `accepted` is not payout/settlement.
8. Refund/reversal is explicit and audit-preserving.
9. Suspended/ineligible operations fail closed.
10. Rollback never deletes Financial history or transfers monetary authority to Affiliate.

## Promotion gate

Policy approval unblocks implementation; it does not establish equivalence. `FEATURE-0010` must remain `planned` and `MIG-0011` must remain `discovered` until the required runtime/persistence/integration/security/privacy/E2E evidence exists and the exact final head passes all official repository and Affiliate gates.

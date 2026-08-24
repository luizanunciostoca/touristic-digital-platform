# Affiliates Technical Contract — FEATURE-0010

## Status

`AFFILIATE-POLICY-V1` is approved and fully represented by the executable Affiliate domain/runtime on `main`.

Integrated runtime checkpoint before this reconciliation:

```text
main = a2a1f10420c1d452e9426c75549864c76d57f22c
certified PR head = 851740d2429c41d18f81f0e476fc2fb67a6a0c3b
certified tree = f1ef9038de983a69737c94a2d218eec57e179efb
main tree = f1ef9038de983a69737c94a2d218eec57e179efb
```

On that exact tree, Quality Gate #242, Affiliates FEATURE-0010 Contract #102 and Render Staging Blueprint Contract #66 passed. The documentation reconciliation may promote FEATURE-0010/MIG-0011 only if its own exact head preserves these invariants and passes the permanent gates.

This contract never authorizes Affiliate-owned Payment, ledger, payable/wallet, settlement, transfer/payout, provider access, FX, monetary reversal or browser monetary authority.

## Canonical ownership

1. Affiliate is a platform domain separate from Business, Ordering and Financial.
2. Affiliate owns Affiliate account/program semantics, eligibility/suspension, referral evidence, attribution, conversion association and commercial commission-entitlement evidence.
3. Ordering is authoritative for canonical Order identity/state.
4. Financial is authoritative for Payment, eligible platform revenue, ledger, allocation, payable/wallet, settlement, transfer/payout, reconciliation, FX and monetary reversals.
5. Affiliate never writes Financial persistence directly.
6. Browser state, redirects, query strings, cookies and local storage are untrusted evidence/transport only.
7. Business/tenant membership does not confer Affiliate authority.
8. Cross-domain interaction uses versioned ports/events and explicit authorization.
9. Exact idempotent replay converges; divergent replay fails closed.
10. Historical policy/evidence is immutable; later policy versions cannot silently rewrite prior rights.

## Approved runtime policy

`packages/affiliates/src/policy.ts` freezes `AFFILIATE-POLICY-V1`:

- global Affiliate account linked to canonical Identity and program memberships;
- verified identity/contact, current terms, approved membership and no suspension/fraud for new attribution;
- additional Financial eligibility for new materialization;
- suspension blocks new attribution/materialization, preserves history and conversion evidence, and freezes affected new entitlement as disputed;
- accepted evidence: platform link/deep-link, platform QR, explicit checkout code and authenticated/versioned server referral;
- pseudonymous server-owned `AcquisitionSubjectId`;
- precedence: checkout code > authenticated server referral > validated link/QR, latest valid evidence within a tier;
- direct/organic input does not erase valid Affiliate intent;
- 30-day server-clock attribution window;
- Order attribution locks at `pending_payment`;
- qualifying conversion requires Ordering `payment_confirmed` plus verified Financial evidence;
- subscription renewals are not commissionable in V1;
- commission base is Financial-authoritative net eligible platform revenue;
- percentage model only, 3000 basis points, integer minor units, final half-up rounding;
- entitlement currency equals the Financial eligible-revenue currency; Affiliate performs no FX;
- lifecycle is `pending`, `earned`, `cancelled`, `reversed`, `disputed`;
- maturity is at least seven calendar days after verified payment and not before service/performance when a canonical service date exists;
- refund/cancellation/chargeback behavior follows the Decision Sheet while Financial retains monetary reversal authority;
- Financial materialization is allowed only for `earned` entitlement plus Financial-eligible beneficiary;
- raw referral evidence retention max 90 days, pseudonymous attribution/conversion 24 months and commercial/audit/reconciliation evidence five years after final closure/settlement, subject to jurisdiction/legal hold.

## Executable components

### Domain package

`packages/affiliates` includes:

- `ids.ts`: branded/bounded identifiers and digest/timestamp validation;
- `eligibility.ts`: account/program membership, suspension and materialization eligibility invariants;
- `attribution.ts`: referral evidence, precedence, expiry and lock semantics;
- `conversion.ts`: Ordering/Financial evidence boundary and conversion association;
- `commission.ts`: integer commission calculation, maturity, lifecycle and refund/reversal consequences;
- `materialization.ts`: Affiliate → Financial request/result/readback contract;
- `ports.ts`: authorization, evidence, persistence, idempotency, audit and Financial ports;
- `events.ts`: versioned Affiliate event family;
- acceptance/unit tests for policy, attribution and commission invariants.

### Server/runtime

`services/affiliates` includes:

- authenticated Affiliate HTTP transport;
- Identity/membership application service and durable MySQL schema;
- eligibility/suspension gate with row locking;
- referral/attribution application service with server-owned identifiers, semantic idempotency and per-subject serialization;
- conversion/commission application service with transactional entitlement revisions;
- durable materialization adapter/readback/retry behavior;
- Privacy/LGPD service and integration acceptance;
- MySQL repositories for identity, referral, attribution, conversion, entitlement, materialization, idempotency, audit and outbox;
- browser monetary-authority guards;
- real MySQL integration tests for Privacy, Identity/Suspension, Attribution and Commercial behavior.

## Domain records

### Affiliate account and membership

Affiliate stores opaque Affiliate IDs plus canonical Identity references rather than duplicating credentials or identity documents. Membership is program-scoped and independent from Business roles. Lifecycle and invalid transitions are enforced server-side and audited.

### Referral evidence and attribution

Only accepted/validated evidence may establish attribution. Authoritative IDs, fingerprint and timestamps are server-owned. Evidence uses SHA-256 digesting and a pseudonymous `AcquisitionSubjectId`.

Attribution applies policy precedence and 30-day server-clock expiry. A canonical Order lock at `pending_payment` prevents later referral evidence from hijacking an already locked attribution. Subject mutation is serialized to prevent concurrent precedence races.

### Conversion association

A conversion requires a previously locked valid attribution, canonical Ordering evidence with status `payment_confirmed`, verified Financial evidence and an initial-purchase conversion kind. Browser callback/analytics state cannot qualify a conversion.

Persistence enforces one canonical conversion per Order and fails closed on divergent replay or conflicting evidence.

### Commission entitlement

Entitlement stores Affiliate/program/conversion/attribution identity, policy version, immutable revision history, commercial status, eligible-revenue snapshot, commission minor units, currency, 3000-bps policy snapshot and maturity timestamp.

Calculation uses integer/`BigInt` arithmetic with final half-up rounding. Floating-point percentage authority is prohibited.

Pending partial refund reprices the commercial entitlement from authoritative Financial evidence. Post-earned refund produces an audited reversal consequence/revision while Financial remains responsible for monetary reversal. Concurrent maturity/refund/reversal paths serialize on the entitlement row.

## Public port boundaries

`AffiliateOrderingEvidencePort` reads canonical Order evidence only.

`AffiliateFinancialEvidencePort` reads verified payment/conversion and eligible-revenue evidence only.

`AffiliateFinancialMaterializationPort` receives `AffiliateFinancialMaterializationRequestV1` with only:

- request ID;
- entitlement ID/revision;
- Affiliate ID;
- conversion-association ID;
- policy version;
- entitlement digest;
- correlation ID.

It deliberately contains no browser-controlled amount, rate, currency, payout destination, provider credential, ledger posting, payable/wallet or settlement instruction.

Financial independently resolves and validates monetary consequence. `accepted` means request acceptance only, never payment/payout/settlement/transfer completion. Durable readback resolves uncertain delivery before retry; conflicting readback fails closed.

## Idempotency and concurrency

Mutation identity follows canonical immutable semantic inputs. Durable claims are acquired atomically.

- exact replay returns the original persisted semantic outcome;
- a reused key/request identity with divergent semantic digest fails closed;
- referral/attribution uses per-subject serialization plus DB locking;
- eligibility is re-read under lock for authoritative mutations;
- one Order cannot create multiple authoritative conversions;
- entitlement maturity/refund/reversal mutations serialize by entitlement row/revision;
- materialization retry consults durable local and Financial readback before a new request.

## Authorization

- public/browser callers cannot perform authoritative monetary/commercial mutations;
- Affiliate self-service requires canonical Identity ownership;
- platform admin operations require explicit Affiliate capability;
- Business/tenant roles do not inherit Affiliate administration;
- destination/program mismatch fails closed;
- Affiliate → Financial calls use authenticated service authority and Financial independently reauthorizes/validates the request.

## Audit and events

Authoritative mutations append immutable audit containing actor, authorization decision reference, Affiliate/subject, policy/contract version, before/after or semantic digest, idempotency, correlation/causation, server time, outcome and reason.

Durable outbox/event evidence covers:

- `AffiliateReferralEvidenceRecorded`;
- `AffiliateAttributionEstablished`;
- `AffiliateConversionAssociated`;
- `AffiliateCommissionEntitlementChanged`;
- `AffiliateFinancialMaterializationRequested`.

Historical labels such as `CustomerAttributedToAffiliate` and `AffiliateCommissionAccrued` are not authoritative executable contracts.

## Privacy/LGPD

Identity remains owner of canonical PII. Affiliate persists stable references and minimized evidence/digests.

The executable privacy service proves:

- retention windows and idempotent execution;
- DSR subject lookup with isolation;
- anonymization/pseudonymization;
- legal hold preservation;
- audit and restart-safe execution.

Secrets, raw referral tokens/full URLs, copied identity documents and provider credentials are forbidden in audit/observability.

## Acceptance evidence

The integrated certified tree proves:

- domain policy tests: PASS;
- authenticated server tests: PASS;
- real MySQL Privacy, Identity/Suspension, Attribution and Commercial suites: PASS;
- exact/divergent replay behavior: PASS;
- suspension/referral behavior and historical replay: PASS;
- concurrent attribution serialization: PASS;
- `maturity × refund` race: PASS;
- `partial refund × full refund` race: PASS;
- materialization restart/readback/retry/conflict behavior: PASS;
- browser monetary-authority rejection: PASS;
- canonical Quality Gate and MySQL matrix: PASS;
- Render staging blueprint contract: PASS.

## Release invariants

1. Affiliate source does not import Business/Ordering/Financial implementations or service internals.
2. Browser-controlled monetary values cannot create entitlement/Financial state.
3. Every authoritative mutation is authorized, durable-idempotent and audited.
4. Ordering/Financial evidence crosses public/versioned ports only.
5. One Order cannot create multiple authoritative Affiliate conversions.
6. Financial may reject materialization without Affiliate mutating monetary state.
7. Materialization `accepted` is not payout/settlement.
8. Refund/reversal is explicit and audit-preserving.
9. Suspended/ineligible operations fail closed while required history is preserved.
10. Rollback never deletes Financial history or transfers monetary authority to Affiliate.

## Promotion gate

The implementation is eligible for `equivalent` because the required executable evidence exists on a tree identical to integrated `main`. The final documentation reconciliation itself must still pass Quality Gate and Affiliates FEATURE-0010 Contract on one exact head before merge.
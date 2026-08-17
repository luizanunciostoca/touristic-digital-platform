# Affiliates Technical Contract — FEATURE-0010

## Status

This is the policy-neutral technical contract for `FEATURE-0010`.

Canonical checkpoint: `main@ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`.

`FEATURE-0010` remains `planned` and `MIG-0011` remains `discovered`. This document does not authorize runtime behavior, persistence, APIs, UI, commission calculation or Financial mutation. It fixes the boundaries and invariants that do not depend on commercial policy so implementation can begin only after the Decision Sheet is approved.

The contract is intentionally not registered in `docs/contracts/registry.json`: that registry is for executable canonical contracts with schema/runtime/evidence. Affiliate executable schemas must not be registered before their decision-gated fields are approved.

## Non-negotiable ownership invariants

1. Affiliate is a platform domain, separate from Business, Ordering and Financial.
2. Affiliate owns affiliate identity/program semantics, referral evidence, attribution, conversion association and commercial commission entitlement evidence.
3. Ordering remains authoritative for order identity and order state.
4. Financial remains authoritative for Payment, ledger, allocation, payable, wallet/financial position, settlement, transfer/payout, reconciliation and monetary reversals.
5. Affiliate never writes Financial persistence directly.
6. Browser state, redirect parameters, query strings, cookies or local storage are untrusted evidence only; none can create authoritative conversion or commission state.
7. No rate, formula, attribution duration, precedence rule, lifecycle transition or refund consequence is implicit.
8. Business and tenant membership do not confer Affiliate administration or commission authority.
9. Cross-domain communication uses public versioned ports, records or `PLATFORM-EVENT-ENVELOPE` events.
10. Exact replay converges; divergent replay with the same idempotency key fails closed.

## Conceptual schemas

These are conceptual aggregates, not database migrations. Fields marked decision-gated must remain absent from executable persistence until approved.

### Affiliate identity concept

Required policy-neutral fields:

- `affiliateId`: opaque server-generated stable identifier;
- `identityReference`: reference to canonical Identity, without copying credentials or identity PII;
- `createdAt`, `updatedAt`;
- `recordVersion` for optimistic concurrency;
- audit/correlation metadata.

Decision-gated fields:

- identity cardinality and ownership model;
- eligibility semantics;
- suspension semantics;
- any destination/program scope derived from product policy.

### Referral evidence concept

Required policy-neutral fields:

- `evidenceId`: opaque server-generated identifier;
- `affiliateId` candidate reference;
- `evidenceFingerprint`: SHA-256 digest of the canonicalized evidence input;
- `sourceContractVersion`;
- `observedAt` when supplied by an approved source;
- `receivedAt` from the server clock;
- `correlationId` and `causationId` when available;
- retention-policy reference, without a hard-coded duration.

Decision-gated fields:

- accepted source types;
- trust/signature requirements;
- source precedence;
- source-specific replay identity;
- whether raw evidence is retained at all.

Raw browser payload is never itself an authoritative record.

### Attribution concept

Required policy-neutral fields:

- `attributionId`;
- `affiliateId`;
- `subjectReference` as a typed opaque canonical reference;
- accepted evidence references/digests;
- `policyVersion`;
- server timestamps;
- `recordVersion`;
- audit/correlation metadata.

Decision-gated fields:

- subject kind;
- precedence/conflict rules;
- window start/expiry/reset behavior;
- replacement versus coexistence semantics.

### Conversion association concept

Required policy-neutral fields:

- `conversionAssociationId`;
- `attributionId`;
- `affiliateId`;
- canonical `orderId` when Ordering is involved;
- `qualifyingConversionReference` carrying type and contract version, but no assumed qualifying event;
- canonical Financial evidence reference when the approved conversion contract requires financial proof;
- server association timestamp;
- audit/correlation metadata.

A click, redirect or browser callback cannot satisfy `qualifyingConversionReference`.

### Commission entitlement concept

Required policy-neutral fields:

- `entitlementId`;
- `affiliateId`;
- `attributionId`;
- `conversionAssociationId`;
- `policyVersion`;
- immutable policy snapshot digest;
- immutable calculation-input digest;
- `recordVersion`;
- audit/correlation metadata.

Decision-gated and therefore intentionally undefined:

- commission base;
- fixed versus percentage model;
- rate;
- rounding;
- caps;
- currency behavior;
- effective dates;
- lifecycle state values/transitions;
- refund/cancellation effects;
- monetary materialization timing.

No monetary amount may be inferred merely because this conceptual record exists.

## Public port boundaries

The names below reserve responsibility, not executable implementation.

```ts
export interface AffiliateOrderingEvidencePort {
  findOrder(orderId: string): Promise<Readonly<{
    id: string;
    status: string;
    sourceKind: string;
    updatedAt: string;
  }> | null>;
}

export interface AffiliateFinancialEvidencePort {
  findFinancialEvidence(reference: string): Promise<Readonly<{
    reference: string;
    kind: string;
    version: number;
    verified: boolean;
    observedAt: string;
  }> | null>;
}

export interface AffiliateFinancialMaterializationRequestV1 {
  readonly requestId: string;
  readonly entitlementId: string;
  readonly entitlementRevision: string;
  readonly affiliateId: string;
  readonly conversionAssociationId: string;
  readonly policyVersion: string;
  readonly entitlementDigest: string;
  readonly correlationId: string;
}

export type AffiliateFinancialMaterializationResultV1 =
  | Readonly<{
      status: "accepted";
      financialReference: string;
      replayed: boolean;
    }>
  | Readonly<{
      status: "rejected";
      code: string;
      retryable: boolean;
      replayed: boolean;
    }>;

export interface AffiliateFinancialMaterializationPort {
  requestMaterialization(
    request: AffiliateFinancialMaterializationRequestV1,
  ): Promise<AffiliateFinancialMaterializationResultV1>;
}
```

The request deliberately carries no browser-controlled amount, rate, payout destination, ledger posting or settlement instruction. When executable policy exists, Financial must resolve and independently validate the approved entitlement snapshot plus authoritative Ordering/Financial evidence before any monetary effect.

`accepted` means only that Financial accepted the materialization request under its own idempotency and invariants. It does not mean paid, settled or transferred.

## Canonical event families

The following event names are reserved as the required future event family. They are not executable until payload schemas are approved, registered and tested with `PLATFORM-EVENT-ENVELOPE`.

Affiliate-owned:

- `AffiliateReferralEvidenceRecorded`;
- `AffiliateAttributionEstablished`;
- `AffiliateConversionAssociated`;
- `AffiliateCommissionEntitlementChanged`;
- `AffiliateFinancialMaterializationRequested`.

Financial-owned responses/projections:

- `AffiliateFinancialMaterializationAccepted`;
- `AffiliateFinancialMaterializationRejected`.

Historical architecture labels `CustomerAttributedToAffiliate` and `AffiliateCommissionAccrued` are not executable contracts and must not be emitted by new runtime.

Every executable Affiliate event must declare owner, schema version, producer, consumers, correlation/causation IDs, retry policy, idempotency identity, retention classification and personal-data classification. Event payloads must use stable IDs and digests rather than raw referral URLs, credentials or copied identity PII.

## Idempotency strategy

### Canonical key form

Future mutation keys use:

```text
affiliate:v1:<operation>:<sha256(canonical immutable inputs)>
```

The canonical digest includes only immutable server-normalized references, relevant contract/policy versions and accepted evidence digests. It must not depend on object key order, local timezone formatting or mutable browser state.

### Operation identities

- evidence intake: approved source contract identity plus stable source evidence identity/fingerprint;
- attribution: subject reference plus accepted evidence digest plus attribution-policy version;
- conversion association: canonical conversion reference plus attribution ID plus qualifying-conversion contract version;
- entitlement: conversion-association ID plus affiliate ID plus commission-policy version;
- Financial materialization: entitlement ID plus immutable entitlement revision/digest.

### Replay behavior

- exact replay returns the original semantic result and `replayed: true` where exposed;
- same idempotency key with different canonical input fails closed and emits an audit/security observation;
- in-flight concurrency must be serialized by a durable unique claim or compare-and-swap, not an in-memory lock;
- retries after uncertain cross-domain delivery query durable state before another side effect;
- idempotency records outlive the retry horizon and follow the approved retention policy.

## Audit contract

Every Affiliate state-changing operation must append an immutable audit record with at least:

- `auditId`;
- operation name and contract version;
- actor kind and canonical actor reference;
- authorization decision reference;
- affiliate ID when applicable;
- affected subject/entity IDs;
- policy/contract versions;
- previous and next state digests when a mutation occurs;
- idempotency key digest;
- correlation ID, causation ID and triggering event ID when applicable;
- server timestamp;
- outcome (`accepted`, `rejected`, `replayed`, `conflict` or `failed`);
- machine-readable reason code.

Audit records must not contain secrets, raw tokens, full referral URLs, provider credentials or copied identity documents. Audit is distinct from mutable operational logs and from Financial ledger history.

## Authorization boundaries

- All authoritative Affiliate mutations are server-side.
- Public/browser referral input, if later enabled, enters as untrusted evidence and cannot directly create attribution, conversion, entitlement or Financial materialization.
- Affiliate self-service reads are disabled until affiliate identity ownership is approved and can be proven from canonical Identity.
- Admin operations require explicit platform/admin authorization; tenant membership alone is insufficient.
- Business Portal cannot administer affiliates.
- Financial materialization is service-to-service and accepted only from an authenticated Affiliate service principal through a Financial-owned port.
- Financial independently authorizes and validates every materialization request.
- No Affiliate capability grants direct database, provider SDK, payout, wallet or settlement access.
- Cross-destination or cross-affiliate reads fail closed unless an explicit platform authorization contract exists.

Exact scope names are an implementation detail to be defined with the Auth capability registry; they are not a commercial decision and must follow least privilege.

## Privacy and LGPD requirements

The implementation must enforce:

- purpose limitation: referral evidence is collected only for approved attribution/commission purposes;
- data minimization: persist stable IDs/digests instead of raw URLs, headers, IPs or device identifiers whenever possible;
- separation: Identity remains owner of identity PII; Affiliate stores references rather than copies;
- configurable retention: duration is policy-driven and must not be compiled into code;
- data-subject handling: lookup/export/deletion or anonymization flows must be possible where legally applicable;
- legal/audit holds: deletion must not corrupt required immutable Financial or compliance evidence;
- sanitized analytics/observability: no raw referral token or direct PII in logs, metrics or traces;
- access logging for privileged reads of Affiliate evidence;
- encryption in transit and at rest through platform infrastructure controls;
- documented lawful basis/notice before collecting any new personal-data category.

The concrete retention duration remains a Decision Sheet item.

## Migration plan

### Phase 0 — completed by this PR

- canonical ownership and non-goals;
- conceptual schemas;
- ports and event families;
- idempotency/audit/security/privacy contracts;
- test strategy;
- threat model;
- rollout/rollback plan;
- explicit commercial Decision Sheet.

No runtime or migration is created.

### Phase 1 — policy freeze

After the Decision Sheet is approved, record one versioned Affiliate policy contract/ADR. Any still-unknown field remains fail-closed and cannot receive a default.

### Phase 2 — expand-only domain foundation

Create `@touristic/affiliates` domain types, normalizers, invariants and durable tables with additive migrations. Add repositories and idempotency/audit claims. No UI and no Financial side effect.

### Phase 3 — canonical evidence and association

Add read-only Ordering/Financial adapters and event consumers. Validate durable attribution/conversion association under the approved policy. Keep Financial materialization disabled.

### Phase 4 — Financial handoff

Implement the versioned Affiliate → Financial port on the Financial side. Start disabled/dark, validate accepted/rejected/replay behavior and prove no Affiliate-owned monetary persistence.

### Phase 5 — read APIs and projections

Expose authenticated Affiliate/admin reads only after authorization and privacy tests pass. Financial position remains a Financial-owned projection.

### Phase 6 — browser/admin surfaces

Add UI last. Browser remains a presentation/input layer without commission authority.

## Invariants to turn into executable tests

1. No Affiliate code imports Financial persistence or provider adapters.
2. No browser-controlled amount/rate/affiliate ID can directly create entitlement or Financial state.
3. Every authoritative mutation requires durable idempotency and audit.
4. Exact replay converges; divergent replay fails.
5. Ordering/Financial evidence is read through public boundaries only.
6. No commission entitlement can be materialized without a versioned policy snapshot and conversion evidence.
7. Financial may reject a materialization request without mutating ledger/payable/settlement state.
8. `accepted` materialization is not equivalent to payout/settlement.
9. Refund/cancellation evidence cannot be silently ignored once the approved lifecycle says it changes entitlement.
10. Suspended/ineligible behavior must remain undefined/fail-closed until approved, never guessed.
11. Retention is configurable and testable; raw evidence is minimized.
12. Rollback never deletes Financial history or reassigns monetary authority to Affiliate.

## Runtime gate

Runtime creation is blocked until all 19 items in `AFFILIATES-DECISION-SHEET.md` are approved and versioned. Once approved, implementation may begin from Phase 2 without reopening the ownership, idempotency, audit, authorization, LGPD, threat-model or rollback boundaries defined here.

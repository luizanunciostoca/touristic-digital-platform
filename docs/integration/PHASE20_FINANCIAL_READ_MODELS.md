# Phase 20/21 — Financial read-model integration lane

## Scope and frozen inputs

- Product: `luizanunciostoca/touristic-digital-platform`
- Phase 19 base branch: `integration/phase19-real-product-baseline-20261001`
- Frozen base SHA: `37eb641eefa91f57d8d74c1dc87894c2da36f3ae`
- Lane branch: `integration/phase20-financial-read-models-20261001`
- Certified laboratory reference only: `luizanunciostoca/morro-integration-lab@cfefe89bf5b3d6ffbc4a83fc76842f245330a900`

This lane turns the Phase 16 reference semantics into a product-side Financial
read-projection boundary. It does not copy the laboratory repository or use it
as Git ancestry.

## Authority invariant

Financial remains the only authority for:

- payment truth;
- ledger;
- payable;
- settlement;
- payout;
- refund final state;
- reconciliation;
- money movement;
- verified monetary outcome.

Affiliate remains the owner of commercial commission-entitlement evidence only.
An Affiliate entitlement or an accepted materialization request is never
interpreted as paid, settled, transferred, refunded, or payout-complete without
Financial evidence.

The projection boundary contains no ledger append, payout creation, settlement
creation, refund command, provider call, or client-authoritative aggregation.

## Reconciled interface contracts

| Interface | Phase 20 classification | Owner approval | Versioned contract approval | Lane result |
|---|---|---:|---:|---|
| IF-BIZ-012 | `EXISTING_FINANCIAL_MODEL_NEEDS_ADAPTER` | false | false | Product-side read projection and authorization semantics implemented; concrete canonical Business→Financial query binding remains shared/integration work. |
| IF-AFF-011 | `VERSIONED_FINANCIAL_PROJECTION_REQUIRED` | false | false | Candidate statement projection preserves Affiliate commercial vs Financial monetary ownership; not promoted to an approved canonical contract. |
| IF-AFF-012 | `VERSIONED_FINANCIAL_PROJECTION_REQUIRED` | false | false | Candidate payout/settlement history projection is read-only and Financial-authoritative; not promoted to an approved canonical contract. |
| IF-CTL-014 | `EXISTING_FINANCIAL_MODEL_NEEDS_ADAPTER` | false | false | Candidate GET refund projection separates request acceptance from verified refund final state; existing refund mutation path is untouched. |
| IF-CTL-015 | `VERSIONED_FINANCIAL_PROJECTION_REQUIRED` | false | false | Candidate composite projection labels Affiliate commercial entitlement and Financial monetary outcome separately; not promoted to an approved canonical contract. |

## Product-side boundary

`services/financial/src/financial-read-projections.ts` provides:

- explicit authenticated actor input supplied by the trusted server boundary;
- stale/revoked session rejection;
- capability checks;
- tenant, business, affiliate, and platform-scope checks before repository access;
- deterministic cursor pagination;
- integer minor-unit and three-letter currency validation;
- normalized Financial projection states;
- provider-reference redaction;
- five read methods corresponding to the reconciled interfaces;
- a composable HTTP adapter that accepts `GET` only and returns
  `FINANCIAL_READ_ONLY` for POST/PUT/PATCH/DELETE.

The HTTP adapter is deliberately **not mounted in a shared runtime file by this
lane**. Mounting it would require editing shared Control Tower/runtime
composition owned by the integration controller.

## Security and negative proofs

Focused tests cover:

- anonymous deny before repository access;
- stale/revoked auth deny before repository access;
- wrong tenant deny;
- wrong business deny;
- wrong affiliate deny;
- Business vs Affiliate capability separation;
- Control Center platform-scope requirement;
- Control Center commission view requiring both Affiliate and Financial read capability;
- integer minor units;
- currency integrity;
- accepted vs settled/refunded semantics;
- no provider reference exposure;
- no browser/client authoritative totals;
- GET-only transport;
- no Financial mutation/provider call token in the projection implementation.

Fixtures are synthetic only. No staging, production, Render, external payment
provider, production credential, or production data is used.

## Why concrete repository binding is not fabricated

The frozen product Financial persistence exposes safe primitive reads such as
payment-by-id, refund-request-by-payment, allocation/payable/settlement-by
Financial identifiers, and ledger readback. It does **not** expose all of the
cross-domain scoped list contracts required to truthfully implement these five
presentation projections:

- no canonical business+tenant → Financial payment-history query is exposed;
- no approved Affiliate statement projection exists;
- no approved Affiliate-beneficiary payout-history projection exists;
- no tenant-scoped refund-history list contract exists;
- no approved composite commission contract exists.

Creating cross-schema joins, new ownership, or unapproved public endpoints in
this lane would violate the Phase 20 governance. The lane therefore provides
the typed read boundary and leaves the missing shared binding fail-closed.

## CONTROL_TOWER_SHARED_PATCH_REQUIRED

1. Mount the GET-only Financial projection adapter in the shared server/runtime
   composition after lane convergence.
2. Supply concrete repository bindings only from canonical owner-approved
   read ports and approved scoped indexes/queries.
3. For IF-AFF-011, IF-AFF-012, and IF-CTL-015, keep route publication disabled
   until a versioned cross-domain projection contract is explicitly approved.
4. Do not change the existing Financial mutation authority, Commerce/Ticketing
   ownership, global CI, or global proof graph as part of that shared patch.

## Release posture

This branch is integration-candidate code only. It authorizes no merge,
staging, production, Render operation, provider call, or production-money
activity.

# Affiliates Canonical Scope — FEATURE-0010

## Status and decision

`FEATURE-0010 — Programa de Afiliados` remains `planned` and `MIG-0011` remains `discovered`.

The repository contains enough architecture to identify the domain owner and its allowed dependencies, but not enough approved product policy to implement attribution, commission persistence, Financial materialization, APIs or browser/admin surfaces without inventing business rules.

This document therefore closes the canonical discovery boundary only. It does not authorize runtime implementation.

## Sources reconciled

The decision is based on the canonical repository sources available on `main`:

- `docs/features/registry.json`;
- `docs/migration/MASTER-MIGRATION-TRACKER.md`;
- `docs/product-architecture/DOMAIN-MAP.md`;
- `docs/product-architecture/MODULE-CONTRACTS.md`;
- `docs/product-architecture/CAPABILITY-MATRIX.md`;
- `docs/product-architecture/PRODUCT-ROADMAP.md`;
- `docs/product-architecture/FEATURE-LIFECYCLE.md`;
- `packages/ordering/src/index.ts`;
- `packages/financial/src/settlement.ts`;
- `docs/qa/PAYMENTS-M146-EVIDENCE.md`.

No `packages/affiliates`, `services/affiliates`, Affiliate-specific migration baseline, Affiliate-specific contract schema, Affiliate branch or Affiliate implementation pull request existed at the discovery checkpoint.

## Canonical ownership

### Affiliate

Affiliate owns the commercial program semantics that are independent from money movement:

- platform-level affiliate identity;
- referral and attribution evidence;
- attribution association;
- conversion association to canonical records;
- commercial commission entitlement and its evidence;
- non-financial commission lifecycle once that lifecycle is approved;
- audit metadata for Affiliate-owned decisions;
- Affiliate idempotency keys and replay semantics.

Affiliate is a platform domain. It does not belong to a seller, tenant or Business workspace.

### Business

Business does not administer the affiliate program and does not determine Affiliate commission authority. A Business record may be referenced by canonical Ordering/Catalog records where normal commerce requires it, but Business is not the owner of affiliate attribution, commission or settlement.

### Ordering

Ordering is the canonical source for order identity and order state. Affiliate may consume a versioned Ordering event or read contract to associate a previously valid attribution with a real order.

Affiliate must never infer a conversion from a click, redirect, query string, local storage marker or browser callback alone.

### Financial

Financial remains the only financial source of truth.

Financial owns:

- Payment authority;
- ledger entries;
- allocation conservation;
- payables;
- wallet/balance authority;
- settlements;
- provider transfer commands and verified read-back;
- payout execution;
- financial reversals and reconciliation.

Affiliate may eventually provide an approved commercial commission entitlement to a versioned Financial boundary. Financial must independently validate the authoritative Payment/order identity, amount, currency, reconciliation state and any other Financial invariant before creating or changing a monetary record.

Affiliate must not create a Payment, write a ledger, create a payable, mark a settlement as paid, execute a payout or directly mutate Financial persistence.

## Minimum domain concepts

The following concepts are required before runtime implementation, but their final schemas are intentionally not invented here.

### Affiliate identity

A platform-level identity representing the affiliate program participant. The repository does not yet specify onboarding, eligibility, legal identity, destination scope, suspension rules or whether one Identity user may control multiple affiliate identities.

### Referral and attribution evidence

Durable server-side evidence that a referral occurred. The repository does not yet approve the accepted evidence sources, signature/trust model, source priority, replay policy or privacy retention rules.

Browser-provided affiliate identifiers can be input evidence only after server validation; they cannot be commission authority by themselves.

### Attribution

A durable association between an approved affiliate identity and an approved attribution subject. The exact subject is not yet approved: customer identity, anonymous acquisition identity, session, device-safe token or another server-side acquisition identifier all remain product/architecture decisions.

### Attribution window

`CAP-0018` requires expiry testing, which proves that attribution expiry is expected, but no canonical duration, renewal rule, precedence rule or clock boundary is specified.

No duration is implemented or assumed by this decision.

### Conversion association

A conversion can only be associated from canonical commerce records. At minimum, it must reference canonical Ordering identity and financial evidence when payment is required.

The exact qualifying conversion event is not yet approved. `OrderPlaced`, payment approval, payment confirmation, booking confirmation and later refund/cancellation interactions have materially different commission consequences and cannot be treated as interchangeable.

### Commission entitlement

Affiliate may own the commercial fact that an affiliate is entitled to a commission under an approved, versioned policy snapshot.

The repository does not yet define:

- rate or formula;
- fixed versus percentage commission;
- base amount;
- rounding;
- caps/floors;
- destination or campaign overrides;
- tax treatment;
- currency behavior;
- eligibility timing;
- refund/cancellation/dispute rules;
- policy versioning and effective dates.

Until these rules are approved, no commission amount may be calculated or persisted as monetary authority.

### Commission state

A final commission state machine is not approved. The lifecycle must explicitly define eligibility, earning/accrual semantics, reversal, cancellation, dispute and Financial handoff before code is created.

Financial settlement state must never be copied into an Affiliate-owned state machine as if Affiliate owned payout authority.

### Audit and idempotency

All future Affiliate mutations must be server-side, auditable and idempotent. Required keys must bind the operation to canonical identities and a policy/evidence version so exact replay converges and divergent replay fails closed.

The exact key formats and retention requirements remain part of the future executable contract.

## Financial settlement adapter boundary

The existing Financial settlement model already provides the monetary boundary that Affiliate must reuse instead of duplicating it.

A future Affiliate-to-Financial adapter may submit only an approved, versioned entitlement/materialization command. It must not submit browser-controlled amounts as authority.

Financial must remain responsible for turning any accepted commercial entitlement into Financial allocation/payable/settlement records under its own invariants. Existing Financial behavior already requires persisted Payment authority, verified result, deterministic ledger evidence, clean reconciliation and amount/currency conservation before allocation becomes active.

No Affiliate settlement adapter is implemented until the commission policy and command contract are approved.

## Runtime work deliberately not implemented

The following work is deliberately blocked:

- `packages/affiliates` domain code;
- Affiliate persistence and migrations;
- application services;
- event consumers/producers;
- commission calculation;
- Financial materialization adapter;
- authenticated Affiliate APIs;
- admin APIs or CRM integration;
- Affiliate browser/portal surfaces;
- redirect/click conversion inference;
- wallet implementation;
- payout implementation.

Creating any of those now would require a business rule or authority contract that is not present in the repository.

## Required decisions before `READY`

FEATURE-0010 cannot enter implementation until all of the following are approved and versioned:

1. affiliate identity/onboarding/eligibility model;
2. accepted referral evidence sources and trust model;
3. attribution subject and conflict/precedence rules;
4. attribution window duration and expiry/renewal semantics;
5. qualifying conversion event and relationship to Ordering/Financial states;
6. commission formula, base, rounding, caps, currency and policy versioning;
7. commission state machine including refund/cancellation/dispute/reversal;
8. Affiliate-to-Financial materialization command and Financial rejection semantics;
9. authorization/RBAC for operations and future admin/affiliate reads;
10. privacy/retention requirements for referral evidence;
11. metrics, observability, rollback and release criteria.

After those decisions exist, implementation should proceed in the required order: domain contracts, persistence, application boundary, canonical event/record integration, Financial adapter, authenticated APIs, browser/admin surfaces, then validation and release evidence.

## Completion condition

FEATURE-0010 may be considered complete only when its approved capability matrix has no unresolved GAP/PARTIAL rows, server-side attribution and commission entitlement are durable and idempotent, conversion is proven from canonical Ordering/Financial evidence, Financial exclusively owns every monetary mutation and payout, authorization/audit/privacy requirements are validated, and the permanent Quality/integration/security gates are green on one release-candidate head.

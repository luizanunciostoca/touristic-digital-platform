# Phase 20/21 — Lane C: Commerce + Ticketing + Affiliates

Base product SHA: `37eb641eefa91f57d8d74c1dc87894c2da36f3ae`

Reference lab SHA: `cfefe89bf5b3d6ffbc4a83fc76842f245330a900`

This directory is an integration-candidate proof surface only. It is intentionally not wired into production runtime, routes, global CI, the global proof graph, or any money-moving system.

## Authority boundaries

- Financial remains the only owner of money truth, ledger, payment truth, payable, settlement, payout, refund final state, reconciliation, and verified monetary outcome.
- Affiliates remains the attribution/reference owner.
- Ticketing and Commerce remain lifecycle owners of their existing canonical domains.
- This lane creates no alternative domain authority.
- Candidate execution is restricted to `executionMode=LOCAL_PROOF`.
- External provider calls are forbidden.

## Revalidated blocked interfaces

| Interface | Classification | Required decision |
|---|---|---|
| IF-COM-005 | VERSIONED_CONTRACT_REQUIRED | TransportTicketV1 |
| IF-COM-006 | NEW_CANONICAL_CAPABILITY_REQUIRED | LodgingReservationV1 + owner decision |
| IF-BIZ-010 | VERSIONED_CONTRACT_REQUIRED | BusinessReservationProjectionV1; Lane B owns Business |
| IF-AFF-002 | VERSIONED_CONTRACT_REQUIRED | AffiliateSelfOnboardingV1 |
| IF-AFF-006 | VERSIONED_CONTRACT_REQUIRED | AffiliateReferralQrArtifactV1 |

For every entry:

- `ownerApproved=false`
- `versionedContractApproved=false`
- `runtimeBindingEnabled=false`
- `productionAuthorized=false`

No interface is promoted to PASS by this lane.

## Safe infrastructure added

The lane-local proof code validates:

- explicit PREPARE -> CONFIRM -> EXECUTE;
- active authentication and stale/revoked authorization handling;
- Origin and CSRF;
- capability guards;
- tenant, business, and destination scope;
- semantic-digest idempotency;
- conflicting-key rejection;
- replay and in-flight protection;
- bounded retry for transient database lock/deadlock errors;
- durable local SQLite evidence across process/store restart;
- concurrent duplicate claim arbitration;
- Affiliate QR derivation only from a server-issued, signature-verified referral URL descriptor;
- rejection of financial-authority payload/result fields;
- zero network/provider client dependencies.

SQLite is used only as disposable local evidence storage. It contains no canonical order, ticket, affiliate attribution, payment, commission, payout, settlement, refund, or production data.

## Focused gates

Run from repository root:

```sh
node --test tooling/integration/phase20-commerce-ticketing-affiliates/tests/*.test.mjs
pnpm --filter @touristic/commerce test
pnpm --filter @touristic/ticketing test
pnpm --filter @touristic/ticketing-server test
pnpm --filter @touristic/affiliates test
pnpm --filter @touristic/affiliates-server test
```

No global workflow or root shared file is changed by this lane.

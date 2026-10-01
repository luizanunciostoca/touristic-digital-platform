# Phase 20 — Growth / Gamification canonicalization lane

**Lane:** E
**Branch:** `integration/phase20-growth-canonicalization-20261001`
**Base:** `integration/phase19-real-product-baseline-20261001`
**Frozen base SHA:** `37eb641eefa91f57d8d74c1dc87894c2da36f3ae`
**Lab reference:** `luizanunciostoca/morro-integration-lab@cfefe89bf5b3d6ffbc4a83fc76842f245330a900`

Status: **candidate-only / feature-off / no production authority / no runtime mount**.

## Scope integrated

This lane adds a bounded Growth candidate kernel to the real product source tree at:

- `apps/morro-digital-platform/src/runtime/growth-candidate.ts`
- `apps/morro-digital-platform/src/runtime/growth-candidate.test.ts`

The kernel is compiled and tested with the existing Morro Digital app workspace, but it is intentionally not imported by the runtime bootstrap, not mounted behind HTTP routes, and not connected to a production database or external provider.

The safe subset implements:

- exact Phase 17 classification retention;
- `ownerApproved=false`, `versionedContractApproved=false`, and `productionAuthority=false`;
- feature flags default-off;
- tenant/destination scope guards;
- server-owner-adapter evidence validation;
- explicit denial of browser/assistant/client authority minting;
- deterministic IDs;
- semantic-digest idempotency and replay-conflict rejection;
- typed **candidate-only** events for IF-GRW-004, IF-GRW-005, and IF-GRW-008;
- non-monetary badge and collection state;
- advisory deterministic next-best-action ordering;
- snapshot/restore port semantics for rebuildable, non-authoritative persistence;
- recursive rejection of money, canonical order/ticket, and affiliate-attribution authority fields;
- zero external provider bindings.

## Phase 17 classifications preserved

| Contract | Classification |
| --- | --- |
| IF-AFF-013 | READY_WITH_ADAPTER |
| IF-GRW-001 | EXPERIMENTAL_ONLY |
| IF-GRW-002 | NEEDS_AUTHORIZATION_MODEL |
| IF-GRW-003 | NEEDS_VERSIONED_CONTRACT |
| IF-GRW-004 | CANONICALIZATION_READY |
| IF-GRW-005 | CANONICALIZATION_READY |
| IF-GRW-006 | FINANCIAL_BOUNDARY_BLOCKED |
| IF-GRW-007 | READY_WITH_ADAPTER |
| IF-GRW-008 | CANONICALIZATION_READY |
| IF-GRW-009 | NEEDS_VERSIONED_CONTRACT |
| IF-GRW-010 | READY_WITH_ADAPTER |
| IF-GRW-011 | NEEDS_AUTHORIZATION_MODEL |
| IF-GRW-012 | READY_WITH_ADAPTER |
| IF-GRW-013 | NEEDS_PERSISTENCE |
| IF-GRW-014 | NEEDS_AUTHORIZATION_MODEL |

Counts remain:

- CANONICALIZATION_READY: 3
- READY_WITH_ADAPTER: 4
- NEEDS_VERSIONED_CONTRACT: 2
- NEEDS_PERSISTENCE: 1
- NEEDS_AUTHORIZATION_MODEL: 3
- FINANCIAL_BOUNDARY_BLOCKED: 1
- EXPERIMENTAL_ONLY: 1

No classification is promoted by this lane.

## Authority boundaries

Growth does **not** own or mint:

- payment, payout, commission, settlement, refund, currency, amount, price or other monetary truth;
- canonical order;
- canonical ticket;
- affiliate/referral attribution;
- owner-issued evidence.

Financial remains the only money-truth owner. Affiliates remains the attribution owner. Commerce/Ticketing remain lifecycle owners.

Browser, Assistant, and generic client surfaces are rejected as owner-evidence issuers. Only explicit `server_owner_adapter` evidence with `authority=owner-issued` can enter the candidate boundary.

## Persistence and rollback

No product schema migration is created in this lane. IF-GRW-013 remains `NEEDS_PERSISTENCE`.

The implemented persistence boundary is a rebuildable snapshot port only, marked `non-authoritative-projection`. It performs no destructive writes and requires no rollback of canonical owner data. Rollback is therefore code/flag removal only; canonical owner state is untouched.

## Explicitly not integrated

- no Growth production route;
- no Growth production DB/table;
- no reward economic value or redemption effect;
- no XP/Level canonical contract promotion;
- no challenge claim contract promotion;
- no mission/control-plane/risk-policy IAM model;
- no Affiliate attribution tables or qualification logic;
- no external or paid provider;
- no CI/proof-graph edits;
- no staging/production/Render changes.

## Focused verification

Required focused commands:

```bash
pnpm --filter @touristic/morro-digital-platform exec vitest run src/runtime/growth-candidate.test.ts
pnpm --filter @touristic/morro-digital-platform typecheck
pnpm --filter @touristic/morro-digital-platform lint
```

The final PR must stay draft against `integration/phase19-real-product-baseline-20261001` and must not be merged by this lane.

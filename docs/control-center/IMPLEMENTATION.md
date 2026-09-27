# Morro Digital Control Center — Implementation Ledger

## Canonical completion snapshot

- Master issue: #152
- Final reconciliation date: 2026-09-27
- Exact functional main certified: `9e6ccf15076838b18a2c90db788b1d26e970d577`
- Dedicated Control Center final qualification: PASS
- Final Release Acceptance: PASS
- Exact-SHA staging deployment: LIVE
- Exact-SHA production deployment: LIVE
- Real-money/provider effects remain separately governed and are not authorized by this ledger.

The historical GAP/PARTIAL labels from the original #152 plan were reconciled semantically against current main. The completion claim below means that the planned Control Center capability is implemented and verified; it does not authorize external providers, arbitrary financial effects, or direct-table bypasses.

## Architectural invariants

- Control Center never mutates another domain through direct table access.
- Domain owners retain persistence and mutation authority.
- PLATFORM_OWNER is maximum functional authority, never a security bypass.
- Authorization remains role + capability + scope.
- Support Mode preserves actor and effective-user identities.
- Financial remains monetary source of truth.
- Administrative audit is append-only from the UI/API perspective.
- Missing integration fails closed; no hidden SQL fallback is allowed.
- Unsafe Admin API methods are protected by durable outer rate limiting and durable replay/idempotency claims before owner execution.

## Final semantic classification

All #152 completion-matrix areas are `PRESENT_IN_MAIN` on the certified release identity:

- Dashboard;
- Universal Search;
- Businesses;
- Users;
- Affiliates;
- CRM;
- Products / Offers / Catalog;
- Reservations;
- Ticketing;
- Orders;
- Financial;
- Content;
- Destinations;
- Support Mode;
- Permissions;
- Audit;
- System Health;
- Responsive;
- Accessibility;
- Security;
- Browser E2E;
- dedicated staging acceptance.

## Dashboard breadth

The Home / Overview V1 is complete as an owner-authoritative cross-domain overview.

It renders the planned Empresas, Afiliados, Reservas Hoje, Receita Hoje and Alertas surfaces, destination summary, attention and recent activity. The model has executable coverage for global and destination scope, exact destination IDs, authorization filtering, large-number formatting, responsive behavior and prevention of cross-destination leakage.

A metric is only shown as an authoritative value when the relevant owner provides an authoritative aggregate. Paginated slices are never promoted to totals, global totals are not reused for destination scope and missing owner aggregates render as `partial` or `unavailable` rather than fabricated zeroes. That fail-closed behavior is the completed Dashboard contract, not a functional gap.

## Universal Search breadth

`/api/admin/v1/search` is a capability-gated orchestration endpoint. It searches configured Users and identity-backed Businesses and composes every registered owner adapter that exposes a search contract.

Current owner-backed search coverage includes:

- Affiliates;
- CRM leads;
- Products / offers;
- Reservations;
- Content;
- Financial Orders / Payments;
- Destinations.

The Control Center UI consumes this endpoint through the global search surface and preserves owner boundaries; no cross-domain table query was introduced. The exact-head search browser contract passed on the certified release.

## Business Admin breadth

The Business owner boundary and Control Center CMS cover the required administrative lifecycle without restoring historical V1 architecture:

- directory/list and detail;
- business/profile editing;
- governed creation;
- location;
- media upload/edit/delete/reorder;
- Product, Offer, Menu, Menu Category and Menu Item drafts;
- publication review/publish/suspend lifecycle;
- public read-model convergence;
- tenant denial;
- responsive browser flow;
- MySQL persistence and revision/publication semantics.

Money, inventory and Ticketing authority remain outside the browser and remain owned by their canonical domains.

## Admin mutation hardening

The Admin API has two outer, durable protections backed by Auth security state:

1. per-actor + admin-namespace mutation rate limiting;
2. per-actor idempotency/replay claims with canonical request fingerprints.

Exact replay and divergent reuse are rejected before the owner mutation executes. Raw idempotency keys are not persisted. Domain-owned idempotency remains authoritative and is not replaced.

## Qualification and release evidence

The final functional release `9e6ccf15076838b18a2c90db788b1d26e970d577` completed the dedicated Control Center exact-head qualification and Final Release Acceptance.

The same SHA was proven LIVE in staging and then production:

- staging deploy: `dep-daskvkd9fdbs73dtvso0`;
- production deploy: `dep-dasl0vvpn0mc738sme2g`;
- production build: 33/33 tasks successful;
- production runtime emitted `platform.runtime.started` with the exact release SHA and `listening=true`;
- production root request returned HTTP 200;
- no error-level logs were observed in the post-startup validation window.

## Completion rule

The #152 completion rule is satisfied: there are no remaining semantic `VALID_MISSING` items in the Control Center completion matrix, dedicated exact-head qualification is green, dedicated staging acceptance is green, and the certified runtime is converged in production.

Future Control Center work is ordinary product evolution and does not keep #152 open.

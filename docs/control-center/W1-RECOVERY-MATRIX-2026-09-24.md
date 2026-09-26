# Control Center W1 Recovery Matrix — 2026-09-24

**ChangeSet:** `MD-W1-CONTROL-CENTER-GAP`

**Base:** `main@b92fbc17fa383defd95274a3dea607895fe7e6dd`

**Purpose:** executable decomposition of historical Control Center deltas without restoring old branches wholesale.

## Status vocabulary

- `ALREADY_IN_MAIN`: current main already contains the intended behavior or a newer equivalent.
- `STILL_NEEDED`: behavior is absent or incomplete and remains valid.
- `SUPERSEDED`: intent has been replaced by a newer implementation or architecture.
- `INVALID`: historical change is no longer a valid merge target.
- `NEEDS_REDESIGN`: original intent remains useful, but the old implementation must not be restored as-is.

## Capability recovery matrix

### Users

Historical sources:

- #154 foundation;
- #234 expanded UX and Entity 360 work.

Current-main evidence:

- `apps/morro-digital-platform/tooling/admin-api.mjs`;
- `apps/control-center/public/control-center.js`.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- hardening only;
- no old-code recovery.

### Businesses

Historical sources:

- #154 foundation and profile adapter;
- #234 Entity 360 and aggregate work.

Current-main evidence:

- `apps/morro-digital-platform/tooling/business-api.mjs`;
- Business adapter;
- Auth-derived directory projection.

Classification:

- `NEEDS_REDESIGN`.

Reason:

- the default profile runtime is in-memory when no repository is injected;
- Auth memberships are not a complete canonical Business registry.

Next action:

- CC-W2 durable Business owner completion.

### Affiliates

Historical sources:

- #171 owner surface;
- #234 integrated and visual work.

Current-main evidence:

- affiliate runtime;
- affiliate owner adapter;
- dedicated browser workflow.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- no old-code recovery;
- #171 may be closed after this matrix is accepted.

### CRM

Historical sources:

- #154 partial foundation;
- #234 owner-backed aggregate work.

Current-main evidence:

- CRM adapter delegates to the existing CRM API.

Classification:

- `STILL_NEEDED`.

Next action:

- CC-W3 capability-by-capability completion.

### Products

Historical sources:

- #154 namespace foundation;
- #234 integrated UI and aggregate work.

Current-main evidence:

- Ticketing inventory/offer adapter.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- no recovery from old branches.

### Reservations

Historical sources:

- #154 namespace foundation;
- #234 integrated UI and aggregate work.

Current-main evidence:

- Ticketing reservation adapter.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- no recovery from old branches.

### Ticketing

Historical sources:

- #154 partial foundation;
- #234 integrated UI and aggregate work.

Current-main evidence:

- Ticketing adapter delegates to the owner API.

Classification:

- `STILL_NEEDED`.

Next action:

- CC-W4 full operator-contract inventory and completion.

### Orders

Historical sources:

- #154 partial foundation;
- #234 financial and Entity 360 views.

Current-main evidence:

- Financial/Ordering owner reads.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- keep read-side authority.

### Financial

Historical sources:

- #154 mature financial slice;
- #234 aggregate and UI work.

Current-main evidence:

- Financial adapter;
- owner-resolved scope;
- step-up for governed effects;
- production effects blocked in Control Center orchestration.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- preserve Financial as monetary authority.

### Content

Historical sources:

- #154 originally recorded a gap;
- #176 temporary format qualification;
- #234 integrated and visual work.

Current-main evidence:

- Content owner runtime;
- Content adapter;
- Content contract workflow.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- close #176;
- no code recovery required.

### Destinations

Historical sources:

- #154 originally recorded a gap;
- #180 owner surface;
- #234 integrated and visual work.

Current-main evidence:

- Destinations owner runtime;
- destination adapter;
- MySQL contract workflow.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- #180 may be closed after this matrix is accepted.

### Support

Historical sources:

- #154 foundation;
- inherited by #171, #176 and #180;
- expanded UX in #234.

Current-main evidence:

- signed support context in `admin-api.mjs`;
- actor/effectiveUser separation.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- preserve actor/effectiveUser separation.

### Audit

Historical sources:

- runtime-only in early foundation;
- later durable and recent-activity work in #234.

Current-main evidence:

- MySQL append-only audit store.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- maintain fail-closed behavior for governed mutations;
- reconcile stale documentation in CC-W6.

### System

Historical sources:

- #154 foundation;
- integrated UI in #234.

Current-main evidence:

- platform-operations projection.

Classification:

- `ALREADY_IN_MAIN`.

Next action:

- remain read-only unless a separate owner contract exists.

### Settings

Historical sources:

- basic preferences in the foundation;
- visual/settings work in #234.

Current-main evidence:

- local Control Center preferences.

Classification:

- `ALREADY_IN_MAIN` for the current intended narrow scope.

Next action:

- redesign before introducing any privileged server setting.

## PR #154 recovery matrix

### Control Center shell

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- `apps/control-center/public/*` exists in current `main`.

Recovery:

- none.

### Platform capability model

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- centralized server-side capability checks exist.

Recovery:

- none.

### Admin API v1

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- `admin-api.mjs` is active in runtime composition.

Recovery:

- none.

### Users directory

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- Auth-backed admin user APIs and current UI exist.

Recovery:

- none.

### Business directory and profile

Classification:

- `NEEDS_REDESIGN`.

Evidence:

- profile adapter exists;
- default runtime repository is in-memory;
- directory partly derives from Auth memberships.

Recovery:

- CC-W2.

### Support Mode

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- signed support context;
- actor/effectiveUser separation.

Recovery:

- none.

### Append-only audit

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- MySQL audit store exists.

Recovery:

- none.

### Step-up auth

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- implemented for critical flows.

Recovery:

- none.

### Affiliates, Content and Destinations gaps recorded by #154

Classification:

- `SUPERSEDED`.

Evidence:

- those owner adapters now exist in current `main`.

Recovery:

- none.

### Browser-proof gap recorded by #154

Classification:

- `SUPERSEDED` for the old claim;
- current visual evidence remains separately incomplete.

Recovery:

- CC-W5 only for current-main gaps.

PR action:

- do not merge #154;
- safe to close after this matrix is accepted.

## PR #171 recovery matrix

### Affiliate list/detail owner queries

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- affiliate admin runtime/service integrated.

Recovery:

- none.

### Membership eligibility, attribution and conversion reads

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- current affiliate query surface is owner-backed.

Recovery:

- none.

### Suspend/reactivate membership

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- governed adapter mutation exists.

Recovery:

- none.

### Capability, step-up and Support Mode denial

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- present in `admin-api.mjs`.

Recovery:

- none.

### Browser contract

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- dedicated Affiliates workflow exists.

Recovery:

- none.

PR action:

- do not merge #171;
- safe to close after this matrix is accepted.

## PR #176 recovery matrix

### Formatting-only qualification patch

Classification:

- `INVALID`.

Reason:

- PR explicitly declared itself temporary and not a merge candidate.

Recovery:

- none.

### Content owner admin intent

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- current Content runtime, adapter and contract workflow exist.

Recovery:

- none.

PR action:

- close #176;
- no code recovery required.

## PR #180 recovery matrix

### Typed Destination owner boundary

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- current destinations package, service and runtime exist.

Recovery:

- none.

### MySQL repository

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- current destination service and workflow use a MySQL contract.

Recovery:

- none.

### Admin adapter

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- destination adapter exists.

Recovery:

- none.

### Fail-closed owner availability

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- destination runtime readiness and adapter behavior exist.

Recovery:

- none.

### Public projection integration

Classification:

- `ALREADY_IN_MAIN` or `SUPERSEDED`.

Reason:

- current `main` contains newer destination/public runtime work.

Recovery:

- no direct cherry-pick.

### Historical browser qualification details

Classification:

- `SUPERSEDED`.

Reason:

- current workflow is the source of truth.

Recovery:

- none.

PR action:

- do not merge #180;
- safe to close after this matrix is accepted.

## PR #234 recovery matrix

### Control Center core runtime

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- current `main` contains shell, Admin API and adapters.

Recovery:

- none.

### Owner-backed aggregates

Classification:

- `ALREADY_IN_MAIN`.

Evidence:

- current adapters and dashboard module-state projections exist.

Recovery:

- none.

### Users, Business and Affiliate Entity 360 patterns

Classification:

- `ALREADY_IN_MAIN` plus `NEEDS_REDESIGN` for Business durability.

Evidence:

- relationships and recent-activity patterns exist;
- Business owner completion remains incomplete.

Recovery:

- CC-W2 only for the Business gap.

### Universal search intent

Classification:

- `ALREADY_IN_MAIN` plus `NEEDS_REDESIGN`.

Reason:

- current search aggregation exists;
- historical split-module files are absent.

Recovery:

- validate current behavior;
- do not restore the old module wholesale.

### UX V1 primitives and shell modules

Classification:

- `SUPERSEDED`.

Reason:

- historical files are absent;
- current `main` contains newer Control Center home work and wider UX V2 evolution.

Recovery:

- none directly.

### Historical responsive harness

Classification:

- `NEEDS_REDESIGN`.

Reason:

- historical path is absent;
- current UI has evolved.

Recovery:

- CC-W5.

### Visual regression harness and baselines

Classification:

- `STILL_NEEDED`.

Reason:

- the historical harness and workflow are absent from current `main`.

Recovery:

- CC-W5 with fresh current-main baselines.

### Historical screenshots and baselines

Classification:

- `INVALID` as current authority.

Reason:

- they belong to an old markup and branch state.

Recovery:

- regenerate from the tested current Exact HEAD.

### Control Center ledger

Classification:

- `STILL_NEEDED`.

Reason:

- the historical ledger file is absent.

Recovery:

- CC-W6.

### Unrelated branch-wide changes

Classification:

- `INVALID` for this recovery.

Reason:

- #234 is a long-lived, highly divergent branch with broad unrelated deltas.

Recovery:

- never merge wholesale.

PR action:

- do not merge #234;
- close only after successor waves capture the still-needed visual, UX and documentation intent.

## Owner-boundary execution map

### Users

Owner/delegate:

- Auth.

Write authority:

- Auth.

Placeholder risk:

- low.

Follow-up:

- keep server-side capability and step-up enforcement.

### Businesses

Owner/delegate:

- Business plus Auth membership projection.

Write authority:

- Business for profile operations.

Placeholder risk:

- medium.

Reason:

- in-memory profile repository default;
- incomplete canonical registry.

Follow-up:

- CC-W2.

### Affiliates

Owner/delegate:

- Affiliates.

Write authority:

- Affiliates.

Placeholder risk:

- low.

Follow-up:

- none for historical recovery.

### CRM

Owner/delegate:

- CRM.

Write authority:

- CRM.

Placeholder risk:

- medium.

Reason:

- complete admin breadth is not yet inventoried.

Follow-up:

- CC-W3.

### Products

Owner/delegate:

- Ticketing.

Write authority:

- Ticketing.

Placeholder risk:

- low.

Follow-up:

- no new Commerce authority in Control Center.

### Reservations

Owner/delegate:

- Ticketing.

Write authority:

- Ticketing.

Placeholder risk:

- low.

Follow-up:

- preserve owner state transitions.

### Ticketing

Owner/delegate:

- Ticketing.

Write authority:

- Ticketing.

Placeholder risk:

- medium.

Reason:

- full operator breadth remains incomplete.

Follow-up:

- CC-W4.

### Orders

Owner/delegate:

- Ordering/Financial projections.

Write authority:

- existing domain owners.

Placeholder risk:

- low.

Follow-up:

- keep Control Center read-side unless an explicit owner command exists.

### Financial

Owner/delegate:

- Financial.

Write authority:

- Financial.

Placeholder risk:

- low while the current production-effect block is retained.

Follow-up:

- preserve monetary authority.

### Content

Owner/delegate:

- Content.

Write authority:

- Content.

Placeholder risk:

- low.

Follow-up:

- none for historical recovery.

### Destinations

Owner/delegate:

- Destinations.

Write authority:

- Destinations.

Placeholder risk:

- low.

Follow-up:

- none for historical recovery.

### Support

Owner/delegate:

- Control Center orchestration plus Auth identities.

Write authority:

- no independent domain write authority.

Placeholder risk:

- low.

Follow-up:

- preserve actor/effectiveUser separation.

### Audit

Owner/delegate:

- Analytics audit store.

Write authority:

- append-only audit.

Placeholder risk:

- low.

Follow-up:

- maintain fail-closed governed mutations.

### System

Owner/delegate:

- platform operations projection.

Write authority:

- none.

Placeholder risk:

- low.

Follow-up:

- keep read-only.

### Settings

Owner/delegate:

- browser preference surface.

Write authority:

- local preferences only.

Placeholder risk:

- low.

Follow-up:

- redesign before any privileged server setting.

## Proof obligations for CC-W2 Business

Required evidence:

- authorized platform/business operator path succeeds;
- unauthorized capability is denied;
- cross-tenant mutation is denied;
- durable repository composition is proven;
- canonical Business IDs are owner-issued;
- Auth membership data is not treated as the full Business source of truth;
- mutation audit contains previous and new state where applicable.

## Proof obligations for CC-W3 CRM

Required evidence:

- every mutation is inventoried;
- each mutation delegates to a CRM owner command;
- cross-tenant access is denied;
- Support Mode actor/effectiveUser semantics are preserved;
- no Control Center SQL path is introduced.

## Proof obligations for CC-W4 Ticketing

Required evidence:

- owner commands only;
- invalid-state denial;
- replay/idempotency protection where applicable;
- cross-business and cross-destination denial;
- no direct payment or order state mutation;
- audit correlation to the owner operation.

## Proof obligations for CC-W5 browser, accessibility and visual certification

For each Control Center surface:

1. login and route load;
2. loading state;
3. empty state;
4. success state;
5. error state;
6. keyboard reachability;
7. visible focus;
8. no critical axe violation;
9. mobile viewport at `390x844`;
10. tablet viewport at `768x1024`;
11. desktop viewport at `1280x800` or larger;
12. table overflow without viewport breakage;
13. no overlap with navigation, banners or dialogs;
14. reduced-motion compliance where motion exists;
15. fresh screenshot or baseline bound to the tested Exact HEAD.

Historical #234 screenshots must not be copied forward as evidence.

## Recommended wave order

1. CC-W2 Business owner completion.
2. CC-W3 CRM admin completion.
3. CC-W4 Ticketing operator completion.
4. CC-W5 visual/responsive/accessibility certification.
5. CC-W6 documentation convergence.

CC-W2 through CC-W4 may proceed in parallel only if ownership is split cleanly and shared `admin-api.mjs` or `admin-domain-adapters.mjs` edits are coordinated to prevent semantic collisions.

## Closure ledger

### PR #154

Merge:

- NO.

Close after this wave:

- YES, after this recovery matrix is accepted.

Reason:

- foundation superseded by more advanced current `main`.

### PR #171

Merge:

- NO.

Close after this wave:

- YES, after this recovery matrix is accepted.

Reason:

- Affiliates delta is already present.

### PR #176

Merge:

- NO.

Close after this wave:

- YES.

Reason:

- temporary non-merge qualification PR.

### PR #180

Merge:

- NO.

Close after this wave:

- YES, after this recovery matrix is accepted.

Reason:

- Destinations delta is already present.

### PR #234

Merge:

- NO.

Close after this wave:

- NOT YET.

Reason:

- current-main visual, UX and documentation intent must first be captured by successor waves.

## ChangeSet invariant

The final diff for `MD-W1-CONTROL-CENTER-GAP` must contain exactly:

- `docs/control-center/W1-GAP-AUDIT-2026-09-24.md`;
- `docs/control-center/W1-RECOVERY-MATRIX-2026-09-24.md`.

No runtime change is authorized in this wave.

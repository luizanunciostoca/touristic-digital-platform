# BUSINESS M64 — Browser Scope Reconciliation Evidence

## Frozen sources

- V2 base: `luizidebook/touristic-digital-platform@6193c3411159d73e8b624587bff41e174e15327f`
- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`
- Frozen V1 directory: `js/business/`
- Frozen V1 production view: `js/business/profile/business-profile-view.js`
- M63 executable evidence: permanent Business Production Profile Browser Contract

## Frozen tree audit

The frozen V1 `js/business/` tree contains exactly one child domain: `profile/`.

The frozen V1 `js/business/profile/` tree contains exactly one production JavaScript file: `business-profile-view.js`.

No second Business-owned production browser module exists under `js/business/*` in the frozen source. Runtime files such as `business-live-runtime.js`, recommendation sandbox, workspace adapter and commercial conversion live under `js/onboarding/runtime/` and remain classified separately in the migration matrix.

## Reconciliation

Before M63, the generic `Business domain/browser behavior` row stayed `PARTIAL` because the production profile browser surface had not yet been ported.

M63 completed that missing frozen `js/business/*` surface while reusing the existing V2 Business model, protected GET/PUT resource, tenant authorization and authenticated dashboard.

The permanent M63 Chromium contract proves the production profile modal, accessibility semantics, production badge, optional promotion, delegated `promotion`, `primary` and `map` actions, Escape teardown, and the absence of synthetic ratings, hours, images or contacts.

Therefore there is no remaining unported Business-owned browser module under the frozen `js/business/*` scope.

## Boundary preservation

This reconciliation does not reclassify `js/onboarding/runtime/business-live-runtime.js`; that remains a separate `Live Business runtime` contract.

It also does not absorb:

- Search/Assistant recommendation ownership;
- Navigation/map implementation ownership;
- Auth/session/tenant authorization;
- Payments execution or financial verification;
- production analytics, reputation or notification capabilities that are not yet backed by V2 contracts.

## Migration impact

`Business domain/browser behavior` moves from `PARTIAL` to `PASS` based on frozen-tree completeness plus the executable M63 production-profile evidence.

The matrix becomes `18 PASS / 1 PARTIAL / 0 GAP / 1 N/A`.

`Live Business runtime` remains the only `PARTIAL`, so `FEATURE-0005` remains `baseline-pending` until the observable responsibilities of `business-live-runtime.js` are reconciled without restoring legacy globals or inventing unavailable feature data.

## Required final gate

Because M64 changes migration classification/documentation only, the official repository Quality Gate must pass on the final permanent M64 SHA. No temporary helper workflow may remain in the diff.

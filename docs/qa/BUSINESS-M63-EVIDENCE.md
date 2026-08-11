# BUSINESS M63 — Production Profile View Evidence

## Frozen sources

- V2 base: `luizidebook/touristic-digital-platform@cf27b4f81768f40536b8ace60d5880ae00f6af50`
- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`
- V1 production profile view: `js/business/profile/business-profile-view.js`
- V2 profile model/service: `packages/business/src/index.ts`
- V2 authenticated dashboard: `apps/morro-digital-platform/src/business-dashboard-surface.ts`

## Audit result

The frozen V1 `js/business/profile` directory contains one production browser surface: `business-profile-view.js`. Its normalized profile fields already match the V2 `BusinessProfile` model: name, category, specialty, description, CTA, location, optional promotion and tutorial/metrics flags.

The missing production contract was therefore the browser view, not a second persistence model or another authorization boundary.

## V2 implementation

M63 adds `apps/morro-digital-platform/src/business-profile-view.ts` and reuses `normalizeBusinessProfile()` as the only profile normalization source.

The production view preserves the observable V1 contract:

1. accessible modal dialog with `aria-modal` and profile-specific label;
2. initial focus on the close control;
3. close by button, backdrop or Escape;
4. production/tutorial badge;
5. category, specialty, location and description rendering;
6. optional promotion rendering with CTA;
7. explicit notice that hours, ratings, images and contacts are unavailable until definitive registration;
8. delegated `primary`, `map` and `promotion` actions.

The authenticated dashboard exposes `Visualizar perfil` only over the already loaded protected `BusinessProfile`. The view does not create another repository, session, credential, analytics store or navigation implementation.

## Browser evidence

The permanent `Business Production Profile Browser Contract` runs against the real authenticated Business runtime in deterministic Chromium. It proves:

- authenticated profile seed/load;
- visible production profile modal;
- `role="dialog"` and `aria-label="Perfil de Toca do Morcego"`;
- `PARCEIRO MORRO DIGITAL` production badge;
- active promotion rendering;
- unavailable-data notice instead of synthetic ratings/hours/images/contacts;
- exact action sequence `promotion -> primary -> map` through `businessProfileAction`;
- Escape teardown;
- no browser errors;
- workspace build green before browser execution.

The existing Business Dashboard Browser Contract also remains green on the same permanent head, proving that the production view did not regress authenticated dashboard load/save/logout behavior.

## Architecture invariants

- Auth remains authoritative for Business profile access.
- Existing Business GET/PUT remains authoritative for persistence.
- M63 does not invent production analytics, ratings, hours, images or contacts.
- The map action remains an outward intent; M63 does not absorb Navigation ownership.
- No Payments behavior is introduced.

## Migration impact

`Business profile behavior` moves from `PARTIAL` to `PASS`: the frozen V1 production profile model, protected persistence and production browser view are now represented with executable evidence.

`Business domain/browser behavior` and `Live Business runtime` remain `PARTIAL`. `FEATURE-0005` therefore remains `baseline-pending` even though the matrix has no Business-owned GAPs.

## Required final gate

Before merge, the final permanent M63 SHA must pass the official Quality Gate plus Business Dashboard Browser Contract and Business Production Profile Browser Contract. No temporary helper workflow may remain in the diff.

# Business M60 — Partner Workspace Sandbox Evidence

## Scope

M60 ports the frozen observable V1 Partner Workspace tutorial contract without weakening the V2 Auth boundary or inventing production analytics.

The Business onboarding now owns a tutorial-only event summary, a sandbox promotion model, an isolated workspace snapshot and an explicit handoff to the existing protected Business dashboard.

## Frozen V1 contract

Audited V1 sources:

- `js/onboarding/runtime/business-partner-workspace-adapter.js`
- `js/onboarding/__tests__/business-partner-workspace-adapter.test.js`
- `js/onboarding/__tests__/business-promotion-loop.test.js`

The active V1 behavior is limited to two Business-owned observable contracts:

1. show a partner workspace with a summary derived from events created during the tutorial session;
2. create a promotion that remains inside the tutorial sandbox and immediately becomes available to the tutorial profile flow.

The V1 iframe embedding strategy is not copied because the V2 Business dashboard is protected by centralized Auth.

## V2 implementation

`@touristic/business/onboarding-workspace` defines the immutable tutorial event vocabulary, event-summary increment semantics, workspace snapshot projection, category-aware promotion defaults and sandbox promotion construction.

All workspace/promotion objects are explicitly marked tutorial-only and `excludeFromBusinessMetrics: true`. Promotions are additionally `environment: "sandbox"` and `publishable: false`.

`BusinessOnboardingRuntime` records the frozen tutorial signals at existing observable runtime effects: menu/text/name/voice discovery, rendered Assistant recommendation, profile open, primary profile action, route start, demo-promotion creation and demo-promotion view. These counters remain only in `businessTutorialEventSummary` inside the onboarding workflow context.

The `promotions` step renders a local demonstration form. Submission is sanitized by the Business domain builder, persisted only as `businessDemoPromotion`, increments the session-only creation counter and emits `businessTutorialPromotionSaved` with metric exclusion.

The `partner-panel` step builds `businessTutorialWorkspace`, renders the session summary and exposes only an explicit `businessProtectedDashboardRequested` handoff to `/apps/morro-digital-platform/public/business-dashboard.html`.

## Auth boundary

M60 does **not** embed the protected dashboard, fabricate credentials, create an Auth session, copy cookies, weaken CSRF protection or bypass tenant authorization.

The dashboard handoff is explicitly marked `requiresAuthentication: true`. Authentication and protected Business resource access remain owned by the existing Auth browser/server boundaries.

## Non-scope

M60 does not add production analytics endpoints, commercial conversion, subscription/payment execution, checkout, production promotion publication or a new Business authentication mechanism.

## Automated evidence

- `onboarding-workspace.test.ts` proves event-summary normalization/increment behavior, immutable workspace projection and sandbox-only promotion construction.
- `onboarding-context.test.ts` proves M58-M60 tutorial runtime keys persist only through the explicit allowlist while unknown credential-like keys remain rejected.
- `Business Onboarding Workspace Browser Contract` builds the real workspace, submits an edited promotion in Chromium, proves `sandbox/publishable:false`, verifies event-summary increment, renders the partner summary, confirms no iframe exists and verifies the protected dashboard handoff requires authentication.
- Existing Route and Profile Browser Contracts explicitly map the M60 package subpath so their built browser module graphs remain deterministic.

## Acceptance criteria

M60 may be promoted to `PASS` only when the official Quality Gate and all relevant Business/browser/accessibility regressions, including the new Workspace Browser Contract, pass on one final permanent PR head with no temporary workflow files in the diff.

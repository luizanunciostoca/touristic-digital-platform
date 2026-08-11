# Business M62 — Commercial Conversion Browser Lifecycle Evidence

## Scope

M62 binds the M61 commercial-conversion core merged by PR #123 to the real Business onboarding browser lifecycle. It deliberately adds no second commercial domain implementation and does not move checkout/payment execution into Business.

The milestone owns only the browser-side preparation and handoff seam: render the finish-step form, collect user input, call the M61 Business core, persist the normalized Business workflow result, emit the Payments handoff, and consume a separately verified Payments signal fail-closed.

## Reused M61 core

M62 consumes `@touristic/business/onboarding-commercial-conversion` for all commercial rules:

- `recommendBusinessCommercialPlan()`
- `buildBusinessCommercialContractor()`
- `buildBusinessCommercialAcceptances()`
- `buildBusinessCommercialCheckoutHandoff()`
- `acceptBusinessCommercialVerifiedPayment()`

No plan vocabulary, contractor validation, legal acceptance semantics or payment-verification rule is reimplemented in the browser surface.

## Browser integration

`business-onboarding.html` maps the commercial-conversion package subpath for the dedicated onboarding module graph.

`BusinessOnboardingSurface` renders the commercial preparation form on `finish` with:

- Essential / Growth / Performance plan controls;
- contractor name, email, phone and document;
- mandatory Partnership Terms acceptance;
- mandatory Privacy acceptance;
- optional marketing consent;
- an explicit disclosure that no payment is executed on this screen.

Submission becomes the explicit runtime action `commercial-prepare-checkout:*`. The surface itself does not decide plan recommendation, sanitize commercial data or build a checkout payload.

`BusinessOnboardingRuntime` dynamically consumes the M61 core, uses the onboarding objective as the plan fallback, builds the contractor/acceptances/handoff and persists only `businessCommercialCheckoutHandoff` through the runtime-context allowlist.

A successful preparation emits `businessCheckoutRequested` and `businessCommercialCheckoutPrepared`. The handoff is `tutorial: false` and `requiresPaymentsCapability: true` and contains no checkout URL, public token or payment-status result.

## Payments boundary

M62 does not:

- create a checkout/provider session;
- issue payment HTTP requests;
- create or send idempotency keys;
- open provider URLs or popups;
- persist public checkout tokens;
- poll transaction state;
- independently decide that a transaction is financially verified.

The entrypoint listens only for the external `businessPaymentVerified` signal. `BusinessOnboardingRuntime.verifyPayment()` delegates acceptance to the M61 core using a workflow correlation derived from the onboarding session creation timestamp.

Wrong-session or unverified signals fail closed. Only a verified same-correlation signal with a non-empty payment reference persists `businessCommercialActivation` and emits `businessCommercialActivationReady` with `verifiedByPaymentsBoundary: true`.

The workflow correlation is product state, not an Auth credential, session token or proof of payment.

## Runtime persistence boundary

M62 extends the explicit onboarding runtime-context allowlist with only:

- `businessCommercialCheckoutHandoff`
- `businessCommercialActivation`

It adds no credential, cookie, CSRF, tenant authorization, provider secret or payment token key.

## Executable evidence

Before PR creation, the validated integration patch passed:

- `@touristic/business` lint;
- `@touristic/business` typecheck;
- 44 Business tests;
- app typecheck;
- 271 app tests across 49 files;
- workspace build across all 12 packages.

On PR #125 head `4e26bd691ca4f61b8ed381f56df647c34274137c`, the permanent `Business Onboarding Commercial Browser Contract` passed in deterministic Chromium and proved:

1. the real `finish` surface renders the commercial form;
2. objective `events` falls back through the M61 core to plan `performance` when no explicit plan is selected;
3. `<Luiz> Silva` is normalized to `Luiz Silva` and the email is normalized to lowercase;
4. the prepared handoff is `requiresPaymentsCapability: true` and `tutorial: false`;
5. the handoff contains no `paymentStatus`, `checkoutUrl` or `publicToken` execution state;
6. the UI explicitly states that payment is not executed on the Business screen;
7. a wrong-session verification is rejected;
8. an unverified result is rejected;
9. exactly one verified same-correlation result is accepted;
10. accepted activation is `paymentStatus: CONFIRMED`, `activationStatus: READY_TO_CONVERT`, with the sanitized payment reference;
11. `businessCommercialActivationReady` is emitted only after the Payments-owned verified signal;
12. no browser page error occurs.

The same permanent head also passed the official Quality Gate and all nine Business/Auth/onboarding/navigation browser regressions: Business Auth, Dashboard, Onboarding Adapter, Onboarding Browser, Onboarding Route, Onboarding Profile, Onboarding Workspace, Onboarding Commercial, and Navigation Accessibility.

## Migration impact

M61 already moved `Commercial conversion adapter` from `GAP` to `PASS` by supplying the framework-independent Business core. M62 makes that port observable in the actual onboarding browser lifecycle and gives it permanent Chromium evidence.

The Business matrix therefore consolidates to:

- `PASS`: 16
- `PARTIAL`: 3
- `GAP`: 0
- `N/A`: 1

M62 does **not** promote `Business domain/browser behavior`, `Business profile behavior` or `Live Business runtime`; those remain `PARTIAL` until their missing frozen production behavior is independently ported and proven.

`Checkout client` remains `N/A` for Business because transaction execution belongs to `FEATURE-0009`.

`FEATURE-0005` remains `baseline-pending`. Zero Business-owned GAPs does not equal full V1 × V2 equivalence while the three production PARTIAL contracts remain.

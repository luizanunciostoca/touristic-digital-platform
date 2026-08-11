# Business M61 — Commercial Conversion Handoff Evidence

## Scope

M61 ports the remaining Business-owned portion of the frozen V1 commercial conversion flow while preserving Payments as the exclusive owner of checkout execution and financial confirmation.

Business now owns plan recommendation, contractor data preparation, required Terms/Privacy acceptance, optional marketing consent, immutable commercial draft persistence and an explicit checkout handoff. Business does not charge, tokenize, capture, settle or synthesize payment success.

## Frozen V1 contract

Audited V1 sources at `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`:

- `js/onboarding/runtime/business-commercial-conversion-adapter.js`
- `js/onboarding/__tests__/business-commercial-conversion-adapter.test.js`
- `js/onboarding/business-onboarding.js`
- `js/onboarding/runtime/business-profile-sandbox.js`

The frozen observable contract is:

1. onboarding completion emits `businessTutorialLeadReady`;
2. Business recommends one of the frozen plans from the selected objective;
3. Business collects contractor name, email, phone/WhatsApp and CPF/CNPJ;
4. Terms of Partnership and Privacy Policy acceptance are required, while marketing consent is optional;
5. Business prepares a checkout payload and hands it to an external checkout capability;
6. Business must not mark payment confirmed merely because checkout was requested;
7. a payment confirmation is accepted only when an externally supplied verification is marked verified and correlated to the same workflow session.

The frozen plans are preserved: `essential` for `brand`, `growth` for `clients/reservations/whatsapp/sales`, and `performance` for `events`, with `growth` as the recommended fallback.

## V2 implementation

`@touristic/business/onboarding-commercial` defines the commercial conversion boundary as framework-independent immutable builders:

- `recommendBusinessCommercialPlan()` reproduces the frozen objective-to-plan mapping;
- `buildBusinessCommercialDraft()` sanitizes contractor input, requires Terms + Privacy, records frozen document versions and keeps marketing consent optional;
- `buildBusinessCheckoutHandoff()` prepares the Business-to-Payments payload and explicitly marks `requiresPaymentProvider: true`;
- `verifyBusinessPaymentForSession()` fails closed unless `verified === true` and the returned correlation matches the current onboarding workflow.

The onboarding runtime allowlist admits only three M61 keys: `businessCommercialDraft`, `businessCheckoutHandoff` and `businessPaymentConfirmation`. No credential, payment token, provider secret or arbitrary state is admitted.

At the `finish` step, the browser surface renders the commercial preparation form. It states explicitly that no payment is executed in that screen. Submission persists the Business-owned commercial draft and dispatches:

- `businessTutorialLeadReady`;
- `businessCheckoutRequested`;
- `businessCommercialCheckoutPrepared`.

The checkout handoff correlation is derived from the onboarding workflow creation timestamp (`business-onboarding:<createdAt>`). It is only a product-workflow correlation identifier and is not an Auth session, credential, secret or proof of payment.

`business-onboarding-entry.ts` consumes a future external `businessPaymentVerified` signal and delegates validation to the runtime. Only a verified same-correlation signal persists `businessPaymentConfirmation` and emits `businessCommercialActivationReady` with `verifiedByPaymentsBoundary: true`.

## Payments boundary

M61 does **not** implement a payment provider, payment method collection, provider token handling, subscription creation, charge capture, settlement, webhook verification, payment polling or checkout backend.

`businessCheckoutRequested` is a capability handoff only. The handoff deliberately contains no `paymentStatus` or `verified` claim. A Payments-owned implementation must execute checkout and provide the trustworthy verification signal in a future `FEATURE-0009` milestone.

## Security and ownership invariants

- Business does not own Auth credentials, cookies, CSRF or authenticated session secrets.
- Business does not own payment-provider credentials or financial confirmation.
- wrong-session payment verification is rejected;
- unverified payment verification is rejected;
- contractor and payment references are sanitized before persistence;
- commercial tutorial/draft state remains excluded from Business metrics where applicable;
- the existing protected dashboard/Auth boundary remains unchanged.

## Automated evidence

- `onboarding-commercial.test.ts` proves frozen plan recommendation, contractor/consent requirements, document-version persistence, checkout-handoff ownership and fail-closed same-session payment verification.
- the package/app validation used during implementation passed Business lint/typecheck, all Business tests (including the M61 contract), app typecheck/test and the full workspace build before the integration patch was committed.
- `Business Onboarding Commercial Browser Contract` mounts the real host/runtime/surface in deterministic Chromium, completes the real finish-step commercial form, proves `performance` recommendation for the `events` objective, contractor sanitization, required Business-to-Payments handoff, absence of synthetic payment confirmation, rejection of wrong/unverified confirmations and acceptance of exactly one verified same-correlation confirmation.
- existing Auth, Dashboard, Onboarding Adapter, Route, Profile and Workspace browser regressions remain required alongside the official Quality Gate and Navigation Accessibility baseline.

## Acceptance criteria

M61 may promote `Commercial conversion adapter` to `PASS` only when the official Quality Gate, new Commercial Browser Contract and every relevant Business/Auth/Navigation regression pass on the same final permanent PR head, with no temporary helper workflow in the diff.

Checkout execution remains `N/A` for the Business feature because it belongs to `FEATURE-0009 — Payments`.

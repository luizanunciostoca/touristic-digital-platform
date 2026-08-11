# BUSINESS M61 — Commercial Conversion Port Evidence

## Frozen sources

- V2 base: `luizidebook/touristic-digital-platform@4ef4389447cf2401e22c82a06f94ddc39b014a18`
- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`
- V1 Business adapter: `js/onboarding/runtime/business-commercial-conversion-adapter.js`
- V1 Payments execution client: `js/onboarding/runtime/business-checkout-client.js`
- V1 unit contract: `js/onboarding/__tests__/business-commercial-conversion-adapter.test.js`

## Audit result

The frozen V1 commercial adapter mixed Business orchestration with a Payments integration seam. M61 separates those responsibilities instead of copying the monolith.

Business-owned observable behavior:

1. recommend a plan from the onboarding objective;
2. collect and sanitize contractor name, email, phone and document;
3. require partnership terms and privacy acceptance while keeping marketing consent optional;
4. preserve explicit document versions and acceptance time;
5. construct the commercial payload that is handed to checkout;
6. after a separately verified same-session payment result, move Business activation state to `READY_TO_CONVERT`.

Payments-owned behavior, intentionally excluded from M61:

- creating a checkout session with HTTP POST;
- generating/sending idempotency headers;
- receiving checkout/public tokens;
- opening provider URLs/popups;
- polling payment status;
- deciding that a provider transaction is financially confirmed;
- retry/timeout/failure policy for payment execution.

Those behaviors remain owned by `FEATURE-0009`.

## V2 implementation

`@touristic/business/onboarding-commercial-conversion` provides a framework-independent port with no network, browser global, popup, token or polling dependency.

The immutable handoff has `requiresPaymentsCapability: true` and `tutorial: false`. It carries only the Business input required by the future Payments owner: session ID, plan ID, contractor, Business draft, accepted terms and return URL.

The result consumer is fail-closed: `acceptBusinessCommercialVerifiedPayment()` returns activation state only when `verified === true`, the returned session ID equals the expected Business session ID, and a non-empty payment reference exists.

## Executable evidence

`packages/business/src/onboarding-commercial-conversion.test.ts` proves:

- `reservations -> growth`, `events -> performance`, `brand -> essential`;
- contractor sanitization and email/mandatory-field validation;
- versioned required terms/privacy and optional marketing consent;
- checkout handoff has no `checkoutUrl`, `publicToken` or `paymentStatus` execution state;
- cross-session confirmation is rejected;
- a verified same-session result produces `paymentStatus: CONFIRMED` and `activationStatus: READY_TO_CONVERT`.

## Architecture invariants

- Business does not import a Payments implementation.
- Business does not issue checkout HTTP requests.
- Business does not create idempotency keys.
- Business does not open provider pages.
- Business does not poll provider state.
- Business does not become the authority that verifies a payment.
- Auth/session security remains outside this commercial port.

## Migration impact

The Business-owned `Commercial conversion adapter` row moves from `GAP` to `PASS` because V2 now exposes the frozen orchestration seam with executable evidence. `Checkout client` remains `N/A` under Business because it belongs to `FEATURE-0009`.

`Business profile behavior` and `Live Business runtime` remain `PARTIAL`. `FEATURE-0005` must not be promoted to equivalent until those production gaps are independently proven.

## Required final gate

Before merge, run the official repository Quality Gate on the final head:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm architecture:check
pnpm features:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Existing permanent Business/Auth/onboarding/navigation browser regressions must remain green on the same final SHA.

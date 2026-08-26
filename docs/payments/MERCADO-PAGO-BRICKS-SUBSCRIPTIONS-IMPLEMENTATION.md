# Mercado Pago — Bricks + Subscriptions implementation contract

Status: CODE COMPLETE — FINAL EXACT-HEAD + PROVIDER TEST ACCEPTANCE REQUIRED

Canonical integration base at the final synchronization point: `main@a2a1f10420c1d452e9426c75549864c76d57f22c`

Scope: Morro Digital V2 only. Production and legacy staging remain out of scope.

The exact final candidate SHA is intentionally recorded in the PR/evidence pack rather than hardcoded in this versioned document. This avoids making the acceptance document stale every time the document itself is corrected.

## Why this change exists

The V2 payment adapter historically used a Checkout Pro preference redirect. Morro Digital V2 now has an embedded card path through Mercado Pago Card Payment Brick plus a provider subscription lifecycle without exposing the server-side Access Token or trusting monetary configuration from the browser.

The existing Checkout Pro path remains available as a compatibility fallback. It is not removed by this change.

## Implemented one-time card payment

The Card Payment Brick tokenizes card data in Mercado Pago controlled fields. The browser submits only provider-generated payment material required by the backend: token, installments, payment method, issuer and payer identity fields.

The implementation enforces the following contract:

1. Ordering remains authority for product/plan and amount;
2. browser amount/currency fields are discarded and never become provider authority;
3. the canonical payment/order identity is resolved server-side;
4. Financial submits the charge to `POST https://api.mercadopago.com/v1/payments`;
5. `Authorization: Bearer <server Access Token>` exists only server-side;
6. a stable idempotency key is derived from the canonical payment attempt;
7. `external_reference` is the canonical internal payment id;
8. BRL validation, bounded provider reads and bounded retry policy remain enforced;
9. provider payment reference is persisted before acceptance;
10. verified webhook/readback, reconciliation and refund flows remain the terminal authority.

The browser composition mounts Card Payment Brick when a valid browser Public Key is configured. Checkout Pro redirect remains the compatibility path only when the Brick is not configured.

Official provider references used for this contract:

- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/payment-submission
- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/cards

## Browser public key

The browser receives only the Mercado Pago Public Key through:

`VITE_MERCADO_PAGO_PUBLIC_KEY`

The following values are never browser configuration and remain server-only:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- payment status/handoff secrets
- database credentials

Missing or invalid browser configuration fails closed. The runtime also rejects browser-prefixed variants of server credentials.

Official initialization reference:

- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/common-initialization

## Implemented subscription provider lifecycle

Recurring billing remains separate from one-time checkout and is never implemented as repeated browser-authored payments.

The provider lifecycle uses Mercado Pago Subscriptions:

- create: `POST /preapproval`;
- authoritative read: `GET /preapproval/{id}`;
- pause/resume/cancel: `PUT /preapproval/{id}`.

Official references:

- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post

The implementation preserves these authority boundaries:

- Ordering owns the canonical Subscription and its pricing snapshot;
- Financial owns the provider `/preapproval` interaction and durable provider binding;
- browser sends only the card token needed to configure a new provider agreement;
- payer e-mail comes from the authenticated server session, not the request body;
- amount, currency, frequency, plan and pricing version come from Ordering;
- `tenantId` is persisted as immutable provider-binding identity;
- cross-tenant read/pause/resume/cancel is rejected before a provider call;
- provider readback must match subscription amount/currency/frequency and persisted identity;
- split provider identity and stale readbacks fail closed;
- cancel schedules the canonical `cancel_at_period_end` transition before cancelling the provider agreement.

The durable provider binding is stored in the additive M146 table `financial_provider_subscriptions`. Its MySQL integration contract covers creation, status evolution, replay, tenant immutability, split identity and stale readback.

The runtime is opt-in through `PAYMENTS_SUBSCRIPTIONS_ENABLED=true`; no environment is silently upgraded into the provider subscription path.

## Browser subscription lifecycle

The authenticated browser client exposes only:

- `create(subscriptionId, cardToken)`;
- `read(subscriptionId)`;
- `pause(subscriptionId)`;
- `resume(subscriptionId)`;
- `cancel(subscriptionId)`.

There is deliberately no browser API parameter for amount, currency, frequency or payer e-mail.

`/api/payments/v1/subscriptions` is a protected Auth Browser prefix. Unsafe requests receive same-origin credentials and CSRF through the existing dashboard auth client, while public one-time checkout routes remain unaffected.

## Recurring authorized-payment notifications

A provider-generated recurring invoice is not a generic Morro Digital `PaymentId`. Mercado Pago exposes the subscription invoice notification as the dedicated `subscription_authorized_payment` topic and provides authoritative invoice readback through `/authorized_payments/{id}`.

This implementation deliberately does **not** weaken the existing generic payment webhook normalizer to accept `sub_*` as a `PaymentId`.

The existing M153 recurrence contract remains the canonical Ordering lifecycle for renewal intents and application of verified payment outcomes. Provider TEST acceptance must prove the correlation between a Mercado Pago authorized subscription payment and that canonical renewal/payment flow before recurring provider charging is promoted to `PROVIDER_VERIFIED` or enabled operationally beyond the controlled TEST campaign.

Official references used for this boundary:

- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- https://www.mercadopago.com.br/developers/en/reference/subscriptions/_authorized_payments_id/get

## Runtime and staging composition

The provider subscription transport is composed inside the existing Payments runtime, not as a parallel server:

1. existing Auth runtime supplies authenticated session/CSRF;
2. Ordering MySQL supplies Subscription and CheckoutAccess ownership;
3. Financial MySQL supplies M146 provider bindings;
4. Financial supplies the Mercado Pago `/preapproval` provider;
5. startup applies required additive schemas and fails closed on unavailable configuration/persistence;
6. startup rollback closes already-created resources when a later Payments component cannot start;
7. shutdown closes core/card/subscription resources together.

The canonical V2 staging Blueprint also declares the new runtime requirements:

- `VITE_MERCADO_PAGO_PUBLIC_KEY` as externally supplied browser-safe TEST configuration;
- `PAYMENTS_SUBSCRIPTIONS_ENABLED=true` for the controlled provider acceptance environment;
- `PAYMENTS_SUBSCRIPTION_BACK_URL` pointing to the V2 staging host.

Server credentials remain external secrets and are never committed to the Blueprint.

## Exact-head code acceptance

For the final frozen HEAD, the acceptance pack must prove on the same SHA:

1. canonical Prettier check;
2. architecture boundaries;
3. feature/environment/governance contracts;
4. workflow supply-chain validation;
5. lint;
6. typecheck;
7. Payments Sandbox Provider contract;
8. Payments Persistence Integration including M146;
9. Payments M149 Browser Checkout contract;
10. Payments Verified Outcome contract;
11. Payments Verified Webhook contract;
12. Payments Refund Command contract;
13. Payments Reconciliation contract;
14. Payments Operational Ledger contract;
15. Payments Settlement contract;
16. Payments Subscription Recurrence contract;
17. Render Staging Blueprint contract;
18. affected Auth/Business/browser regressions.

The PR/evidence pack owns the exact candidate SHA and CI run identifiers. No merge is authorized by this document alone.

## Provider TEST acceptance

Provider verification is a separate controlled stage and must run against the exact accepted SHA deployed to V2 TEST staging:

1. verify release identity and readiness;
2. confirm Public Key is browser-visible while Access Token/webhook/database secrets are not;
3. execute one-time TEST Brick payment -> provider create -> authoritative payment readback;
4. prove verified webhook -> authoritative readback -> canonical payment outcome;
5. prove reconciliation and replay/idempotency;
6. execute TEST refund -> authoritative refund/payment readback -> canonical reversal state;
7. execute subscription TEST create -> authoritative readback -> pause -> readback -> resume -> readback -> cancel -> final readback;
8. prove tenant/auth/CSRF/browser-authority negative cases;
9. observe `subscription_authorized_payment` and `/authorized_payments/{id}` when the TEST contract generates one, then validate its correlation with the canonical recurrence/payment lifecycle;
10. record a redacted evidence pack and only then set `PROVIDER_VERIFIED=YES`.

## Merge and post-merge acceptance

After provider acceptance and independent review PASS:

1. mark the PR Ready for Review;
2. merge only with the accepted expected-head SHA;
3. record the resulting canonical `main` SHA;
4. rerun the required post-merge Quality/Payments regressions on that canonical state;
5. redeploy/smoke V2 staging from canonical `main` as required by coordination;
6. close the front only when code, provider, merge and post-merge evidence all agree.

## Non-negotiable safety rules

- no production deployment or production mutation;
- no real card, real buyer or real money;
- no secret committed to GitHub;
- no secret pasted into issues, PRs, logs or chat;
- no legacy staging mutation;
- no browser-authored amount/currency/frequency/payer e-mail;
- no silent fallback from TEST to production;
- no reinterpretation of `sub_*` as a generic canonical `PaymentId`;
- no promotion to `PROVIDER_VERIFIED` until the real TEST lifecycle completes.

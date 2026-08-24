# Mercado Pago — Bricks + Subscriptions implementation contract

Status: IMPLEMENTATION IN PROGRESS

Base candidate: `06aff1f1d6980a44820c582a64b288d42a4bd7de`

Scope: Morro Digital V2 only. Production and legacy staging remain out of scope.

## Why this change exists

The current V2 payment adapter is a Checkout Pro preference redirect. Morro Digital V2 needs an embedded card flow through Mercado Pago Checkout Bricks and a recurring subscription capability without exposing the server-side Access Token or trusting price data from the browser.

The existing Checkout Pro path remains intact until the replacement flow passes deterministic contracts, exact-head Quality, browser acceptance and provider TEST verification.

## Provider contracts

### One-time card payment

The Card Payment Brick tokenizes card data in Mercado Pago controlled fields. The browser may submit only the Brick output needed by the backend, including the generated token, installments, payment method, issuer and payer identity fields.

The backend MUST:

1. resolve product/plan and amount from the existing Ordering authority;
2. reject any browser attempt to author the amount or currency;
3. map the already-authoritative payment/order identity to the provider request;
4. submit the charge to `POST https://api.mercadopago.com/v1/payments`;
5. send `Authorization: Bearer <server Access Token>` only from the server;
6. send a stable `X-Idempotency-Key` derived from the canonical internal payment attempt;
7. set `external_reference` to the canonical internal payment id;
8. preserve BRL validation, bounded provider reads and retry policy;
9. persist/map the provider payment reference before treating the operation as accepted;
10. continue using verified webhooks + authoritative provider readback for final state.

Official provider reference used for this contract:

- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/payment-submission
- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/cards

### Browser public key

The browser may receive only the Mercado Pago Public Key. The canonical browser configuration key for V2 will be:

`VITE_MERCADO_PAGO_PUBLIC_KEY`

The following values are NEVER browser configuration and MUST remain server-only:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- payment status/handoff secrets
- database credentials

Bricks initialization uses the public key only. Missing/invalid browser key must fail closed with a user-safe unavailable state rather than falling back to a real credential or another environment.

Official initialization reference:

- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/common-initialization

## Subscription contract

Recurring billing is a separate capability from one-time checkout. It MUST NOT be implemented as repeated browser-created payments.

The provider authority is Mercado Pago Subscriptions:

- create subscription: `POST /preapproval`;
- read subscription: `GET /preapproval/{id}`;
- update/pause/cancel/reactivate: `PUT /preapproval/{id}`;
- optional reusable plan authority: `/preapproval_plan`.

Official references:

- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post

The backend MUST own the allowed plan/frequency/amount configuration. The browser MUST NOT be allowed to choose an arbitrary recurring amount or cadence.

A subscription must have an internal durable identity and provider reference before it can be considered configured. Provider status is authoritative and must be reconciled/read back. Cancellation must be idempotent.

## Webhooks

The existing V2 sandbox webhook endpoint remains the canonical TEST ingress:

`/api/payments/v1/webhooks/sandbox`

Provider notifications do not become domain truth based only on URL/body parameters. Signature verification and authoritative provider readback remain mandatory before applying financial state transitions.

## Rollout sequence

1. Add public-key configuration contract and fail-closed browser bootstrap.
2. Add direct-card provider/domain contract without deleting Checkout Pro.
3. Add direct-card HTTP transport and browser Brick adapter.
4. Add deterministic unit/browser/provider-mock tests.
5. Add subscription domain/provider contract and durable persistence.
6. Add subscription HTTP/browser lifecycle with server-owned plan authority.
7. Run formatting, architecture, lint, typecheck, tests and build.
8. Run Payments contracts and canonical MySQL matrix.
9. Merge only with exact-head green evidence.
10. Configure `VITE_MERCADO_PAGO_PUBLIC_KEY` in V2 staging only.
11. Deploy the exact merged SHA to V2 staging.
12. Re-run Final Release Acceptance.
13. Execute one-time Mercado Pago TEST payment: Brick -> provider -> verified webhook -> readback -> reconciliation -> replay/idempotency -> TEST refund -> refund readback.
14. Execute subscription TEST lifecycle: create -> readback -> webhook/financial event where applicable -> pause/resume if supported by the selected contract -> cancel -> final readback.
15. Update Feature Registry, migration evidence and release closeout.

## Non-negotiable safety rules

- no production deployment or production mutation;
- no real card, real buyer or real money;
- no secret committed to GitHub;
- no secret pasted into issues, PRs, logs or chat;
- no legacy staging mutation;
- no browser-authored amount/currency;
- no silent fallback from TEST to production;
- no promotion to PROVIDER_VERIFIED until the real TEST lifecycle completes.

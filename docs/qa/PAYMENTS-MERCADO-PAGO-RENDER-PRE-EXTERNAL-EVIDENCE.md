# Payments / Mercado Pago / Render — Pre-External Evidence

## Scope

This evidence records what is implemented and statically auditable on `feat/payments-mercado-pago-render-v2` before any claim of provider verification.

It does **not** promote `FEATURE-0009` / `MIG-0010` to provider-verified or production-ready.

## Implemented candidate

- Mercado Pago Checkout Pro adapter on Financial provider ports.
- Fixed server-side API authority: `https://api.mercadopago.com/`.
- Checkout preference creation from authoritative Financial values.
- Exact checkout-origin allowlist.
- Refund adapter with durable idempotency key.
- Payment readback/reconciliation with identity, BRL and amount validation.
- Mercado Pago webhook authentication bound to:
  - `x-signature`;
  - `x-request-id`;
  - signed `data.id` query parameter;
  - exact query/body `data.id` consistency;
  - bounded signature timestamp window.
- Provider readback before terminal verified financial result.
- Non-terminal authentic notifications acknowledged without inventing terminal Financial state.
- Terminal events continue through immutable provider-event claim, verified outcome and accounting boundary.
- V1 credentials remain inside Render through `fromService.envVarKey`.
- V1 provider URL is inherited only for provider-identity verification; no secret is exposed.
- Render pre-deploy fails closed unless the V1 provider host is the direct official Mercado Pago API.
- Ordering + Financial migrations execute before traffic as a pre-deploy gate.
- Payments runtime startup fails closed when composition/configuration/persistence is unavailable.
- Platform `/healthz`, `/readyz`, release identity, correlation IDs and graceful shutdown are composed into the candidate.
- Render release identity can derive from Render-provided Git/deployment variables.
- Production Auth uses durable MySQL security state and fails readiness closed if unavailable.

## Reproducible commands prepared

```text
pnpm payments:predeploy
pnpm payments:mercado-pago:preflight
pnpm payments:render:smoke
```

`payments:predeploy` performs only configuration/provider-identity checks plus idempotent database migrations/readiness queries.

`payments:mercado-pago:preflight` is intentionally **not** part of deploy. It creates a controlled test Checkout Pro preference only when an operator supplies an approved test payer email and approved test amount.

`payments:render:smoke` validates the deployed V2 liveness/readiness and immutable release headers.

## Fail-closed provider reuse

The candidate inherits:

```text
V1 BUSINESS_PAYMENT_API_URL -> V2 V1_PAYMENT_PROVIDER_API_URL
V1 BUSINESS_PAYMENT_API_TOKEN -> V2 MERCADO_PAGO_ACCESS_TOKEN
V1 BUSINESS_PAYMENT_WEBHOOK_SECRET -> V2 MERCADO_PAGO_WEBHOOK_SECRET
```

Pre-deploy requires the inherited V1 URL to use HTTPS and host `api.mercadopago.com`.

If the V1 integration was actually a gateway/intermediary, the candidate stops with:

```text
V1_PAYMENT_PROVIDER_IS_NOT_DIRECT_MERCADO_PAGO
```

This is a blocker, not a fallback. A gateway token must never be sent to the direct Mercado Pago API.

## External evidence still required

Status: `BLOCKED_EXTERNAL` until all of the following exist:

1. Render Blueprint sync resolves the three V1 references in the same workspace.
2. `AUTH_DATABASE_URL`, Ordering DB, Financial DB and canonical pricing catalog are configured.
3. Pre-deploy returns `PAYMENTS-PREDEPLOY` v2 `pass`.
4. `/healthz` and `/readyz` return the expected release identity and readiness.
5. Provider preflight creates a test preference with the inherited/direct credential.
6. Mercado Pago webhook simulator validates the V2 HTTPS endpoint.
7. A controlled test payment proves checkout -> webhook -> readback -> verified result -> ledger.
8. Replay and invalid-signature behavior is observed on the deployed runtime.
9. Reconciliation validates provider/internal identity, amount and currency.
10. Controlled refund proves idempotent provider command and verified financial completion.
11. Browser smoke proves the real checkout/polling return journey.
12. Official exact-head CI gates execute successfully when GitHub Actions is available.

## Current acceptance statement

`CODE_PREPARED / EXTERNAL_VALIDATION_REQUIRED`

Do not translate this statement into `PROVIDER_VERIFIED`, `PRODUCTION_READY`, or global V2 GO.

# Render + Mercado Pago — V2 production readiness

## Status

`PRE-AUTHORIZATION / NO REAL MONEY`

This document describes the current V2 deployment contract. It does **not** authorize a real charge and it does not copy credentials from V1 or staging.

The canonical flow remains:

```text
Business handoff -> Ordering -> Financial -> Mercado Pago
                                      ^          |
                                      |          v
                         verified result <- webhook/readback
```

Browser and Business never receive Access Token, webhook secret or authority to declare a payment final.

## Environment separation

The canonical production service is:

```text
morro-digital-v2
```

The production Blueprint is intentionally separate from:

```text
morro-digital-v2-staging
morro-digital-v2-staging-mysql
```

Production must not inherit `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, database credentials or other secrets from V1/staging. `render.yaml` therefore contains no `fromService` secret bridge.

`V1_PAYMENT_PROVIDER_API_URL` is a legacy variable name retained for compatibility. In the production Blueprint its value is pinned to the official HTTPS API origin:

```text
https://api.mercadopago.com
```

The predeploy gate rejects any different provider host.

## Safe state before financial authorization

The production Blueprint remains locked to:

```text
PAYMENTS_PROVIDER_MODE=mercado_pago
MERCADO_PAGO_CHECKOUT_MODE=test
MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED=false
PAYMENTS_SUBSCRIPTIONS_ENABLED=false
PAYMENTS_RUNTIME_REPLICA_COUNT=1
PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED=false
```

`MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID` is a non-secret ledger reference and must remain unset until the owner has explicitly authorized the financial cutover for the exact release SHA.

A production-mode predeploy is fail-closed unless both controls exist:

1. `MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID=<approved non-secret reference>`;
2. `MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED=true`, set only after an authorized operator verifies that the configured Public Key and Access Token came from **Production > Production credentials** for the intended Mercado Pago application/seller.

No credential prefix is treated as proof of production status.

## Secrets

Never place any of these values in GitHub, PR/issue bodies, logs, artifacts, browser bundles or chat:

- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`;
- any Client Secret or equivalent private provider credential;
- database credentials;
- session or payment authority secrets.

`VITE_MERCADO_PAGO_PUBLIC_KEY` is browser-safe by design, but it must still correspond to the intended application and environment.

## Required production configuration slots

### Auth / platform

- `DASHBOARD_USERS_JSON`;
- `DASHBOARD_AUTH_ORIGIN`;
- `AUTH_DATABASE_URL`;
- `DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED`;
- `VITE_MAPBOX_ACCESS_TOKEN` and approved Mapbox style configuration;
- OpenAI settings only when the production AI gate separately authorizes them.

### Ordering / Financial

- `ORDERING_DATABASE_URL`;
- `FINANCIAL_DATABASE_URL`;
- `ORDERING_PRICING_CATALOG_JSON`;
- `PAYMENTS_RETURN_URL_ORIGINS`;
- `PAYMENTS_WEBHOOK_URL`.

Ordering and Financial must keep their intended ownership boundaries and durable storage.

### Mercado Pago

- `MERCADO_PAGO_ACCESS_TOKEN` — server only;
- `MERCADO_PAGO_WEBHOOK_SECRET` — server only;
- `VITE_MERCADO_PAGO_PUBLIC_KEY` — browser Public Key;
- `MERCADO_PAGO_CHECKOUT_ORIGINS` — exact HTTPS allowlist;
- `MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED` — operational attestation, initially false;
- `MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID` — financial authorization reference, initially unset.

For subscriptions, when and only when recurring billing is authorized:

- `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`;
- `MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY`;
- `PAYMENTS_SUBSCRIPTION_BACK_URL`;
- `PAYMENTS_SUBSCRIPTIONS_ENABLED=true`.

## Predeploy contract

The canonical predeploy command is:

```text
node apps/morro-digital-platform/tooling/payments-migrate.mjs
```

It validates provider identity/configuration before migrations and DB readiness. The successful record is `PAYMENTS-PREDEPLOY` contract version 3 and contains only non-secret state such as:

- provider identity;
- checkout mode;
- whether production authorization is present;
- whether production credentials were explicitly confirmed;
- whether subscriptions are enabled;
- migration/readiness contract identifiers.

No token or webhook secret is logged.

## TEST behavior in production infrastructure

Before financial authorization, the service may be materialized and technically deployed with checkout mode `test`, but Payments remains closed to unsafe use:

- direct Bricks payment requests in test mode require the separate `MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED=true` runtime confirmation before any provider call;
- the production Blueprint does not set that confirmation;
- production credential confirmation remains `false`;
- subscriptions remain disabled;
- no deliberate real payment is performed for readiness evidence.

Use the canonical staging environment for provider TEST lifecycle evidence. Do not turn the production environment into a substitute sandbox.

## Webhook contract

Canonical route:

```text
/api/payments/v1/webhooks/sandbox
```

The pathname is historical and does not by itself imply provider mode.

The implementation requires:

- HTTPS at the deployed edge;
- `x-signature`;
- `x-request-id`;
- `data.id` from the query-bound envelope;
- consistency with `data.id` in the raw JSON body;
- signed timestamp tolerance;
- HMAC-SHA256 verification;
- timing-safe digest comparison;
- provider readback before accepting terminal financial authority;
- replay/idempotency protections and durable verified outcome handling.

A callback is a signal, not final financial truth.

## Callback and checkout policy

`PAYMENTS_RETURN_URL_ORIGINS` must list only exact approved HTTPS origins.

Checkout preference construction uses the server-authoritative Ordering/Financial amount, sends the same canonical return URL for success/pending/failure, uses `auto_return=approved`, binds `external_reference` to the internal payment ID and sends the canonical webhook URL.

`MERCADO_PAGO_CHECKOUT_ORIGINS` must remain an exact allowlist. Never use wildcard or broaden it merely to make a provider response pass.

## Staging validation before production authorization

The existing provider TEST campaign should continue to prove:

1. create preference/payment;
2. approved/rejected/pending/cancelled paths;
3. timeout and bounded retry behavior;
4. webhook signature verification;
5. provider readback;
6. replay/idempotency handling;
7. authoritative amount/currency/external reference;
8. refund and refund readback;
9. reconciliation/settlement;
10. subscription preapproval, recurrence and cancellation when enabled in the dedicated TEST environment.

Staging evidence is necessary but is not proof that production credentials/application/seller are configured.

## Production cutover after explicit authorization

Use `docs/payments/MERCADO-PAGO-PRODUCTION-CUTOVER.md` as the authoritative cutover checklist.

At minimum:

1. freeze the exact certified release SHA;
2. confirm production infrastructure, canonical HTTPS origin and rollback target;
3. verify the intended Mercado Pago application/seller;
4. obtain/verify production Public Key and Access Token through the provider's supported credential flow;
5. configure secrets only in the production secret manager/environment;
6. set `MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED=true`;
7. record the approved non-secret `MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID`;
8. configure exact production return/callback/checkout origins;
9. change `MERCADO_PAGO_CHECKOUT_MODE=production` through the governed change path;
10. enable subscriptions only if recurring billing is explicitly authorized;
11. require predeploy v3 PASS, `/healthz`, `/readyz`, release identity and production security gates;
12. do not create a deliberate real charge unless that specific financial action is separately authorized.

## Rollback / NO-GO

Do not promote, or revert to the certified rollback target, if any of these occur:

- production service or database is not the canonical isolated resource;
- TEST/staging secret or URL is present in production;
- provider API host is not `api.mercadopago.com` over HTTPS;
- production credential source cannot be verified;
- financial authorization does not reference the exact release scope;
- predeploy/migration fails;
- `/readyz` is not healthy;
- webhook signature cannot be validated;
- provider readback or reconciliation disagrees on identity, amount, currency or state;
- replay duplicates accounting;
- refund is not idempotent;
- secrets appear in browser/log/evidence;
- Auth or durable financial state is unavailable.

Do not delete Payments, ledger, webhooks or financial evidence during rollback.

## Acceptance state

Until production infrastructure and provider-account evidence exist and the owner records financial authorization:

```text
CODE_CI_READY / PRODUCTION_EXTERNAL_VALIDATION_REQUIRED / NO_REAL_MONEY
```

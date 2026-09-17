# Mercado Pago — Production Cutover Runbook

Status: **PRE-AUTHORIZATION / NO REAL MONEY**

This runbook prepares the production financial boundary without authorizing a real charge. The owner must record an explicit financial authorization before `MERCADO_PAGO_CHECKOUT_MODE` can become `production`.

## Safe pre-authorization state

Production infrastructure must remain configured with:

- `PAYMENTS_PROVIDER_MODE=mercado_pago`;
- `MERCADO_PAGO_CHECKOUT_MODE=test`;
- `PAYMENTS_SUBSCRIPTIONS_ENABLED=false` unless recurring billing is explicitly included in the later authorization;
- one Payments runtime replica while the rate limiter remains process-local;
- production secrets stored only in the platform secret manager/environment, never GitHub, logs, artifacts, browser bundles or chat.

The predeploy guard rejects production mode without a non-secret `MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID`.

## Preconditions before financial authorization

Prove, without revealing secret values:

1. the canonical `morro-digital-v2` production service exists and is distinct from staging;
2. the production database/storage and canonical HTTPS origin are established;
3. a Mercado Pago production application exists for the intended seller/account;
4. the Checkout/Bricks production Public Key exists;
5. the production Access Token exists only server-side;
6. the webhook secret is configured only server-side;
7. the production callback, success, pending and failure URLs use the canonical HTTPS origin;
8. the webhook URL is the canonical HTTPS service URL ending in `/api/payments/v1/webhooks/sandbox` (legacy route name retained by the application contract);
9. the checkout-origin allowlist contains only provider origins actually observed/approved for production;
10. if subscriptions will be enabled, the dedicated subscriptions Access Token, Public Key and back URL are configured and bound to the approved application/seller;
11. Quality Gate, Payments contracts, dependency security, staging exact-SHA acceptance and production security gates are green for the candidate being promoted.

## Financial authorization record

The authorization record must state at minimum:

- owner/authorized actor;
- timestamp;
- exact release SHA;
- production seller/application scope;
- whether one-time payments are authorized;
- whether recurring subscriptions are authorized;
- maximum intended initial rollout scope;
- rollback target;
- a stable non-secret reference copied into `MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID`.

Do not place tokens, secret values, card data or PII in the authorization record.

## Cutover sequence after authorization

1. Re-read `main` and freeze the exact candidate SHA.
2. Confirm the authorization references that exact SHA and scope.
3. Confirm the production service is not using TEST/staging secrets or URLs.
4. Configure the production Public Key, Access Token and webhook secret in the secret manager/environment.
5. Configure the exact production return/callback origins.
6. Configure `MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID` with the approved non-secret ledger reference.
7. Change `MERCADO_PAGO_CHECKOUT_MODE` from `test` to `production` only through the governed production change path.
8. Enable `PAYMENTS_SUBSCRIPTIONS_ENABLED=true` only when recurring billing is explicitly authorized and the dedicated subscription configuration is complete.
9. Execute predeploy. It must report `PAYMENTS-PREDEPLOY` contract version 3 with `productionAuthorized=true`.
10. Validate `/healthz`, `/readyz`, startup and release identity before public traffic.
11. Validate webhook reachability/signature handling without fabricating provider authority.
12. Do not create a deliberate real charge unless a separate explicit instruction authorizes that transaction.

## Webhook and payment authority

The application must continue to treat provider callbacks as signals, not independent financial truth. Final state is accepted only through the established verified-webhook/readback/reconciliation contracts. Keep replay/idempotency, authoritative amount/currency, refund readback and settlement/reconciliation gates enabled.

## Rollback

If predeploy, health, readiness, provider configuration or post-deploy smoke fails:

1. stop the promotion before public traffic when possible;
2. redeploy the last certified rollback SHA/configuration snapshot;
3. confirm release identity, health and readiness;
4. keep production charging disabled until the incident is reconciled;
5. record the failed cutover and evidence in Issue #33.

Never bypass the cutover guard, weaken webhook verification, relax checkout-origin allowlists, disable readback, or lower security gates merely to obtain a green deployment.

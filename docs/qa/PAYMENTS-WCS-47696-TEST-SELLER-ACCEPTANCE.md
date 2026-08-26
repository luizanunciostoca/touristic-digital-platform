# Payments — WCS-47696 TEST seller acceptance

## Purpose

Record the provider-confirmed TEST path for Mercado Pago Subscriptions `/preapproval` without weakening the staging fail-closed boundary.

This evidence supersedes the earlier assumption that the Subscriptions acceptance must use the `TEST-` credential exposed by the real-account application `3226503835657400`.

## Provider support clarification — 2026-08-26

Mercado Pago support, ticket `WCS-47696`, clarified two points:

1. `payer_email` must be the exact email registered in the TEST buyer profile. It must be obtained by logging in as that TEST buyer and reading its profile; documentation sample emails must not be substituted.
2. For this Subscriptions acceptance, the seller credential must come from an application created or accessed while logged in as the TEST seller account. In that TEST-seller application, the credentials shown under **production credentials** belong to the TEST user and are used as TEST credentials for `/preapproval`.

Current public Mercado Pago documentation independently describes this TEST-seller pattern: [TEST accounts have the same capabilities as real accounts and must use seller, buyer, and official test-card fixtures](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/accounts). Mercado Pago also documents that a TEST seller Access Token may begin with `APP_USR`, and that some sandbox flows use production credentials belonging to TEST users. Consequently, `live_mode` is recorded as evidence but is never treated in isolation as proof of real or TEST identity; the authoritative proof is the verified TEST seller plus the application and collector IDs returned by provider readback.

## Credential pairing invariant

The next controlled acceptance must use a single TEST-seller application as the source of both:

- `MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY` — Public Key from the TEST-seller application;
- `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN` — `APP_USR-...` Access Token from the same TEST-seller application.

Do not combine a card token created with the old real-account application's `TEST-` Public Key with the TEST-seller application's `APP_USR-...` Access Token. Public Key and Access Token must be from the same TEST-seller application.

The old real-account application `3226503835657400` remains historical evidence for the previous diagnostics and must not be silently treated as the new TEST-seller application.

## Fail-closed provenance contract

When `MERCADO_PAGO_CHECKOUT_MODE=test` and the dedicated Subscriptions Access Token begins with `APP_USR-`, the V2 runtime accepts it only in `morro-digital-v2-staging` and only when all non-secret provenance metadata is explicitly configured:

```text
MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN=test_seller_account
MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID=<numeric TEST seller User ID>
MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID=<numeric application ID created by that TEST seller>
```

Missing, malformed, or non-staging provenance fails closed with:

```text
MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APP_PROVENANCE_REQUIRED
```

This metadata is not a credential. It documents operator intent and prevents an `APP_USR` copied from the real account from being accepted accidentally in TEST-mode staging.

Every successful authoritative `GET /preapproval/{id}` in this mode must also return:

```text
application_id == MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID
collector_id == MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID
```

Missing or mismatched provider identity fails closed as `MERCADO_PAGO_INVALID_RESPONSE` before the response can become local authority. A successful acceptance records only the expected non-secret IDs and never records credentials.

## Buyer invariant

For the support reproduction, use the TEST buyer explicitly referenced in ticket `WCS-47696`:

```text
User ID: 3589393515
Username: TESTUSER5342613438582193243
```

The exact email must be read from that buyer's profile after logging in as the TEST buyer and then configured as:

```text
STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL=<exact TEST buyer profile email>
```

The runtime continues to reject payer emails outside `@testuser.com` during staging acceptance.

## `X-scope` for the support-prescribed retry

The public `/preapproval` API contract does not require `X-scope`. The earlier `TEST-` credential diagnostics showed that omitting `X-scope` while still tokenizing through the old application produced `Card_token_service_not_found`, which is consistent with a credential/application-context mismatch rather than proof that `X-scope` is required.

For the support-prescribed TEST-seller application retry, use:

```text
STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER=omit
```

only during the explicit exact-SHA acceptance window. The existing runtime guard permits omission only when all of these are true:

- `MERCADO_PAGO_CHECKOUT_MODE=test`;
- `RENDER_SERVICE_NAME=morro-digital-v2-staging`;
- `STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN=true`.

After the attempt, acceptance and autorun must be disabled again.

## Secret handling

Never place any of the following in GitHub comments, issues, PR text, chat, screenshots, or logs:

- TEST seller password;
- verification code;
- `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`;
- Client Secret;
- webhook secrets.

Configure secrets only through the provider/Render secure UI.

## Required evidence before one provider retry

- [ ] exact payer email obtained from the specified TEST buyer profile;
- [ ] TEST seller User ID recorded (non-secret);
- [ ] application created/accessed while logged in as TEST seller;
- [ ] TEST-seller application ID recorded (non-secret);
- [ ] Public Key and Access Token taken from that same TEST-seller application;
- [ ] Access Token configured in Render without exposing it elsewhere;
- [ ] credential-origin metadata configured;
- [ ] PR exact head CI green;
- [ ] exact-head staging deploy live with acceptance disabled;
- [ ] one bounded acceptance window armed;
- [ ] `X-scope` omitted for this support-prescribed comparison;
- [ ] card tokenization succeeds with the official TEST card after `/users/me` proves the expected TEST seller;
- [ ] `live_mode` and credential mode are recorded as sanitized evidence, without treating either field in isolation as seller identity;
- [ ] authoritative `GET /preapproval/{id}` proves the configured TEST-seller `application_id` and `collector_id`;
- [ ] no real card, real money, real buyer, or real-account production Access Token used.

Only after these checks may a single controlled `POST /preapproval` be reproduced for ticket `WCS-47696`.

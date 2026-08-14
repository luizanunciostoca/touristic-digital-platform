# PAYMENTS M140 — Sandbox Provider Evidence

## Scope

M140 executes checkout creation behind the existing `FinancialCheckoutProviderPort`. It does not trust a provider outcome, confirm a Payment, activate Business, expose a webhook receiver or move money.

## Authoritative mapping and idempotency

The Ordering transport creates or replays the durable M138/M139 Order, Payment and checkout-access authority before invoking the provider port. It then builds the provider request exclusively from:

- authoritative integer minor-unit Money and immutable plan description;
- the validated Business contractor and return URL;
- a server-owned webhook URL;
- authoritative Order, Payment, session, destination and tenant references.

The wire `Idempotency-Key` is the already durable `payment:v1:<orderReference>`. An exact HTTP retry calls the provider with an identical immutable request; divergent Business authority is rejected before the provider.

The create response exposes only the allowlisted sandbox checkout URL in addition to the existing non-PII projection. Provider status or payment references do not mutate Payment in M140.

## Fail-closed sandbox adapter

Runtime startup requires all of:

- `PAYMENTS_PROVIDER_MODE=sandbox`;
- a valid sandbox base URL;
- a bearer token of at least 32 characters;
- one or more exact checkout origins;
- a valid 500–15000 ms timeout;
- a valid server webhook URL.

Production accepts HTTPS only. Embedded credentials, query/hash in configuration endpoints and redirects are denied. Response bodies are streamed with a 64 KiB ceiling. Provider rejection, outage and malformed/unsafe responses collapse to stable error codes and the public transport returns only `CHECKOUT_UNAVAILABLE`.

No credential, provider body or contractor PII is written to checkout audit.

## Executable evidence

Domain/provider tests prove:

- strict request/session normalization and immutable values;
- exact amount, external reference, metadata and idempotency mapping;
- missing mode/token/origin failure;
- provider 4xx, network outage, oversized body and wrong checkout origin normalization;
- transport retry equality and provider-error non-leakage.

`tooling/payments/provider-sandbox-contract.test.ts` starts a real local HTTP server, validates the wire headers/body and stores one deterministic checkout session per financial idempotency key. Two adapter calls traverse the socket and receive the same session.

The permanent `Payments Sandbox Provider Contract` workflow runs provider unit tests, Ordering composition tests and this HTTP wire contract without third-party credentials. Quality and Payments Persistence Integration remain required on the same promotion head.

Validated checkpoint `97ee51deb3dc288f16ea1a1b2b5a4eea7b6b73e7`:

- Quality Gate `31847069740 — SUCCESS`;
- Payments Persistence Integration `31847069803 — SUCCESS`;
- Payments Sandbox Provider Contract `31847069794 — SUCCESS`.

Final promotion still requires the same three gates on the final documentation head.

## Migration result

```text
PASS     15
PARTIAL  10
GAP       8
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence remain false. The broader sandbox/provider E2E row is PARTIAL because no deployed third-party sandbox or browser journey is claimed.

## Rollback and limits

M140 adds no database schema. Disabling the sandbox adapter or versioned route leaves durable Order/Payment/access records intact. A sandbox session already created remains externally idempotent and cannot confirm internal state without a later verified event path.

M140 does not implement webhook verification/deduplication, Payment outcome application, operational ledger posting, refund/reconciliation, settlement, subscriptions, browser checkout or real money.

## Next milestone

M141 is the raw-body cryptographic webhook boundary with durable event deduplication and replay/out-of-order protection.

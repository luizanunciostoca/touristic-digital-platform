# PAYMENTS M141 — Verified Webhook and Replay Evidence

## Scope

M141 receives sandbox provider events through a fixed versioned callback, verifies authenticity over the exact raw bytes and durably claims the first signed event before any later state mutation. It deliberately does not change Payment or Business.

## Cryptographic boundary

The callback is `POST /api/payments/v1/webhooks/sandbox` with `application/json` and a maximum body of 64 KiB.

`X-Sandbox-Signature` has the exact form:

```text
t=<unix-seconds>,v1=<lowercase-hex-hmac-sha256>
```

The signed message is the byte concatenation of the decimal timestamp, one `.` byte and the unmodified HTTP request body. The runtime preserves those bytes; the verifier checks a configurable 60–900 second window and compares 32-byte digests timing-safely. UTF-8 decoding, JSON parsing and event normalization occur only after verification succeeds.

The independent `PAYMENTS_SANDBOX_WEBHOOK_SECRET` is server-only and must contain at least 32 characters.

## Durable event claim

`financial_provider_events` is an additive Financial-owned table. It stores:

- strongly normalized `pwe_*` event identity;
- M140 Payment ID as external reference;
- bounded provider payment reference and normalized provider status;
- canonical occurrence/first-receive timestamps;
- SHA-256 of the signed payload;
- optional matched Payment ID.

The first insert wins. An exact replay returns the immutable first receipt even if its receive time or later lookup context differs. Reuse of the same event ID with different normalized content or payload hash raises `FINANCIAL_PROVIDER_EVENT_COLLISION` and never overwrites the original row.

A valid unknown Payment reference is still persisted and acknowledged with HTTP 202, `matched=false`. This preserves evidence for reconciliation without disclosing internal existence through an error.

## HTTP and audit semantics

- invalid/missing signature or invalid signed payload: `401 WEBHOOK_UNAUTHORIZED`;
- verified new or exact replay: `202` with only `accepted`, `matched` and `replayed`;
- divergent signed event-ID reuse: `409 WEBHOOK_EVENT_CONFLICT`;
- verifier/database outage: `503 WEBHOOK_UNAVAILABLE`;
- non-POST exact route: `405`.

Structured audit records verification denial, match/replay and collision without raw body, HMAC secret, provider payment reference, customer data or checkout status token.

## Executable evidence

Unit contracts prove exact-byte verification, signed timestamp tolerance, tamper/stale rejection, strict event normalization, unmatched acknowledgement, replay projection, collision normalization and absence of Payment mutation.

MySQL 8.4 integration proves the first receipt is immutable, exact replay is idempotent and divergent reuse cannot replace the original status/hash. Runtime tests prove the Node adapter forwards the exact bytes and signature header instead of parsed/reserialized JSON.

Checkpoint `08f0f68e07463d0ec44be14db6f61dfeaedf0289` already passed:

- Payments Persistence Integration `31848663060 — SUCCESS`;
- Payments Sandbox Provider Contract `31848663133 — SUCCESS`.

The permanent Payments Verified Webhook Contract plus repository-wide Quality remain required on the final promotion head.

## Migration result

```text
PASS     18
PARTIAL   9
GAP       6
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence remain false.

## Rollback and limits

The schema is append-only and additive. Route rollback must retain verified rows for forensics and later reconciliation. Secret rotation requires provider coordination within the signed retry window.

M141 does not apply provider outcomes, confirm/fail/refund Payment, emit an authoritative Business result, post ledger entries, reconcile, settle, subscribe, launch browser checkout or move real money.

## Next milestone

M142 applies newly claimed matched events through the explicit Payment state machine and publishes the verified result for Business without trusting browser return.

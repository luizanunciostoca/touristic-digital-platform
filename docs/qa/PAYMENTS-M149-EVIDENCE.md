# PAYMENTS M149 — Browser Checkout Launch / Confirmation Evidence

## Objective

M149 implements the Payments-owned browser checkout client that was still missing after the M146 backend financial slice. The work started in parallel on the historical branch `feat/payments-m148-browser-checkout`; after Ticketing M148 became canonical and merged, PR #226 was renumbered to M149 without rewriting branch history.

## Executable browser contract

- consumes a normalized Business commercial checkout handoff without moving financial authority into Business;
- derives the exact `business:<sessionId>:<planId>` idempotency key;
- accepts exactly one create-authority model already audited by M139: authenticated CSRF + exact Business scope, or a server-issued checkout-handoff capability;
- never mints guest HMAC capability or exposes server signing material in browser code;
- creates through `POST /api/payments/v1/checkouts` with same-origin credentials and bounded JSON parsing;
- keeps the plaintext status capability private to the client closure and out of local/session storage;
- opens the provider checkout with `noopener,noreferrer`, using location fallback only when popup creation is blocked;
- preserves the V1 polling budget of 2500 ms × 240 attempts;
- treats `CONFIRMED` without authoritative `verifiedPayment` as incomplete and continues polling;
- fails closed on checkout/session identity substitution, terminal failure and timeout;
- emits the existing Business-compatible `businessPaymentVerified` and `businessPaymentVerificationFailed` signals without granting either signal financial mutation authority.

## Authority boundary

M149 does not auto-wire the public `businessCheckoutRequested` event into Payments. The current Business onboarding can produce the handoff, but it has no legitimate public browser source for create authority. Guest signing remains a server-only HMAC operation backed by secret material, while authenticated create requires a real platform session, same-origin mutation protection, CSRF and exact `X-Business-ID` scope.

Adding an HMAC secret to the browser, fabricating CSRF, inferring Business authority or introducing anonymous checkout would regress M139. A later authority-bootstrap/composition milestone must provide one of M139's existing authority models before live Business checkout is connected.

## Permanent evidence

`Payments M149 Browser Checkout Contract` builds the workspace, runs the focused client unit contract and launches deterministic Chromium. The browser proof validates launch headers/idempotency, private status-token reuse, bounded polling, authoritative confirmation, Business success/failure signalling, safe popup behavior, blocked-popup fallback, zero storage persistence of the status capability and zero page errors.

Final promotion additionally requires repository-wide Quality on the same final head/merge ref. Backend Payments contracts remain authoritative and are not replaced by this browser proof.

## Migration result

```text
PASS     27
PARTIAL   5
GAP       1
N/A       1
TOTAL    34
```

`FEATURE-0009` / `MIG-0010` remain `migrating`. The remaining GAP is subscription lifecycle. Business → Payments authority composition, financial observability, deployed provider/browser E2E, distributed rate limiting and release/rollback completion remain PARTIAL.

## Rollback

The M149 adapter is additive and has no schema or provider mutation authority of its own. Removing browser composition/client usage leaves M139–M146 server-side Ordering/Financial state, verified results, reconciliation and immutable ledger history intact. No rollback may delete or rewrite financial evidence.

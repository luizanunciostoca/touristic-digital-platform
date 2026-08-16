# Ticketing / Reservations — Capability Matrix

## Baseline

`FEATURE-0011` is a V2-native capability. The Feature Registry declares `legacySources: []`, and the frozen V1 baseline used by the migration program has no authoritative Ticketing/Reservations domain to reproduce. Therefore the V1 column is `N/A` for Ticketing-specific behavior; this matrix measures completeness of the intended V2 capability rather than pretending parity with a legacy implementation that did not exist.

Canonical V2 sequence:

```text
Catalog / Inventory
  -> temporary Reservation hold
  -> canonical Ordering checkout
  -> canonical Financial payment authority
  -> Reservation confirmation
  -> Ticket issuance
  -> QR / human code
  -> validation / use / cancellation
  -> offline sync where applicable
```

Ticketing never creates a parallel checkout and never treats browser/provider redirect state as payment authority.

## Final matrix after #276

| Capability | V1 | V2 status | Evidence / boundary |
| --- | --- | --- | --- |
| Ticket/product catalog identity | N/A | PASS | Durable inventory/catalog contract |
| Server-authoritative price snapshot | N/A | PASS | Pricing version captured under authoritative hold |
| Sale/event availability windows | N/A | PASS | Validated server-side windows |
| Capacity / inventory | N/A | PASS | Durable inventory with locking |
| Temporary reservation hold | N/A | PASS | Durable held reservation lifecycle |
| Hold expiration | N/A | PASS | Locked stale-hold expiry |
| Reservation cancellation | N/A | PASS | Capacity is released deterministically |
| Reservation confirmation | N/A | PASS | Canonical Ordering binding plus Financial verified-result authority |
| Reservation idempotency | N/A | PASS | Request-key replay and semantic collision protection |
| Overselling protection | N/A | PASS | Inventory locking and concurrency proof |
| Reservation audit | N/A | PASS | Append-only reservation events |
| Reservation -> Order relation | N/A | PASS | Ordering-owned Ticketing reservation binding |
| Reservation -> Payment relation | N/A | PASS | Persisted Financial result binding; browser is non-authoritative |
| Backend payment as fulfillment authority | N/A | PASS | Only persisted verified Financial outcomes can authorize fulfillment |
| Ticket issuance after payment | N/A | PASS | Ticketing application/fulfillment bridge |
| Ticket -> Order -> Payment relation | N/A | PASS | Durable canonical identities |
| Signed QR payload without PII | N/A | PASS | Signed Ticketing payload |
| Human ticket code | N/A | PASS | Deterministic server-owned code |
| QR visual image rendering | N/A | PASS | Public Ticketing browser surface renders QR artifacts |
| Online validation/check-in | N/A | PASS | Durable transactional check-in |
| Check-in replay safety | N/A | PASS | Deterministic attempt identity and replay |
| Concurrent check-in safety | N/A | PASS | Transactional locking and stale-transition protection |
| Offline device credential provisioning | N/A | PASS | Device credential boundary implemented without exposing server signing authority |
| Offline check-in envelope/sync | N/A | PASS | Signed offline envelope and durable verified-result processing |
| Public authenticated Ticketing HTTP API | N/A | PASS | Authenticated `/api/ticketing` runtime |
| Ticket/Reservation browser UI | N/A | PASS | Public Ticketing browser surface integrated |
| Refund -> reservation/ticket cancellation orchestration | N/A | PASS | Financial-authoritative refund cancellation path |
| Reservation -> ticket fulfillment orchestration | N/A | PASS | Canonical Ordering/Financial handoff drives fulfillment |
| Release/rollback activation contract | N/A | PASS | `docs/runbooks/TICKETING-FEATURE-0011-RELEASE.md` and fail-closed rollback path |

## Final evidence

PR #276 rebuilt FEATURE-0011 directly from the then-current `main` instead of promoting the stale historical #265/#270 branches. The final candidate head `1a5af7ef4c85821714f54c934667fb5669fdca06` was zero behind and mergeable at promotion time and completed 24 check runs with zero failures, zero in-progress and zero cancelled checks.

Permanent gates included Quality, Ticketing Contract, MySQL Integration, Payments Browser Checkout, Auth Login Browser, Sandbox Provider, Verified Outcome, Verified Webhook, Transaction, Refund Command, Recurrence, Settlement, Reconciliation and Operational Ledger contracts.

The integrated implementation preserves the authority chain:

```text
Business / Ticketing intent
  -> Ordering canonical order/reservation binding
  -> Payments / Financial verified outcome authority
  -> Ticketing fulfillment / cancellation
```

Browser state, redirect state and provider command acceptance remain non-authoritative.

## Status

`FEATURE-0011` is `equivalent`, not `released`.

For this V2-native feature, `equivalent` means the approved V2 capability is implemented with applicable behavioral, browser/API, persistence, security and rollback evidence. Production deployment remains a separate release/readiness concern and does not justify leaving the feature registry on the obsolete pre-#276 `migrating` state.

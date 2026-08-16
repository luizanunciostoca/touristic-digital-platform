# FEATURE-0011 Ticketing — release and rollback runbook

Status: **candidate only while PR #265 is unmerged**. FEATURE-0011 remains `migrating` until the coordinator promotes the exact validated head and completes the activation evidence below.

## Authority boundaries

- Ticketing owns inventory, holds, reservation lifecycle, ticket issuance and check-in.
- Ordering owns the canonical Order and the immutable Reservation → Order binding.
- Financial owns Payment state and persisted verified provider outcomes.
- The browser/provider redirect is never payment authority.
- A Ticket is fulfilled only after persisted `VerifiedPaymentResult(kind=approved, paymentStatus=confirmed)` is re-read by the backend authority adapter.
- A paid Reservation/Ticket is cancelled only after persisted `Payment.refunded` plus matching persisted `VerifiedPaymentResult(kind=refunded, paymentStatus=refunded)`.
- QR signing secret and offline-device provisioning master secret are server-only.

## Required server configuration

All secrets must be supplied through the deployment secret/config mechanism; never bake them into browser assets.

```text
TICKETING_FEATURE_ENABLED=false
TICKETING_DATABASE_URL=<server-only MySQL URL>
TICKETING_SIGNING_SECRET=<independent secret, >=32 chars>
TICKETING_OFFLINE_PROVISIONING_SECRET=<independent secret, >=32 chars>
TICKETING_FINANCIAL_POLL_INTERVAL_MS=1000
ORDERING_DATABASE_URL=<canonical Ordering MySQL URL>
FINANCIAL_DATABASE_URL=<canonical Financial MySQL URL>
PAYMENTS_STATUS_TOKEN_SECRET=<existing Payments status secret>
PAYMENTS_RETURN_URL_ORIGINS=<existing exact allowlist; must include deployed Morro Digital origin>
PAYMENTS_PROVIDER_MODE=<existing canonical provider mode>
PAYMENTS_SANDBOX_PROVIDER_BASE_URL=<existing canonical provider config when sandbox>
PAYMENTS_SANDBOX_PROVIDER_API_TOKEN=<existing canonical provider config when sandbox>
PAYMENTS_SANDBOX_CHECKOUT_ORIGINS=<existing canonical provider allowlist>
PAYMENTS_PROVIDER_TIMEOUT_MS=<existing canonical provider timeout>
PAYMENTS_WEBHOOK_URL=<existing canonical provider webhook>
```

`TICKETING_FEATURE_ENABLED` is fail-closed: any value other than the exact string `true` keeps the Ticketing API/processor unavailable. Do not use the flag to skip migrations or checks.

## Additive migrations

Before activation, apply/verify these idempotent application schemas against their owning databases:

1. Ordering base/checkout schema (`M137/M139`) and the additive Ticketing bridge migration:
   - `ordering_orders.source_kind` accepts `ticketing_reservation`;
   - `ordering_orders.request_key` accepts `ticketing:<reservation>`;
   - `ordering_ticketing_reservation_bindings` exists with immutable one-to-one Order relation.
2. Ticketing `M147` ticket/check-in schema.
3. Ticketing `M150` inventory/reservation schema.
4. Ticketing Financial bridge:
   - confirmed → refunded-cancelled invariant support;
   - durable Financial result cursor.
5. Ticketing public API holder profile schema.
6. Financial `M145` provider/payment-result persistence remains canonical and is not duplicated.

Historical M137/M147/M150 migration definitions are not rewritten by this feature. Ticketing deltas are additive.

## Dark deployment

1. Deploy the exact coordinator-approved SHA with `TICKETING_FEATURE_ENABLED=false`.
2. Confirm existing Business/Payments/Financial routes remain healthy.
3. Run Quality, Ticketing M147, Ticketing M148, Payments persistence/settlement checks and MySQL integration against that exact SHA.
4. Verify `GET /api/ticketing/v1/inventory` returns `503 TICKETING_FEATURE_DISABLED` while disabled.
5. Verify existing `/api/payments/v1/checkouts/:orderId` status remains unchanged.

## Controlled activation

Set `TICKETING_FEATURE_ENABLED=true` only after the dark-deploy checks pass.

Smoke sequence with a non-production/safe provider identity:

1. Authenticate a test user.
2. `GET /api/ticketing/v1/inventory` and record `availableQuantity`.
3. `POST /api/ticketing/v1/reservations` with CSRF + a unique `Idempotency-Key`; repeat the exact request and require exact replay/no extra capacity consumption.
4. Confirm a canonical `ordering_orders` row with `source_kind=ticketing_reservation` and exactly one `ordering_ticketing_reservation_bindings` row.
5. Create checkout through **only** `/api/payments/v1/checkouts/ticketing-reservations`; repeat with the same idempotency key and require the same Payment.
6. Confirm the browser redirect alone does not confirm the Reservation or emit a Ticket.
7. Deliver a correctly signed provider success through the existing Payments webhook; verify Financial persists the provider event/result before Ticketing fulfillment.
8. Wait for the durable Ticketing Financial cursor to advance; verify Reservation becomes `confirmed`, exactly one Ticket is issued, QR payload has no holder name/email/document, and replay does not issue a second Ticket.
9. Perform online check-in twice concurrently; require one state transition and replay-safe subsequent result/no double-spend.
10. Provision a short-lived offline device credential for the destination; verify tampering/expiry/wrong-destination rejection and replay-safe offline sync.
11. Deliver a verified Financial refund for an unused Ticket; require Reservation + Ticket cancellation in one Ticketing transaction and preserved `orderId/paymentId/confirmedAt` audit linkage.
12. Attempt the same refund path after marking a Ticket `used`; require fail-closed rollback with no Reservation cancellation.
13. Confirm the browser wallet displays the server-rendered QR and human code only after verified fulfillment.

## Observability during activation

Watch for these error families and treat any sustained occurrence as an activation blocker:

- `TICKETING_RESERVATION_*`
- `TICKETING_ORDERING_*`
- `TICKETING_REFUND_*`
- `TICKETING_DEVICE_*`
- `TICKETING_OFFLINE_*`
- `ORDERING_TICKETING_*`
- `CHECKOUT_UNAVAILABLE`

Also watch the durable Financial cursor. A growing gap between newest `financial_payment_results.recorded_at` and the Ticketing cursor indicates fulfillment/refund processing is stalled even if the HTTP API is healthy.

## Immediate rollback

The safe production rollback is **operational first**, not destructive schema rollback:

1. Set `TICKETING_FEATURE_ENABLED=false`.
2. Stop/restart the application revision so no new Ticketing HTTP mutations or Financial-result drains start.
3. Keep Ordering, Financial and Ticketing records intact for audit/recovery.
4. Confirm existing Payments webhook processing continues; disabling Ticketing must not disable canonical Financial persistence.
5. Revert the application revision to the last known-good pre-Ticketing release if required.

Do **not** delete confirmed/refunded Reservation, Order, Payment or Ticket history during rollback.

## Schema rollback constraints

Down SQL is intended for empty/non-production rollback or a production rollback that has been proven to contain no live Ticketing financial history. Before any destructive rollback, prove all of the following:

- no `ordering_orders` with `source_kind='ticketing_reservation'` need to be retained;
- no reservation is `held` or `confirmed`;
- no Ticketing Order binding is referenced by a Payment/result/audit record;
- no issued/validated/used/refunded-cancelled Ticketing history would be lost.

If any condition is false, keep the additive schema and only disable the feature flag.

## Exit criteria from `migrating`

The coordinator may promote FEATURE-0011 only when all are true on the **same current-main-integrated SHA**:

- strict Ticketing migration matrix is `29 PASS / 0 PARTIAL / 0 GAP`;
- Quality Gate is green;
- Ticketing M147 and M148 permanent contracts are green;
- MySQL capacity/oversell/replay/expiry/cancellation and Ordering binding tests are green;
- persisted Financial confirmation → automatic Ticket fulfillment is green;
- persisted verified refund → atomic cancellation is green;
- authenticated API/browser/visual QR/offline credential paths are green;
- dark deploy, activation smoke and rollback-disable evidence are recorded;
- Feature Registry and MASTER-MIGRATION-TRACKER are updated by the coordinator-controlled promotion.

Until those conditions are satisfied, keep FEATURE-0011 as `migrating` even when the implementation PR is a complete candidate.

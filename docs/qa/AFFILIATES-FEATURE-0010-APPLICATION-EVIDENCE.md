# FEATURE-0010 application-stage addendum

`AFFILIATE-POLICY-V1` is approved. The current PR line contains both the pure Affiliate domain and audited application orchestration.

Application-stage guarantees now implemented:

- Affiliate attribution is locked per Order at canonical `pending_payment`; a subject remains free to receive a later valid attribution for future Orders.
- A new Order lock requires the Affiliate to remain active. Suspension after an existing lock allows later conversion evidence to be preserved but produces a disputed entitlement rather than an earnable one.
- Authorization/Eligibility/Ordering/Financial/referral-validation calls occur outside the Affiliate write transaction.
- The write transaction revalidates relevant durable Affiliate state, claims idempotency, applies the domain mutation, completes idempotency and appends audit/outbox atomically.
- Financial evidence is queried only after conversion authorization succeeds.
- Financial materialization is only persisted/enqueued as a request. Affiliate does not execute Financial writes, payout, settlement or ledger mutation.
- Exact replay is audit-visible and does not duplicate canonical state or outbox events.

Still intentionally absent: durable Affiliate SQL adapters/migrations, concrete Ordering/Financial adapters, materialization dispatcher/readback integration, HTTP API and UI.

Therefore `FEATURE-0010` remains `planned`, `MIG-0011` remains `discovered`, and PR #264 remains draft until the missing durable/integration/release evidence exists and the exact final head passes official gates.

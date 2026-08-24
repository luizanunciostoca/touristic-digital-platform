# FEATURE-0010 Affiliates — Test and Invariant Plan

## Status

`AFFILIATE-POLICY-V1` is approved and the full Affiliate domain/runtime is executable on `main`.

Final integrated runtime evidence before this documentation reconciliation:

```text
main = a2a1f10420c1d452e9426c75549864c76d57f22c
certified PR head = 851740d2429c41d18f81f0e476fc2fb67a6a0c3b
certified tree = f1ef9038de983a69737c94a2d218eec57e179efb
main tree = f1ef9038de983a69737c94a2d218eec57e179efb
Quality Gate #242 = PASS
Affiliates FEATURE-0010 Contract #102 = PASS
Render Staging Blueprint Contract #66 = PASS
```

The certified PR head and merged main have the same Git tree, so the acceptance evidence applies byte-for-byte to the integrated runtime.

## Permanent architecture and policy gate

The Affiliate workflow verifies:

- canonical scope, Technical Contract, approved Decision Sheet, threat model, migration matrix and rollout/rollback docs exist;
- `AFFILIATE-POLICY-V1` remains the only approved policy;
- Affiliate source does not import Business/Ordering/Financial implementations or apps;
- Financial remains the sole monetary authority;
- Ordering remains the sole Order authority;
- Affiliate runtime contains no provider credential, payout destination, monetary ledger instruction or browser-controlled rate/amount authority;
- architecture and Feature Registry checks pass;
- root `affiliates:check` executes Affiliate lint, typecheck, tests and build;
- approved constants remain 30-day attribution, 3000 bps, percentage-only, no subscription-renewal commission and Financial-authoritative eligible platform revenue.

## Executable domain tests

`packages/affiliates` acceptance covers:

### Policy and eligibility

- approved policy constants are frozen;
- attribution eligibility requires verified Identity/contact, current terms, approved membership and no fraud/suspension block;
- Financial materialization additionally requires Financial eligibility;
- suspension cannot silently create a new active/earned right.

### Referral evidence and attribution

- accepted/validated evidence only;
- malformed digest/timestamp fails closed;
- authoritative IDs, SHA-256 fingerprint and timestamps are server-owned;
- 30-day expiry uses server time;
- source precedence is checkout code > authenticated S2S > validated link/QR;
- latest valid evidence wins within the same tier;
- direct/organic evidence does not erase a valid Affiliate intent;
- locked Order attribution cannot be replaced;
- browser/client time cannot extend the window.

### Conversion

- Ordering must be `payment_confirmed`;
- verified Financial evidence and eligible revenue are mandatory;
- stale/mismatched Ordering/Financial evidence fails closed;
- subscription renewal is rejected in V1;
- browser click/redirect/callback cannot qualify;
- one Order yields at most one canonical Affiliate conversion.

### Commission entitlement

- 3000-bps calculation uses integer minor units;
- half-up behavior is asserted on rounding boundaries;
- unsafe/fractional inputs fail;
- maturity waits at least seven days after verified payment and until service/performance when later;
- invalid lifecycle transitions fail without mutation;
- partial refund before earned reprices under the original policy snapshot;
- full refund before earned cancels;
- refund after earned creates an explicit audited reversal consequence/revision;
- Financial remains monetary reversal authority.

### Financial materialization boundary

- only eligible `earned` entitlement can request materialization;
- request carries identity/revision/digest/correlation only;
- request contains no browser-controlled amount, rate, currency, payout destination, provider secret, ledger or settlement instruction;
- `accepted` is never represented as paid/settled/transferred;
- exact replay converges;
- uncertain delivery performs Financial readback before retry;
- conflicting local/Financial outcomes fail closed.

## Application-service and security acceptance

The server suites cover the authoritative sequence:

1. authentication/authorization;
2. eligibility resolution/locking where applicable;
3. canonical source/evidence validation;
4. semantic idempotency claim;
5. domain invariant execution;
6. durable transactional mutation;
7. audit/outbox recording;
8. original-outcome persistence/readback.

Negative acceptance includes:

- public/anonymous authoritative mutation denial;
- Business/tenant authority does not administer Affiliate;
- cross-affiliate/cross-destination/program mismatch fails closed;
- stale/divergent idempotency replay fails closed;
- browser-supplied commission/rate/eligible-revenue authority is rejected;
- suspension blocks new attribution/materialization while preserving historical replay/evidence;
- Financial rejection/conflict cannot mutate Affiliate-owned monetary state because no such state exists.

## Concurrency and replay acceptance

Real MySQL acceptance proves:

- per-subject attribution serialization and deterministic precedence under concurrent evidence;
- duplicate semantic referral evidence converges and divergent reuse fails closed;
- exact historical referral replay remains valid during suspension;
- suspension/new-referral races are serialized by row locks;
- one Order/one conversion invariant under durable idempotency and unique persistence;
- entitlement mutation uses revision/row locking;
- `maturity × partial refund` converges to one durable entitlement;
- `partial refund × full refund` cannot reverse more than the original snapshot;
- materialization exact replay/restart/readback/retry is durable.

## Audit/idempotency acceptance

- state-changing accepted/rejected/replayed/conflict outcomes are audit-visible where required;
- audit carries actor, authorization decision, policy version, correlation/causation and semantic/state digest evidence;
- audit/observability excludes raw referral token/full URL, copied identity document and provider credential;
- exact replay does not duplicate canonical state/events;
- idempotency and state survive restart through MySQL persistence.

## Privacy/LGPD acceptance

Executable integration proves:

- raw referral retention max/default policy of 90 days;
- pseudonymous attribution/conversion retention of 24 months;
- commercial/audit/reconciliation retention of five years after final closure/settlement;
- configurable legal hold preserves required records;
- DSR lookup is isolated and authorized;
- anonymization/pseudonymization is idempotent;
- duplicate execution/restart does not corrupt retained state;
- Affiliate jobs do not delete Financial accounting history.

## Persistence/migration acceptance

- additive Affiliate schema applies on the canonical MySQL test environment;
- unique/idempotency constraints protect referral/conversion/materialization identities;
- transactional application code couples mutation with required audit/outbox/idempotency state;
- stale entitlement revision is rejected;
- no destructive down migration is required for normal rollback.

## Rollout/rollback acceptance

- Affiliate → Financial materialization has an independent disable boundary;
- durable readback remains available after uncertain delivery;
- disabling Affiliate writers does not delete audit/reconciliation history;
- no rollback can create Affiliate-owned Payment/ledger/wallet/payout authority;
- Render staging blueprint contract is green on the certified tree;
- the connected staging service is isolated from the V1 service and uses a private V2 MySQL service; its current Render branch binding is not treated as final-runtime deployment evidence because the available connector cannot retarget an existing service branch safely.

## Final CI gate order

1. frozen install;
2. `pnpm format:check`;
3. architecture/platform contracts/Feature Registry/governance/supply-chain;
4. repository lint/typecheck/tests/build;
5. canonical MySQL matrix;
6. `pnpm affiliates:check`;
7. real Affiliate MySQL persistence suites;
8. Affiliate authority/policy contract;
9. Render staging blueprint contract;
10. final matrix/registry/tracker reconciliation.

## Completion evidence

On the certified integrated tree:

- domain Affiliate tests: PASS;
- server Affiliate tests: PASS;
- Privacy MySQL: PASS;
- Identity/Suspension MySQL: PASS;
- Attribution MySQL: PASS;
- Commercial MySQL: PASS;
- Quality Gate #242: PASS;
- Affiliates FEATURE-0010 Contract #102: PASS;
- Render Staging Blueprint Contract #66: PASS;
- provider/real-money execution for Affiliate acceptance: NOT APPLICABLE / NOT EXECUTED;
- production touched: NO.

The final documentation reconciliation must itself pass Quality and Affiliates Contract on one exact head before merge.

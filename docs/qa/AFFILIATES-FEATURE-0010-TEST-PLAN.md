# FEATURE-0010 Affiliates — Test and Invariant Plan

## Status

`AFFILIATE-POLICY-V1` is approved and the pure domain foundation exists in `packages/affiliates`.

The current test target is no longer a policy-neutral placeholder: approved V1 policy values must be asserted explicitly. `FEATURE-0010` remains `planned` and `MIG-0011` remains `discovered` until persistence/integration/release evidence is complete.

## Permanent architecture and policy gate

The Affiliate workflow must verify:

- canonical scope, Technical Contract, approved Decision Sheet, threat model, migration matrix and rollout/rollback docs exist;
- the Decision Sheet contains exactly 19 approved decisions and policy version `AFFILIATE-POLICY-V1`;
- `FEATURE-0010` stays `planned` with equivalence flags false until complete evidence exists;
- `MIG-0011` stays `discovered` during the current implementation stage;
- `packages/affiliates` exists and `services/affiliates` remains absent until persistence/application service work is intentionally introduced;
- Affiliate source does not import Business/Ordering/Financial implementations, service internals or apps;
- Affiliate runtime contains no provider credentials, payout destination or settlement instruction;
- architecture and Feature Registry checks pass;
- root `affiliates:check` executes Affiliate lint, typecheck, tests and build;
- approved constants remain 30-day attribution, 3000 bps, percentage-only, no subscription renewal commission and Financial net eligible platform revenue authority.

## Executable domain tests — current

`packages/affiliates/src/index.test.ts` must cover at minimum:

### Policy and eligibility

- `AFFILIATE-POLICY-V1` approved constants are frozen;
- attribution eligibility requires verified Identity/contact, terms, approved membership and no fraud/suspension block;
- Financial materialization eligibility additionally requires Financial onboarding eligibility.

### Referral evidence and attribution

- unvalidated evidence cannot become canonical evidence;
- malformed digest/timestamp fails closed;
- 30-day expiry uses server time;
- source precedence is checkout code > authenticated server referral > link/QR;
- latest valid evidence wins inside the same precedence tier;
- locked Order attribution cannot be replaced;
- browser/client time cannot extend the authoritative window.

### Conversion

- Ordering must be `payment_confirmed`;
- verified Financial payment/conversion evidence is mandatory;
- Financial eligible revenue/currency/digest/contract version are required;
- subscription renewal is rejected in V1;
- browser click/redirect/callback cannot qualify.

### Commission entitlement

- 3000-bps calculation uses integer minor units;
- half-up behavior is tested on exact half-unit boundaries;
- unsafe/fractional inputs fail;
- maturity waits at least seven days after verified payment and until service/performance when later;
- suspension/dispute cannot silently become earned;
- invalid lifecycle transitions fail without mutation;
- partial refund before earned reprices under the original policy;
- full refund before earned cancels;
- refund after earned creates explicit reversal evidence preserving previous and remaining amount.

### Financial materialization boundary

- only `earned` + Financial-eligible entitlement can request materialization;
- request contains identity/revision/digest/correlation only;
- request does not contain commission amount, rate, currency, payout destination, provider secret or settlement instruction;
- `accepted` is not represented as paid/settled/transferred.

### Idempotency

- immutable inputs are canonicalized independent of object-key order;
- key format is `affiliate:v1:<operation>:<sha256>`;
- invalid operation/digest fails closed.

## Application-service tests — next stage

Every authoritative use case must test the sequence:

1. explicit authorization;
2. eligibility resolution where applicable;
3. canonical source/evidence validation;
4. deterministic idempotency key;
5. durable idempotency claim;
6. domain invariant execution;
7. repository mutation using compare-and-swap/unique constraints;
8. immutable audit append;
9. event/outbox recording where applicable.

Required negative cases:

- anonymous/public caller attempts authoritative mutation;
- tenant/Business membership attempts Affiliate administration;
- affiliate A accesses affiliate B;
- stale policy/version;
- reused idempotency key with divergent semantic digest;
- concurrent duplicate evidence/Order conversion/entitlement claim;
- persistence failure before/after idempotency claim;
- audit/outbox failure and transaction rollback behavior.

## Ordering/Financial integration tests — future stages

- public Ordering adapter returns canonical Order evidence only;
- Financial adapter returns verified payment and eligible-revenue evidence only;
- one Order yields at most one canonical Affiliate conversion under concurrency;
- stale/mismatched Ordering/Financial evidence fails closed;
- Financial independently validates materialization entitlement/evidence;
- exact materialization replay converges;
- uncertain delivery performs durable readback before any retry;
- Financial rejection causes no Affiliate-owned ledger/payable/settlement mutation;
- refund/cancellation/reversal remains Financial-authoritative for monetary consequence.

## Authorization/security tests

- browser/public evidence cannot directly create attribution, conversion, entitlement or materialization;
- Business roles confer no Affiliate permission;
- admin operations require explicit platform capability;
- self-service proves canonical Identity ownership;
- service-to-Financial materialization requires Affiliate service identity;
- cross-affiliate/cross-destination access fails closed;
- direct database/provider access across domain boundaries is absent.

## Audit/idempotency tests

- every state-changing accepted/rejected/replayed/conflict outcome is audit-visible;
- audit carries actor, authorization decision, policy version, correlation/causation and state digests where applicable;
- audit contains no raw referral token, full URL, identity document or provider credential;
- idempotency survives restart and parallel requests;
- exact replay does not duplicate canonical state or events.

## Privacy/LGPD tests

- raw referral retention default is 90 days and configurable by jurisdiction/legal hold;
- pseudonymous attribution/conversion retention defaults to 24 months from relevant activity;
- commercial/audit evidence defaults to five years after closure/settlement subject to applicable rules;
- expiry deletes/anonymizes only data permitted to be removed;
- DSR/export lookup is authorized and Identity-scoped;
- Financial/accounting history is never deleted by Affiliate retention jobs;
- observability/analytics use sanitized identifiers only.

## Persistence/migration tests — before durable stage promotion

- additive migration applies to empty and current schema;
- unique constraints enforce evidence fingerprint, one conversion per Order and durable idempotency identities;
- optimistic revision/CAS rejects stale writes;
- transaction includes mutation, idempotency/audit/outbox claims where required;
- expand-only rollback disables writers before application rollback;
- no down migration destroys evidence needed for audit/reconciliation or any Financial history.

## Rollout tests

- feature disabled: no Affiliate authoritative side effects;
- shadow mode validates evidence/metrics without entitlement/materialization mutation;
- materialization kill switch prevents new handoffs while preserving durable state;
- recovery reads durable materialization state before retry;
- mixed-version deployment preserves old policy snapshots;
- final promotion uses one exact, zero-behind head.

## CI gate order

1. frozen install;
2. `pnpm format:check`;
3. architecture/platform contracts/Feature Registry;
4. repository lint/typecheck/tests/build;
5. `pnpm affiliates:check`;
6. Affiliate persistence integration tests once persistence exists;
7. Ordering/Financial contract integration tests once adapters exist;
8. authorization/security/privacy/concurrency tests;
9. browser/admin E2E only after those surfaces exist;
10. release evidence reconciliation.

## Current evidence boundary

Local engineering validation for the domain foundation includes strict TypeScript compilation and a compiled-JavaScript smoke suite. The permanent Vitest/ESLint/Prettier/frozen-install gates are defined but cannot be claimed green until they execute in the repository environment. GitHub Actions startup failure is not a passing Quality result.

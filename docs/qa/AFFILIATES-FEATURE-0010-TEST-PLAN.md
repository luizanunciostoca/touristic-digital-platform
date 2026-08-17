# FEATURE-0010 Affiliates — Test and Invariant Plan

## Status

This is the canonical test plan before commercial policy approval. It defines tests that can be prepared now and decision-dependent scenarios that become parameterized fixtures later. No test is allowed to invent a rate, attribution window or lifecycle rule.

## Static architecture gate — executable without product decisions

The permanent Affiliate contract workflow must verify:

- canonical Affiliate scope, technical contract, Decision Sheet, threat model, migration matrix and rollout/rollback docs exist;
- `FEATURE-0010` stays `planned` with all equivalence flags false until runtime/equivalence evidence exists;
- `MIG-0011` stays `discovered` during this policy-neutral phase;
- no `packages/affiliates` or `services/affiliates` runtime exists before the Decision Sheet gate is satisfied;
- architecture and Feature Registry checks pass;
- Business/Ordering/Financial ownership statements are present and do not grant Affiliate monetary authority;
- Decision Sheet contains exactly the 19 required product decisions.

## Domain tests after policy approval

### Identity and program state

- normalize/reject malformed IDs;
- reject missing canonical Identity relationship;
- enforce approved identity cardinality and eligibility/suspension rules through policy fixtures;
- optimistic concurrency rejects stale writes;
- exact replay returns the same result.

### Referral evidence

- each approved source has positive and negative trust/signature fixtures;
- malformed/oversized evidence fails before mutation;
- duplicate source evidence converges;
- same idempotency key with divergent evidence fails closed;
- client time cannot override server receipt time;
- raw secret/token/URL data is absent from audit/events/observability.

### Attribution

- approved subject type is required;
- precedence conflicts are tested from versioned policy fixtures;
- window start/expiry/reset is tested at exact boundaries using an injected clock;
- parallel claims produce one deterministic authoritative result;
- no browser marker alone creates attribution.

### Conversion association

- only approved canonical Ordering/Financial evidence qualifies;
- nonexistent/stale/mismatched order references fail;
- browser callback/click alone fails;
- duplicate association converges;
- out-of-order events are retained/retried or rejected according to the versioned contract without fabricating a conversion.

### Commission entitlement

- policy snapshot version is mandatory and immutable;
- calculation is deterministic for approved fixtures;
- base/model/rate/rounding/caps/currency are supplied only by approved policy fixtures;
- lifecycle transitions match the approved transition graph;
- invalid transition fails without mutation;
- replay and concurrency are deterministic;
- no entitlement path writes Financial persistence.

## Affiliate → Financial integration tests

- request contains entitlement identity/revision/digest and no browser monetary authority;
- Financial rejects unknown/stale/tampered entitlement evidence without ledger/payable/settlement mutation;
- exact materialization replay converges;
- divergent request with reused key fails;
- accepted request is not reported as payout/settlement;
- Financial independently validates its required Ordering/Payment/reconciliation evidence;
- transient rejection is retryable only when explicitly classified;
- uncertain delivery performs durable readback before retry;
- refund/cancellation/reversal fixtures follow the approved policy while Financial remains the monetary authority.

## Authorization tests

- anonymous/browser caller cannot perform authoritative mutations;
- Business tenant/member cannot administer Affiliate by inheritance;
- affiliate A cannot read/write affiliate B;
- cross-destination access fails closed unless explicitly authorized;
- privileged admin action requires the intended platform scope and appends audit;
- Affiliate service identity is required for Financial handoff;
- direct database/provider access from Affiliate is absent by architecture gate.

## Audit and idempotency tests

- every state-changing outcome emits immutable audit metadata;
- replay outcome is audit-visible without duplicating business state;
- conflict/divergence is audit-visible;
- actor, authorization decision, policy version, correlation and causation are present where applicable;
- secrets/raw referral tokens/identity documents are absent;
- idempotency survives process restart and parallel requests.

## Privacy/LGPD tests

- retention duration is configuration/policy, not hard-coded;
- expired evidence follows the approved deletion/anonymization behavior;
- legal/audit hold does not corrupt Financial history;
- data export/subject lookup is scoped to the authorized identity;
- observability and analytics contain sanitized identifiers only;
- privileged evidence reads are audit logged.

## Threat-model negative tests

Cover at least:

- affiliate-ID tampering;
- referral replay/stuffing;
- attribution hijacking;
- client clock manipulation;
- fake conversion;
- monetary/formula injection;
- stale policy replay;
- stale entitlement materialization;
- refund/materialization race;
- tenant privilege escalation;
- PII/log leakage;
- event schema/version poisoning;
- evidence flood/rate-limit behavior.

## Persistence and migration tests

- additive migrations apply to an empty database and current production schema;
- unique/idempotency constraints enforce canonical claims;
- rollback disables writers before application rollback;
- backward-compatible readers tolerate expanded schema;
- no down migration deletes Affiliate evidence needed for audit or any Financial history;
- a pre-activation rollback leaves Financial state untouched.

## Rollout tests

- feature disabled: no Affiliate side effects;
- shadow/read-only mode: evidence validation and metrics may run without entitlement/Financial mutation;
- materialization kill switch blocks new handoffs without deleting records;
- recovery replays durable pending work idempotently;
- mixed-version deployment remains compatible during expand/contract;
- final promotion requires Quality, architecture, unit, integration, security and E2E gates on one exact head.

## CI gate order after runtime exists

1. frozen install;
2. format check;
3. architecture plus platform contracts plus Feature Registry;
4. lint;
5. typecheck;
6. Affiliate unit/invariant tests;
7. Affiliate persistence integration tests;
8. Ordering/Financial contract integration tests;
9. authorization/security/privacy negative tests;
10. build;
11. browser/admin E2E only after those surfaces exist;
12. release-candidate evidence reconciliation.

Until runtime exists, the static architecture gate is the only Affiliate-specific executable gate; full repository Quality must still pass when GitHub Actions is available.

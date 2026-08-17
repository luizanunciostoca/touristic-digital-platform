# Affiliates Rollout and Rollback — FEATURE-0010

## Status

Policy-neutral operational plan. It defines how Affiliate runtime must be introduced and disabled without choosing any commercial rule.

## Release principles

- expand before activate;
- server authority before browser/UI;
- durable idempotency/audit before any cross-domain side effect;
- read-only/shadow validation before Financial materialization;
- Financial materialization has an independent kill switch;
- no Affiliate-owned payment, wallet, payout or settlement path exists at any phase;
- rollback is application/traffic/feature-state first and data-destructive last/never by default;
- immutable Financial and Affiliate audit history is preserved.

## Rollout sequence

### R0 — documentation/policy gate

Current phase. No runtime. Merge is allowed only after official CI returns and the exact PR head passes Quality/contract gates. Commercial implementation remains blocked on the Decision Sheet.

### R1 — additive foundation, disabled

After approval:

- create additive Affiliate schema and repositories;
- deploy with all Affiliate writes/materialization disabled;
- validate migrations, health/readiness and authorization wiring;
- verify no Financial schema/provider behavior changed.

### R2 — evidence intake shadow mode

- accept only approved source contracts;
- validate/normalize/digest evidence;
- optionally persist shadow evidence if privacy/retention approval permits it;
- do not establish authoritative attribution unless the feature flag explicitly enables that stage;
- no commission or Financial materialization.

### R3 — attribution/conversion authoritative mode

- enable server-authoritative attribution and canonical conversion association for a bounded cohort;
- monitor replay/conflict/security/privacy metrics;
- keep entitlement Financial handoff disabled.

### R4 — entitlement mode

- enable approved deterministic entitlement policy for a bounded cohort;
- verify policy version/snapshot/audit/idempotency;
- still keep Financial materialization disabled until integration gates pass.

### R5 — Financial materialization dark launch

- enable the Affiliate → Financial port only for controlled records;
- prove accepted/rejected/replayed semantics;
- verify Financial performs independent authority checks;
- verify no payout/settlement claim is emitted from Affiliate.

### R6 — controlled production expansion

- expand cohort gradually after security/privacy/financial reconciliation evidence;
- enable authenticated read projections;
- browser/admin UI remains last and never receives monetary authority.

## Required kill switches

Independent controls must exist for:

- referral evidence intake;
- authoritative attribution writes;
- conversion association;
- entitlement mutation;
- Affiliate → Financial materialization;
- Affiliate/admin browser surfaces.

Disabling Financial materialization must not disable readback/reconciliation of requests already accepted by Financial.

## Rollback order

1. disable new Affiliate → Financial materialization;
2. disable new entitlement mutations if the defect can change entitlement integrity;
3. disable conversion/attribution writes as required;
4. leave durable readback/audit/reconciliation paths available;
5. roll application version back to the last compatible release;
6. preserve expanded schema until all older/newer mixed-version readers are gone and retention obligations are understood;
7. perform no destructive down migration against Affiliate evidence or Financial history by default.

## Financial safety during rollback

- requests already accepted by Financial remain Financial-owned and are reconciled by Financial;
- Affiliate rollback cannot mark payable/settlement/payout as reversed/paid/cancelled;
- any approved entitlement consequence after refund/cancellation is expressed through the versioned Financial boundary, never direct Financial writes;
- uncertain handoff delivery requires durable readback before retry;
- disabling Affiliate never deletes or rewrites ledger entries.

## Data rollback

Application rollback and data rollback are separate decisions.

Additive schema may remain dormant after feature disablement. Destructive column/table removal is deferred to a later contract phase after:

- no supported runtime reads it;
- retention/LGPD obligations are satisfied;
- audit/export requirements are preserved;
- backups/restore are verified;
- Financial has no reference requiring the data.

## Observability required before activation

At minimum, emit sanitized observations for:

- evidence accepted/rejected/replayed/conflicted;
- attribution established/rejected/conflicted;
- conversion association accepted/rejected;
- entitlement transition accepted/rejected/replayed;
- materialization requested/accepted/rejected/readback/retry;
- authorization denial;
- idempotency divergence;
- privacy retention/deletion failures;
- dependency degradation/recovery for Ordering/Financial reads.

No metric/log contains raw referral token, raw URL, direct identity document or provider credential.

## Promotion gates

A stage advances only when:

- the exact release head passes full repository Quality;
- stage-specific tests in `AFFILIATES-FEATURE-0010-TEST-PLAN.md` pass;
- no ownership invariant is violated;
- relevant threat-model negatives pass;
- rollback/kill switch for that stage is verified;
- observation/audit evidence is available;
- Financial reconciliation remains clean for stages that use the handoff.

## Current rollback

For the current documentation-only PR, rollback is a normal Git revert of the documentation/workflow commit. There is no runtime, migration, money movement or data rollback.
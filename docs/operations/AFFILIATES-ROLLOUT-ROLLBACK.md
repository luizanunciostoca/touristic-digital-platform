# Affiliates Rollout and Rollback — FEATURE-0010

## Status

Executable Affiliate runtime is integrated on `main` under `AFFILIATE-POLICY-V1`. The implementation is additive, server-authoritative and preserves Financial as the only monetary authority.

Final integrated runtime checkpoint before this documentation reconciliation:

```text
main = a2a1f10420c1d452e9426c75549864c76d57f22c
certified tree = f1ef9038de983a69737c94a2d218eec57e179efb
Quality Gate #242 = PASS
Affiliates FEATURE-0010 Contract #102 = PASS
Render Staging Blueprint Contract #66 = PASS
```

No real Mercado Pago call, real-money Affiliate flow or production execution was used in this acceptance campaign.

## Release principles

- expand before activate;
- server authority before browser/UI;
- durable idempotency/audit before cross-domain handoff;
- Ordering/Financial evidence remains authoritative;
- Financial materialization has an independent disable boundary;
- no Affiliate-owned Payment, eligible revenue, ledger, payable/wallet, payout, settlement, FX or monetary reversal path exists;
- rollback is application/traffic/feature-state first and data-destructive last/never by default;
- immutable Financial and Affiliate audit/reconciliation history is preserved.

## Current implementation state

### Foundation — complete

- additive Affiliate MySQL schemas and repositories;
- canonical Identity/program membership and eligibility/suspension;
- authenticated server boundary;
- audit/idempotency/outbox;
- privacy/LGPD controls.

### Referral and attribution — complete

- approved source validation;
- server-owned IDs/timestamps/SHA-256 fingerprint;
- pseudonymous AcquisitionSubjectId;
- policy precedence and 30-day server window;
- per-subject serialization;
- Order lock;
- exact/divergent replay acceptance.

### Conversion and entitlement — complete

- canonical Ordering/Financial evidence checks;
- one Order/one conversion invariant;
- 3000-bps integer half-up policy snapshot;
- durable entitlement lifecycle/revisions;
- suspension/freeze/dispute semantics;
- maturity/refund/reversal concurrency acceptance.

### Financial materialization boundary — complete, non-monetary on Affiliate side

- versioned request/result/readback;
- durable local request state;
- uncertain-delivery readback before retry;
- exact replay and conflicting-outcome fail-closed behavior;
- no Affiliate-provided monetary/provider/payout instructions.

`accepted` means Financial accepted the request. It never means paid, settled, transferred or payout-completed.

## Required operational switches/boundaries

Operational disablement must remain independently possible for:

- referral evidence intake;
- authoritative attribution writes;
- conversion association;
- entitlement mutation;
- Affiliate → Financial materialization;
- optional Affiliate/admin browser surfaces.

Disabling new materialization must not disable readback/reconciliation of requests already accepted by Financial.

## Rollback order

1. disable new Affiliate → Financial materialization;
2. disable new entitlement mutations if a defect can change entitlement integrity;
3. disable conversion/attribution writes as required;
4. preserve durable readback/audit/reconciliation paths;
5. roll application version back to the last compatible release;
6. keep additive schema until mixed-version readers are gone and retention obligations are satisfied;
7. do not destructively remove Affiliate evidence or Financial history as a normal rollback action.

## Financial safety during rollback

- requests already accepted by Financial remain Financial-owned and are reconciled by Financial;
- Affiliate rollback cannot mark payable/settlement/payout as reversed/paid/cancelled;
- refund/cancellation consequences are commercial Affiliate evidence plus a versioned Financial boundary, never direct Financial writes;
- uncertain handoff delivery requires durable readback before retry;
- disabling Affiliate never deletes or rewrites ledger entries;
- browser/admin state cannot become a fallback monetary authority.

## Data rollback

Application rollback and data rollback are separate decisions.

Additive schema may remain dormant after feature disablement. Destructive column/table removal is deferred until:

- no supported runtime reads it;
- retention/LGPD obligations are satisfied;
- audit/export requirements are preserved;
- backups/restore requirements are satisfied;
- Financial has no retained reference requiring the data.

## Observability requirements

Sanitized observations/audit should cover:

- evidence accepted/rejected/replayed/conflicted;
- attribution established/rejected/conflicted;
- conversion association accepted/rejected;
- entitlement transition accepted/rejected/replayed;
- materialization requested/accepted/rejected/readback/retry;
- authorization denial;
- idempotency divergence;
- privacy retention/deletion failure;
- dependency degradation/recovery for Ordering/Financial reads.

No metric/log may contain raw referral token, full raw referral URL, copied identity document or provider credential.

## Staging evidence

The permanent Render Staging Blueprint Contract is PASS on the certified tree.

The connected Render account contains an isolated V2 staging web service and an isolated private V2 MySQL service. The web service currently has auto-deploy disabled and remains bound to a historical Payments branch. The available Render connector can trigger deploys but cannot retarget an existing service branch; therefore this campaign deliberately did not deploy the wrong branch or create a second incompletely configured service merely to claim live runtime evidence.

This limitation does not transfer authority or weaken runtime acceptance: exact-tree Quality, Affiliate Contract and real MySQL acceptance are the release evidence for FEATURE-0010. A future operational deployment can retarget the existing isolated staging service through a branch-setting-capable control plane before enabling traffic.

## Promotion gates

FEATURE-0010/MIG-0011 may be promoted only when:

- exact runtime tree passes full repository Quality;
- Affiliate domain/server/MySQL acceptance passes;
- authorization/security/privacy/concurrency invariants pass;
- Render staging blueprint contract passes;
- Financial/Ordering ownership remains intact;
- no provider/real-money execution is falsely required for Affiliate-owned behavior;
- rollback preserves durable readback/audit/reconciliation;
- the final documentation reconciliation passes Quality and Affiliates Contract on its own exact head.

## Current rollback baseline

The last certified executable runtime before documentation promotion is `main@a2a1f10420c1d452e9426c75549864c76d57f22c`, tree `f1ef9038de983a69737c94a2d218eec57e179efb`.

If the reconciliation itself causes only documentation/registry drift, rollback is a normal Git revert of that reconciliation. Runtime rollback continues to follow the application-first sequence above; no destructive down migration or Financial-history deletion is authorized.
# Affiliates Migration Matrix — FEATURE-0010 / MIG-0011

## Purpose

Track FEATURE-0010 technical readiness against the approved `AFFILIATE-POLICY-V1`, executable runtime, real MySQL acceptance and permanent repository gates without transferring monetary authority out of Financial.

## Final result

```text
PASS       25
PARTIAL     0
GAP         0
N/A         2
TOTAL      27
```

All required capabilities are PASS. The two N/A rows are intentional product/authority outcomes, not missing implementation: browser/admin surfaces are not required for server-side Affiliate equivalence, and Affiliate-owned payout/payment/wallet is prohibited.

`FEATURE-0010` and `MIG-0011` are eligible for `equivalent` in the same reconciliation PR, subject to that PR's own exact-head Quality and Affiliates Contract gates.

## Certified integrated evidence — 2026-08-24

```text
integrated main = a2a1f10420c1d452e9426c75549864c76d57f22c
certified PR head = 851740d2429c41d18f81f0e476fc2fb67a6a0c3b
certified tree = f1ef9038de983a69737c94a2d218eec57e179efb
main tree = f1ef9038de983a69737c94a2d218eec57e179efb
Quality Gate #242 = PASS
Affiliates FEATURE-0010 Contract #102 = PASS
Render Staging Blueprint Contract #66 = PASS
```

The certified PR head and merged `main` have the same Git tree. Therefore the exact-head CI evidence applies byte-for-byte to the integrated runtime.

Affiliate acceptance used no real Mercado Pago call, no real-money execution and no production execution. Provider verification is `NOT_APPLICABLE` to Affiliate because provider/payment execution is Financial authority.

## Matrix

| Capability | Status | Final canonical evidence | Remaining blocker |
| --- | --- | --- | --- |
| Affiliate is a separate platform domain | PASS | Domain Map, Module Contracts and canonical scope explicitly separate Affiliate from Business/Ordering/Financial | none |
| Business ownership boundary | PASS | Authorization tests and contracts prove Business/tenant membership does not administer Affiliate | none |
| Ordering read boundary | PASS | Ordering remains canonical Order authority; conversion requires versioned `payment_confirmed` evidence and valid locked attribution | none |
| Financial monetary authority boundary | PASS | Financial owns Payment, eligible revenue, ledger, payable/wallet, settlement, payout, reconciliation, FX and monetary reversals; Affiliate has no provider/ledger mutation path | none |
| Conceptual Affiliate schemas | PASS | Executable domain types plus additive MySQL schemas cover identity, membership, referral, attribution, conversion, entitlement, materialization, audit/idempotency/outbox | none |
| Affiliate identity | PASS | Identity application service, durable MySQL persistence/readback, membership lifecycle, invalid-transition rejection, authorization and restart evidence | none |
| Eligibility and suspension | PASS | Transactional eligibility gate, row locking, destination/program isolation, new-attribution/materialization blocking and historical replay/conversion preservation during suspension | none |
| Referral/attribution evidence | PASS | Accepted-source validation, server-owned IDs/timestamps, SHA-256 fingerprint, durable MySQL evidence, audit/outbox and exact/divergent replay acceptance | none |
| Attribution subject and precedence | PASS | Server-owned pseudonymous `AcquisitionSubjectId`, checkout > S2S > link/QR precedence, latest-within-tier, direct does not erase, per-subject serialization | none |
| Attribution window | PASS | 30-day server-clock boundary tests, durable expiry, canonical Order lock and replay acceptance | none |
| Conversion association | PASS | Valid locked attribution + Ordering `payment_confirmed` + verified Financial evidence; one Order/one conversion persistence and `OrderingEvidence=null` fail-closed acceptance | none |
| Commission entitlement ownership | PASS | Affiliate owns commercial entitlement evidence/revisions only; Financial owns monetary consequence | none |
| Commission formula/policy | PASS | 3000 bps, integer minor units, `BigInt` intermediate, final half-up rounding and immutable `AFFILIATE-POLICY-V1` snapshot acceptance | none |
| Commission lifecycle | PASS | `pending/earned/cancelled/reversed/disputed`, seven-day/service-date maturity, durable revisions, invalid-transition rejection and concurrency acceptance | none |
| Refund/cancellation consequences | PASS | Pending partial/full refund repricing/cancellation, post-earned audited reversal evidence, `maturity × refund` and `partial × full refund` race acceptance | none |
| Canonical Affiliate event family | PASS | Durable outbox/event family for referral, attribution, conversion, entitlement and Financial materialization request | none |
| Idempotency strategy | PASS | Durable semantic claims, original-outcome replay, divergent replay fail-closed, restart persistence and duplicate/concurrent execution acceptance | none |
| Audit contract | PASS | Immutable audit/outbox evidence across authoritative operations with actor/auth/policy/correlation/idempotency context | none |
| Authorization boundaries | PASS | Authenticated HTTP/service boundary, explicit Affiliate capabilities, public fail-closed and destination/cross-affiliate isolation | none |
| Privacy/LGPD controls | PASS | Retention 90d/24m/5y, DSR, anonymization/pseudonymization, legal hold, audit, tenant/subject isolation, duplicate execution and restart acceptance | none |
| Affiliate → Financial port | PASS | Versioned request/result/readback, durable retry/readback, exact/divergent outcome handling and no browser-controlled money/rate/payout/provider instruction | none |
| Test and invariants plan | PASS | Domain/server tests, real MySQL suites and permanent exact-head Affiliate/Quality gates reconciled in `AFFILIATES-FEATURE-0010-TEST-PLAN.md` | none |
| Threat model | PASS | `AFFILIATES-THREAT-MODEL.md` plus fail-closed authorization, replay, isolation and monetary-authority negatives | none |
| Migration plan | PASS | Additive schemas/runtime integrated sequentially through Privacy, Identity, Attribution and Commercial waves | none |
| Rollout/rollback | PASS | Application-first rollback, independent materialization disable boundary, durable readback/audit preservation and Render staging blueprint PASS | none |
| Browser/admin surfaces | N/A | Server-side feature is complete without an authoritative browser/admin surface; any future UI remains presentation/input only | intentionally optional |
| Affiliate-owned payout/payment/wallet | N/A | Prohibited by canonical authority; Financial exclusively owns monetary state and provider execution | must never be implemented |

## Product decision gate

**SATISFIED.** `AFFILIATE-POLICY-V1` remains the only approved policy.

A different rate, attribution window, precedence rule, maturity rule, retention duration or monetary authority requires a new explicitly approved/versioned policy. UI, browser state, provider behavior or implementation convenience cannot reinterpret V1.

## Executable checkpoint

```text
packages/affiliates                         PRESENT
services/affiliates                         PRESENT
Affiliate MySQL schemas/repositories         PRESENT
Identity/membership lifecycle                PASS
Eligibility/suspension                       PASS
Referral/attribution                         PASS
Conversion/commission/refunds                PASS
Privacy/LGPD                                 PASS
Idempotency/audit/outbox                     PASS
Authenticated HTTP boundary                  PASS
Financial materialization request/readback   PASS
Canonical MySQL execution                    PASS
Quality Gate #242                            PASS
Affiliates Contract #102                     PASS
Render Staging Blueprint #66                 PASS
Browser monetary authority                   PROHIBITED
Affiliate-owned payout/wallet                 PROHIBITED
```

## Operational staging note

The connected Render account contains an isolated V2 staging web service and private V2 MySQL service. The web service currently remains bound to a historical Payments branch with auto-deploy disabled. The available connector cannot retarget an existing Render service branch, so this campaign did not deploy the wrong branch merely to claim live staging evidence. The permanent Render staging blueprint contract is PASS on the certified runtime tree.

This limitation is recorded as an operational control-plane constraint, not a FEATURE-0010 behavioral gap: Affiliate equivalence is established by exact-tree repository, real-MySQL, security/privacy/concurrency and ownership evidence. A future staging deployment must first retarget the existing isolated service through a branch-setting-capable control plane.

## Completion gate

The matrix supports promotion to `equivalent` because there are no required PARTIAL/GAP rows. The final reconciliation PR must still pass its own exact-head Quality Gate and Affiliates FEATURE-0010 Contract and must not introduce:

- browser monetary authority;
- Affiliate-owned Payment/ledger/wallet/payout/settlement/FX/reversal state;
- direct provider execution;
- a new policy interpretation;
- temporary write-enabled workflow/diagnostic artifacts.
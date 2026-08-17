# Affiliates Migration Matrix — FEATURE-0010 / MIG-0011

## Purpose

Track how far `FEATURE-0010` can be closed technically without converting unresolved product decisions into runtime behavior.

This is an architecture/readiness matrix, not a release-equivalence claim.

## Current result

```text
PASS       15
PARTIAL     3
GAP         7
N/A         2
TOTAL      27
```

`FEATURE-0010` remains `planned`. `MIG-0011` remains `discovered`.

The remaining GAP/PARTIAL rows are product-policy dependent. Policy-neutral ownership, ports, idempotency, audit, authorization, privacy controls, threat model, migration plan, tests and rollout/rollback are now defined.

## Matrix

| Capability | Status | Canonical evidence | Remaining blocker |
| --- | --- | --- | --- |
| Affiliate is a separate platform domain | PASS | Domain Map, Module Contracts, canonical scope | none |
| Business ownership boundary | PASS | Business cannot administer Affiliate | none |
| Ordering read boundary | PASS | Ordering owns canonical order identity/state; Affiliate may consume only public records/events | none |
| Financial monetary authority boundary | PASS | Financial owns Payment, ledger, allocation, payable, wallet, settlement, payout and monetary reversal | none |
| Conceptual Affiliate schemas | PASS | `AFFILIATES-TECHNICAL-CONTRACT.md` defines policy-neutral identity/evidence/attribution/conversion/entitlement concepts | executable schema waits for policy fields |
| Affiliate identity | GAP | concept and ownership fixed | identity/cardinality/scope decision |
| Eligibility and suspension | GAP | fail-closed boundary fixed | approved eligibility/suspension semantics |
| Referral/attribution evidence | PARTIAL | digest, replay, privacy and trust boundary fixed | accepted source contracts/trust rules |
| Attribution subject and precedence | GAP | durable association concept fixed | subject and conflict/precedence policy |
| Attribution window | GAP | server-clock/versioning invariant fixed | duration/start/expiry/reset policy |
| Conversion association | PARTIAL | canonical Ordering/Financial evidence boundary fixed | exact qualifying conversion decision |
| Commission entitlement ownership | PASS | Affiliate owns commercial entitlement evidence; Financial owns monetary consequence | none |
| Commission formula/policy | GAP | policy snapshot/version/digest requirement fixed | base/model/rate/rounding/caps/currency/effective dates |
| Commission lifecycle | GAP | versioned state-machine requirement fixed | approved states/transitions |
| Refund/cancellation consequences | GAP | Financial reversal authority fixed | Affiliate entitlement consequence policy |
| Canonical Affiliate event family | PASS | technical contract reserves event ownership/names and Platform envelope requirements | payload schemas wait for policy fields |
| Idempotency strategy | PASS | deterministic digest keys, durable claim, exact/divergent replay semantics | none |
| Audit contract | PASS | immutable actor/authorization/policy/digest/correlation/outcome contract | none |
| Authorization boundaries | PASS | server-authoritative, no tenant inheritance, explicit admin/self/service boundaries | exact scope names are implementation detail |
| Privacy/LGPD controls | PARTIAL | minimization, separation, configurable retention, DSR/audit requirements fixed | retention duration/legal policy |
| Affiliate → Financial port | PASS | versioned materialization request/result boundary with no browser monetary authority | timing and executable entitlement payload wait for policy |
| Test and invariants plan | PASS | `AFFILIATES-FEATURE-0010-TEST-PLAN.md` | runtime tests wait for implementation |
| Threat model | PASS | `AFFILIATES-THREAT-MODEL.md` | none |
| Migration plan | PASS | phased expand-only plan in technical contract | execution waits for decisions |
| Rollout/rollback | PASS | `AFFILIATES-ROLLOUT-ROLLBACK.md` | execution waits for runtime |
| Browser/admin surfaces | N/A | deliberately last; no runtime authority ready | must not be implemented before server contracts |
| Affiliate-owned payout/payment/wallet | N/A | prohibited by canonical authority | must never be implemented |

## Product decision gate

Exactly 19 decisions remain and are enumerated in `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`:

1. affiliate identity;
2. eligibility;
3. suspension;
4. referral evidence;
5. attribution subject;
6. attribution precedence;
7. attribution window;
8. qualifying conversion;
9. commission base;
10. fixed vs percentage;
11. rate;
12. rounding;
13. caps;
14. currency;
15. effective dates/versioning;
16. pending/earned/reversed/cancelled/disputed lifecycle;
17. refund/cancellation consequences;
18. Financial materialization timing;
19. retention/LGPD.

No runtime default is permitted for any of them.

## Required implementation sequence after approval

1. Freeze the approved policy/ADR and Decision Sheet version.
2. Create `@touristic/affiliates` domain types/invariants and additive persistence.
3. Add durable idempotency and immutable audit.
4. Add explicit authorization capabilities.
5. Add canonical Ordering/Financial read/event adapters.
6. Add attribution/conversion and entitlement application services.
7. Add the Financial-owned materialization adapter, disabled by default.
8. Add authenticated read APIs/projections.
9. Add browser/admin surfaces last.
10. Execute unit, integration, security, privacy, concurrency and E2E validation.
11. Reconcile matrix/evidence and only then consider state promotion.

## Completion gate

FEATURE-0010 cannot move to `equivalent` or release-ready while any required row remains GAP/PARTIAL, while any Decision Sheet item lacks an approved versioned value, while browser evidence can create commission authority, or while Affiliate can create/mutate Financial monetary state directly.

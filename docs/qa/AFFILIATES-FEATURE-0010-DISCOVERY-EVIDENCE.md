# FEATURE-0010 Affiliates — Discovery Evidence

## Evidence status

- Feature: `FEATURE-0010`
- Migration item: `MIG-0011`
- Domain: Affiliates
- Current state: `migrating`
- Policy: `AFFILIATE-POLICY-V1`
- Equivalence promotion: not authorized
- Reconstructed on: 2026-08-21

This record closes the missing discovery artifact required by the permanent
Affiliates contract gate. It records repository evidence only; it does not
claim browser, API or behavioral equivalence.

## Canonical sources inspected

- `docs/product-architecture/AFFILIATES-CANONICAL-SCOPE.md`
- `docs/product-architecture/AFFILIATES-TECHNICAL-CONTRACT.md`
- `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`
- `docs/product-architecture/AFFILIATES-THREAT-MODEL.md`
- `docs/migration/AFFILIATES-MIGRATION-MATRIX.md`
- `docs/migration/MASTER-MIGRATION-TRACKER.md`
- `docs/qa/AFFILIATES-FEATURE-0010-TEST-PLAN.md`
- `docs/qa/AFFILIATES-M154-EVIDENCE.md`
- `docs/operations/AFFILIATES-ROLLOUT-ROLLBACK.md`
- `docs/features/registry.json`

## Discovered implementation

The restored repository contains the pure Affiliate domain in
`packages/affiliates` and the durable application/runtime boundary in
`services/affiliates`. The implementation includes approved policy constants,
referral evidence and attribution rules, conversion and entitlement rules,
idempotency, MySQL persistence, authenticated HTTP transport and
provider-neutral materialization ports.

The authenticated referral boundary rejects browser-controlled monetary or
provider authority before application mutation. Financial remains the only
monetary source of truth; Affiliate owns no payment, wallet, payout or
settlement runtime.

## Executable evidence retained

- Affiliate domain tests cover the approved policy and deterministic domain
  invariants.
- Affiliate server tests cover authenticated HTTP and application boundaries.
- MySQL integration evidence is recorded in `AFFILIATES-M154-EVIDENCE.md` and
  the master migration tracker.
- The permanent workflow validates architecture, registry state, policy text,
  forbidden implementation boundaries, runtime tests and build output.

## Remaining equivalence gaps

The Feature Registry correctly keeps behavior, visual and API equivalence
flags false. Promotion remains blocked until the migration matrix has complete
current-head evidence for Ordering/Financial readback, retention and DSR,
browser/admin flows, end-to-end integration and official GitHub Actions.

Provider execution is not applicable to the Affiliate domain itself. Any
monetary materialization verification belongs to the Financial boundary and
must remain provider-neutral from the Affiliate runtime.

## Discovery conclusion

`FEATURE-0010` and `MIG-0011` are valid, implemented migration work with
incomplete equivalence evidence. The correct repository state is `migrating`,
with all equivalence flags false and rollout controlled by the documented kill
switches and promotion gates.

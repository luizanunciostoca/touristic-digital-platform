# FEATURE-0009 — Payments / Subscriptions equivalence evidence

Date: 2026-08-26

## Decision

`FEATURE-0009` / `MIG-0010` satisfies the repository definition of `equivalent` at the application, browser, persistence, provider-TEST and staging layers. This decision does **not** mean `released` and does not authorize production.

## Certified implementation

- PR #25: `feat(payments): add Mercado Pago Bricks and subscriptions` — merged after independent approval by `luizidebook`.
- Certified PR head: `22b6c127ad8d276cb249b403d7813500312ef452`.
- Exact-head pull-request workflows: 37/37 PASS.
- Quality Gate PASS, including formatting, architecture boundaries, Feature Registry, environment reconciliation, CI governance, supply-chain, lint, typecheck, tests, build and canonical MySQL matrix.
- Resulting canonical main after protected merge: `1aed2827d7ec322e92e38162dec944ec7740254c`.

The merge commit preserves the certified product tree; no provider authority or monetary authority moved to the browser.

## Mercado Pago TEST provider acceptance

Controlled acceptance was executed with official TEST identities and TEST payment instruments only. No real card and no real money were used.

Evidence accepted on the certified Payments implementation:

- TEST seller identity / application provenance verified;
- owner authentication PASS;
- Subscription binding and authoritative provider readback PASS;
- provider Application/collector identity verified;
- recovery of legacy `cancel_at_period_end + authorized` fixture PASS;
- cancel authoritative readback `cancelled` PASS;
- refund command completed;
- refund replay/idempotency PASS;
- verified refund webhook matched and applied;
- accounting posting PASS;
- admin authentication PASS;
- reconciliation PASS with zero findings;
- provider acceptance runner final PASS / exit code 0.

The provider still rejects the documented `status=canceled` form with the known TEST-provider 400. The bounded TEST-only compatibility path is regression-tested and only accepts success after authoritative Mercado Pago readback reports `cancelled`; production semantics and provider authority remain fail-closed.

## Staging / operational evidence

Post-merge V2 staging was deployed on the exact resulting main SHA:

- exact main: `1aed2827d7ec322e92e38162dec944ec7740254c`;
- Render deploy: `dep-da7mp12jnfac7395nbng` — LIVE;
- `MORRO-STAGING-MYSQL-ENV`: PASS;
- `PAYMENTS-PREDEPLOY`: PASS;
- checkout runtime: ready;
- card runtime: ready;
- subscription provider runtime: ready;
- `paymentsAcceptanceAuth=disabled` after cleanup.

Controlled acceptance credentials were removed/disabled after the provider test window.

## Final Release Acceptance

Final Release Acceptance run `33020687735` was executed on exact main `1aed2827d7ec322e92e38162dec944ec7740254c`.

The first attempt observed one isolated nondeterministic failure in `Business Onboarding Commercial Browser Contract`. Re-running the failed child on the same SHA, with no code change, passed. The complete parent acceptance was then re-run on the same SHA and finished PASS:

- exact-main identity proof PASS;
- deterministic release matrix 22/22 PASS;
- exact-SHA V2 staging smoke PASS;
- main stability re-proof PASS;
- final commit status PASS.

No corrective product commit was required for the transient child failure.

## Equivalence closure

The three former PARTIAL rows in `PAYMENTS-MIGRATION-MATRIX.md` are resolved as follows:

1. **Financial audit/observability — PASS**: durable audit/reconciliation primitives plus staged provider lifecycle, verified webhook/refund, reconciliation and exact-main runtime evidence are now captured.
2. **Sandbox/provider E2E — PASS**: controlled Mercado Pago TEST acceptance covers authoritative provider identity/readback, verified webhook, refund/replay and zero-finding reconciliation.
3. **Rate limiting — PASS for equivalence**: bounded actor/IP application limits satisfy the frozen V1/application contract. A distributed limiter is a future release-topology hardening requirement only if the actual production topology is horizontally scaled; it is not a missing V1-equivalence contract.

Canonical matrix after reconciliation:

```text
PASS      33
PARTIAL    0
GAP        0
N/A        1
TOTAL     34
```

The sole N/A remains Business commercial preparation because Business owns that immutable handoff and Payments consumes it.

Browser launch/confirmation and Business → Payments composition provide the applicable visual/interaction evidence for the frozen V1 checkout lifecycle. The financial state, provider verification, persistence, ledger, reconciliation, refunds and subscription lifecycle remain server-authoritative.

## Rollback and release separation

Rollback remains application-first and disable-first, preserving immutable Financial history and avoiding destructive down-migrations.

`equivalent` is not `released`:

- production promotion is not authorized by this evidence;
- Release Promotion Gate is intentionally not dispatched without a separate production/promotion authorization;
- if production is later horizontally scaled, distributed rate limiting must be proven before release traffic is authorized.

## Safety

- real card used: NO;
- real money used: NO;
- production touched: NO;
- legacy staging touched: NO;
- temporary acceptance authentication: DISABLED;
- secrets/TEST passwords/tokens are not recorded in this evidence file.

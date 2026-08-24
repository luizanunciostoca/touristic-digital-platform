# FEATURE-0010 / MIG-0011 — Final Equivalence Evidence

## Scope

This document records the final reconciliation evidence for Affiliates. It does not authorize production rollout, real-money execution, Mercado Pago execution, or any transfer of monetary authority from Financial.

## Runtime checkpoint

```text
integrated main = a2a1f10420c1d452e9426c75549864c76d57f22c
certified PR head = 851740d2429c41d18f81f0e476fc2fb67a6a0c3b
certified tree = f1ef9038de983a69737c94a2d218eec57e179efb
main tree = f1ef9038de983a69737c94a2d218eec57e179efb
```

The certified PR head and integrated main have the same Git tree, so the executable evidence applies byte-for-byte to the integrated Affiliate runtime.

## Permanent evidence

- Quality Gate #242: PASS, including format, architecture, registry, environment, governance, supply-chain, lint, typecheck, tests, build and canonical MySQL matrix.
- Affiliates FEATURE-0010 Contract #102: PASS, including architecture/registry, runtime foundation, real MySQL persistence and authority/policy contract.
- Render Staging Blueprint Contract #66: PASS.
- Final Affiliate matrix: `25 PASS / 0 PARTIAL / 0 GAP / 2 N/A`.

## Accepted capability set

The integrated acceptance covers Privacy/LGPD, Identity/Eligibility/Suspension, referral/attribution evidence, precedence/window/order lock, conversion association, 3000-bps commission policy, lifecycle, refunds/reversals, exact/divergent replay, concurrency/locking, tenant/program isolation, audit/outbox and Affiliate → Financial materialization request/readback semantics.

Privacy evidence includes retention windows, DSR, anonymization/pseudonymization, legal hold, idempotency and audit. Commercial acceptance preserves integer minor-unit/half-up calculation and immutable policy snapshot. Browser/client state never becomes monetary authority.

## Authority boundary

Ordering remains canonical Order authority. Financial remains sole authority for Payment, eligible revenue, ledger, payable/wallet, settlement, payout, reconciliation, FX and monetary reversals. Affiliate owns non-monetary identity/program, referral, attribution, conversion-association and commission-entitlement evidence only.

No real Mercado Pago call, real money or production execution occurred in this Affiliate campaign. Provider verification is `NOT_APPLICABLE` to Affiliate.

## N/A rows

The two N/A outcomes are deliberate:

1. browser/admin surfaces are not required for this server-authoritative feature; any future UI remains presentation/input only;
2. Affiliate-owned payment/ledger/wallet/payout is prohibited and must never be implemented.

## Promotion

`FEATURE-0010` and `MIG-0011` may be marked `equivalent`, not `released`, once this documentation reconciliation PR itself passes exact-head Quality Gate and Affiliates FEATURE-0010 Contract.

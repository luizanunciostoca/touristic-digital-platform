# Payments Rate Limit Topology — Architectural Decision

## Decision

The Morro Digital V2 Payments runtime uses a **single-replica** topology for the checkout rate limiter. The in-memory `CheckoutRateLimitPort` is safe and correct for this topology.

## Evidence

| Check                                              | Result                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_RUNTIME_REPLICA_COUNT`                   | `1` (documented in `.env.example`)                                                                            |
| `PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED` | `false` (not needed for single replica)                                                                       |
| Topology guard                                     | `createTopologySafeCheckoutRateLimitPort` fails closed if `runtimeReplicaCount > 1` without distributed store |
| Environment check                                  | `pnpm environment:check` validates the invariant                                                              |
| Tests                                              | 2 topology tests pass (single-replica allowed, multi-replica without store rejected)                          |

## Rationale

The current deployment target is a single-process Node.js runtime (WebDev Reserved Hosting or equivalent single-instance container). The in-memory rate limiter is:

1. **Correct** — no cross-replica state divergence is possible with one process.
2. **Fast** — no network round-trip to a distributed store.
3. **Simple** — no additional infrastructure dependency.
4. **Fail-closed** — the topology guard prevents accidental multi-replica deployment without a distributed store.

## Migration path

If the deployment topology changes to multi-replica (e.g., autoscale with 2+ instances), the following must happen **before** scaling:

1. Provision a distributed atomic rate-limit store (Redis, DynamoDB, or equivalent).
2. Implement a `DistributedCheckoutRateLimitPort` adapter.
3. Set `PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED=true`.
4. Set `PAYMENTS_RUNTIME_REPLICA_COUNT` to the actual replica count.
5. Verify the topology guard accepts the configuration.
6. Run the environment check and full test suite.

## Guard implementation

The guard is implemented in `services/ordering/src/checkout-rate-limit.ts`:

```typescript
export function createTopologySafeCheckoutRateLimitPort(
  config: CheckoutRateLimitTopologyConfig,
  maxKeys = 10_000,
): CheckoutHttpRateLimitPort {
  if (config.runtimeReplicaCount > 1 && !config.distributedStoreConfigured) {
    throw new Error("CHECKOUT_RATE_LIMIT_DISTRIBUTED_STORE_REQUIRED");
  }
  return createInMemoryCheckoutRateLimitPort(maxKeys);
}
```

This ensures that a misconfigured multi-replica deployment fails at startup, not at runtime under load.

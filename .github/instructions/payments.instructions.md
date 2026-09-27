---
applyTo: "packages/payments/**,services/payments/**,packages/financial/**,services/financial/**,apps/morro-digital-platform/tooling/payments-*"
---

# payments

These instructions extend `AGENTS.md` for matching paths.

- Financial truth comes from verified server or provider evidence, never browser events.
- Preserve idempotency, replay safety and reconciliation.
- Do not activate live money or provider mode without explicit owner authorization.
- Payment success must not silently imply downstream ticket or notification success.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

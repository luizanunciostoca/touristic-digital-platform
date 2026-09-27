---
applyTo: "packages/crm/**,services/crm/**,apps/morro-digital-platform/tooling/crm-*"
---

# crm

These instructions extend `AGENTS.md` for matching paths.

- CRM persistence must be durable and tenant-scoped.
- CRM may reference canonical owners but must not replace them.
- PII handling must be minimized and auditable.
- Cross-domain actions require explicit contracts and idempotency.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

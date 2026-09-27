---
applyTo: "packages/crm/**,services/crm/**,apps/morro-digital-platform/tooling/crm-*"
---

# crm

These instructions extend the repository constitution for matching paths.

- CRM persistence must be durable and tenant-scoped.
- Contact/activity orchestration may reference canonical owners but not replace them.
- PII handling must be minimized and audited.
- Cross-domain actions require explicit contracts and idempotency.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

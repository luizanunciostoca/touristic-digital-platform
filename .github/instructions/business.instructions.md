---
applyTo: "packages/business/**,services/business/**,apps/morro-digital-platform/tooling/business-*"
---

# business

These instructions extend the repository constitution for matching paths.

- Business profile/catalog/publication state has one canonical owner.
- Mutations require server-side tenant authorization and auditability.
- Draft/published state must not be inferred from UI.
- Admin and public projections must be tested together when contracts change.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

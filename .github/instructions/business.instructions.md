---
applyTo: "packages/business/**,services/business/**,apps/morro-digital-platform/tooling/business-*"
---

# business

These instructions extend `AGENTS.md` for matching paths.

- Business profile, catalog and publication state have canonical owners.
- Mutations require server-side tenant authorization and auditability.
- Draft or published state must not be inferred from UI.
- Admin and public projections must be tested together when contracts change.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

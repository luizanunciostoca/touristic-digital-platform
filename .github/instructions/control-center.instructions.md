---
applyTo: "**/*control-center*,apps/morro-digital-platform/public/**/*admin*,apps/morro-digital-platform/tooling/**/*admin*"
---

# control-center

These instructions extend the repository constitution for matching paths.

- Control Center orchestrates canonical owners; it must not duplicate their persistence.
- Admin actions require explicit authorization, replay/idempotency protection and audit evidence.
- Financial aggregates are read models, not alternate monetary authority.
- Universal search composes owners rather than cloning their data.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

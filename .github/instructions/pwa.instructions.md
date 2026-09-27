---
applyTo: "**/*service-worker*,**/*sw.*,apps/morro-digital-platform/public/pwa-register.js,apps/morro-digital-platform/public/manifest*,apps/morro-digital-platform/public/**/*offline*"
---

# pwa

These instructions extend `AGENTS.md` for matching paths.

- Service Worker must not assume authority over API mutations, authenticated writes, Commerce or Payments.
- Cache versioning and invalidation must be deterministic.
- Offline behavior must fail safely and rejoin online state without replay corruption.
- Installability and offline/online transitions require browser proof.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

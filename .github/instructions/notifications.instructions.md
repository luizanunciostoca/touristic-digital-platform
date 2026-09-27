---
applyTo: "packages/notifications/**,services/notifications/**,apps/morro-digital-platform/tooling/notifications-*"
---

# notifications

These instructions extend the repository constitution for matching paths.

- Use durable outbox semantics for deliverable events.
- Preferences/consent must be explicit and fail-closed.
- Provider retries, idempotency and DLQ behavior must be observable.
- No external provider activation without appropriate authorization.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

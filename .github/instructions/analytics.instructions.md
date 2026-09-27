---
applyTo: "packages/analytics/**,services/analytics/**,apps/morro-digital-platform/tooling/analytics-*"
---

# analytics

These instructions extend `AGENTS.md` for matching paths.

- Respect consent and privacy boundaries before collection.
- Canonical event identity, deduplication and tenant scope are mandatory.
- Analytics must never become transaction authority.
- Observability events and product analytics must remain distinguishable.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

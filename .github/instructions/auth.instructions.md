---
applyTo: "packages/auth/**,services/auth/**,apps/morro-digital-platform/tooling/auth-*.mjs"
---

# auth

These instructions extend the repository constitution for matching paths.

- AuthN and AuthZ are server-enforced.
- Session/cookie/origin/CSRF behavior must remain fail-closed.
- Never derive authorization from client-visible role labels.
- Cross-tenant/session leakage is a release blocker.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

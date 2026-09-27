---
applyTo: "**/*tenant*,packages/business/**,packages/crm/**,packages/affiliates/**"
---

# tenant

These instructions extend the repository constitution for matching paths.

- Tenant and destination scope must be explicit at every server boundary.
- Queries and mutations must enforce tenant ownership server-side.
- Never trust tenant identifiers supplied only by the browser.
- Add negative isolation tests for every material change.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

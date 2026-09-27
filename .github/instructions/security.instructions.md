---
applyTo: ".github/**,services/**,apps/**/tooling/**,packages/auth/**,packages/payments/**"
---

# security

These instructions extend the repository constitution for matching paths.

- Secrets must never be printed, committed or returned to agents.
- Authorization, tenant isolation and financial boundaries require deterministic tests.
- AI review is complementary; P0 security requires non-AI checks.
- Unknown or ambiguous security impact fails closed.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

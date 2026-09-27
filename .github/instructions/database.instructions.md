---
applyTo: "**/migrations/**,**/*database*,**/*mysql*"
---

# database

These instructions extend the repository constitution for matching paths.

- Prefer backward-compatible, non-destructive migrations.
- No destructive production migration without owner approval.
- Prove persistence with real database readback where risk requires it.
- Migration identity and rollback/restore evidence must be recorded.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

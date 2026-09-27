---
applyTo: "packages/ticketing/**,services/ticketing/**,apps/morro-digital-platform/src/**/*ticket*,apps/morro-digital-platform/public/**/*ticket*,apps/morro-digital-platform/tooling/ticketing-*"
---

# ticketing

These instructions extend `AGENTS.md` for matching paths.

- Ticket issuance must follow verified fulfillment authority.
- Inventory, business and destination ownership must remain explicit.
- Replay and duplicate issuance must be deterministic and safe.
- Critical issuance changes require E2E and runtime proof.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

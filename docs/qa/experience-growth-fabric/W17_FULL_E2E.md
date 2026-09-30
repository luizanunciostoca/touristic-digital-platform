# W17 — Full Isolated E2E

Status: implemented on the isolated construction branch.

The automated scenario executes the composed Experience & Growth Fabric without
mounting any current runtime route or applying any database migration.

Covered path:

1. opaque referral resolution;
2. qualified acquisition and replay protection;
3. anonymous destination journey;
4. authorized identity linking;
5. verified place experience;
6. mission progress and completion;
7. append-only XP and XP replay protection;
8. risk decision before value;
9. reward unlock, redemption and redemption replay;
10. qualified affiliate referral and affiliate XP;
11. deterministic experiment assignment and persisted exposure;
12. outbox lease and delivery;
13. consumer idempotency;
14. non-authoritative analytics projection;
15. scoped HTTP request guard with capability, CSRF and idempotency evidence.

A second scenario proves that an unknown risk-policy version preserves guide/read
availability in observe mode while blocking financial-value actions.

No current Home, Assistant, Map, Control Center, database bootstrap, production
route, Feature Registry entry or runtime flag is changed by W17.

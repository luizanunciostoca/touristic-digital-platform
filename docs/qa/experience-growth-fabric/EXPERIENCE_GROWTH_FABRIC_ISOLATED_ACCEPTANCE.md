# EXPERIENCE GROWTH FABRIC — ISOLATED ACCEPTANCE

Status: PENDING_EXACT_HEAD_GREEN

The isolated release candidate is intentionally disconnected from the current
production runtime.

Acceptance requires all of the following on the same final candidate lineage:

- repository Quality Gate;
- Security Lite;
- Morro Fabric Preflight;
- Agent Profile independent proof;
- CI stale-run guard;
- full W17 composed E2E;
- W18 security/privacy/fraud acceptance;
- W19 failure/replay/recovery acceptance;
- W20 deterministic load qualification;
- isolated MySQL 8.4 schema apply;
- second MySQL schema apply proving idempotence;
- expected-table readback;
- no destructive DDL;
- no merge to main;
- no production feature activation;
- no production database migration.

The final PASS status and exact evidence identifiers are written only after all
gates complete successfully.

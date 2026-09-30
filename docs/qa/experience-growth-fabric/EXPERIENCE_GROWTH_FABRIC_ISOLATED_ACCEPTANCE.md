# EXPERIENCE GROWTH FABRIC — ISOLATED ACCEPTANCE

Status: PASS

## Certified code candidate

- base main: `9105a508bb5c211e0db6a19cde333b965fdb81d9`;
- certified code head: `c7bd3389a04713b2186aba53a714bad8c36d3fb7`;
- PR: #567;
- production activation: false;
- merge to main: false;
- production database migration: false.

## Exact-head evidence

The certified code head completed all required repository and isolated gates:

- Quality Gate `36662215992` — PASS;
- Security Scanning `36662215814` — PASS;
- Security Lite `36662215790` — PASS;
- Morro Fabric Preflight `36662215861` — PASS;
- Agent Profile Contract `36662216063` — PASS;
- CI Stale Run Guard `36662215783` — PASS;
- EGF Isolated MySQL Acceptance `36662215765` — PASS.

## Functional acceptance

The isolated MySQL acceptance executed 21 test files and 113 tests with all
tests passing. This includes:

- W17 full composed E2E;
- W18 security, privacy and fraud acceptance: 9 tests PASS;
- W19 failure, replay and recovery acceptance: 7 tests PASS;
- W20 deterministic performance/load qualification: PASS;
- contract/domain tests for acquisition, referral, journey, engagement,
  missions, rewards, economics, risk, affiliate growth, experimentation,
  orchestration, HTTP boundaries, projections, event fabric and UI reference.

## MySQL acceptance

The isolated MySQL 8.4 acceptance:

- applied the additive Growth Fabric schema;
- applied the same schema a second time successfully;
- verified `33/33` expected tables by readback;
- proved `idempotentSecondApply: true`;
- rejected destructive DDL by contract;
- did not touch production MySQL.

## Security acceptance

The final Security Scanning run passed all jobs:

- Application container;
- Staging MySQL container;
- Production MySQL containers and DR worker;
- Repository secret scanning;
- Configuration and IaC scanning;
- Runtime log and PII contract.

The candidate was rebased on the current security baseline before final
certification. The inherited baseline upgrades the affected
`brace-expansion` dependency lines and carries the repository-governed,
time-bounded Trivy exception for the vendor-unfixed OpenSSL finding.

## Release decision

`EXPERIENCE_GROWTH_FABRIC_ISOLATED_BUILD = PASS`

This PASS certifies the isolated build only. It does not authorize production
integration, route mounting, Feature Registry activation, database migration or
merge to `main`.

This acceptance record is a documentation-only commit after the certified code
head. Repository exact-head checks are rerun for the record commit; their final
run identifiers are attached to PR #567 without mutating this file again.

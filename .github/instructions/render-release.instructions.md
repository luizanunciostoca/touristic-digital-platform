---
applyTo: ".github/workflows/*release*,.github/workflows/*promotion*,render*.yaml,render*.yml,docs/operations/**/*release*"
---

# render-release

These instructions extend `AGENTS.md` for matching paths.

- Current main is the release source of truth.
- Build once and promote the same immutable OCI digest.
- Require exact SHA, tree, artifact and provenance identity across environments.
- Staging proof precedes production; production requires runtime evidence.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.

## Authorized staging-only Node exception

The one-publication exception `CT1072-STAGING-NODE-20261023-ONE-PUBLICATION`, governed by ChangeSet `MD-STAGING-NODE-EXCEPTION-20261023` and Control Tower #1072, permits a Git/Node rebuild only on existing staging service `srv-da4hb6c9v7es7386ttt0`. It is not immutable OCI promotion. OCI remains the default and the production contract is unchanged. This exception requires the enabled, unexpired policy in `tooling/ci/staging-node-exception.json`, exact-main review/certification, authenticated pre/post connector receipts, retained backup and applicable recovery/rollback proof, shared service mutation lock and durable single-use reservation before the existing hook POST. No service, URL, disk, variables, plan or credentials may change. Node acceptance is explicitly staging-only, with `productionEligible:false` and `pagesEligible:false`; it cannot satisfy OCI/production/Pages acceptance. Ambiguous dispatch outcomes require reconciliation without another POST. See `docs/operations/STAGING-NODE-EXCEPTION.md` for the receipt and verification-only contract. Disabled policy authorizes no dispatch. General rebuild prohibitions remain in force outside this bounded exception.

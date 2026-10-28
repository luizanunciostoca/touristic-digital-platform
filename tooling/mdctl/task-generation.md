# Task generation recovery

Run this standalone CLI from a clean checkout of current main; an unintegrated copy cannot execute operationally. It does not merge, push, deploy, alter protections or accept remote proof.

```sh
node tooling/mdctl/task-generation.mjs inspect WORKSPACE MAIN_SHA PR EXECUTOR
node tooling/mdctl/task-generation.mjs prepare WORKSPACE MAIN_SHA PR EXECUTOR REQUEST_JSON
# Review and commit the prepared metadata through the normal integrator process.
node tooling/mdctl/task-generation.mjs prove WORKSPACE MAIN_SHA PR EXECUTOR NONCE
```

`inspect` performs GitHub GETs and local reads. Save its exact request outside the worktree. Evidence determines the mode:

- `HISTORY`: verified task/context/lease history belonging to the executor.
- `MISSING`: incomplete or absent history. Absence never proves cessation.

Known active leases block every mode. Invalid files are not reset. Existing task, context, handoff and lease bytes remain unchanged and are copied into the durable intent.

Only open implementation PRs are eligible. Fresh acquisitions use the existing `task start` workflow. Requests bind the PR and remote branch identity; drift before or during proof aborts. Journals and their directories are revalidated before evidence writes and at completion.

For `MISSING`, the repository owner must inspect the request, acknowledge missing history and personally attest that no other writers remain by commenting this exact marker on the target PR:

```text
APPROVED_TASK_GENERATION:CLAIM_ID:REQUEST_DIGEST:NONCE:MAIN_SHA
```

`REQUEST_DIGEST` is the canonical JSON SHA-256 from exported `generationDigest`. The request carries `OWNER_ATTESTED_NO_OTHER_WRITERS` and `missingHistoryAcknowledged:true`. This is owner testimony, not process inspection. An app/connector must not post approval on the owner's behalf. Verification requires the owner's numeric identity, OWNER association, no app authorship, one unedited recent comment, exact binding and repeated provider readback. Another owner comment replacing `APPROVED_` with `REVOKED_` revokes it.

All modes expire within 30 minutes and before claim expiry, including after proof execution. An expired or failed reservation requires explicit reconciliation; never edit a request to extend it. `prepare` locks the common Git directory, records intent and executes actual bounded proof commands on the clean candidate. Only success permits the official claim reanchor and derived `LOCAL_PROVEN` projection. `PREPARED_REQUIRES_FINAL_PROOF` is not acceptance. After committing metadata, `prove` validates journals against Git and canonical builders, reacquires the lock, recaptures identity and runs every command on the final commit. The receipt binds main, candidate, tree, context and released generation leases. No preliminary proof is relabeled as final. Normal ADMISSION/CERTIFY, independent review and remote gates remain required.

Generation journals live in the worktree Git state under `morro-control/generations/NONCE`. A nonce is single-use. Failure after reservation retains the lock/journal for reconciliation; do not delete or retry blindly. Local lock/CAS does not fence other environments. Provider/Git changes abort without automatic rollback. Exported transport injection supports deterministic tests only; CLI has no transport, bootstrap or bypass flag. Fixtures use real Git objects and execute real Node proofs, removing the inherited `NODE_TEST_CONTEXT` marker so nested tests actually run.

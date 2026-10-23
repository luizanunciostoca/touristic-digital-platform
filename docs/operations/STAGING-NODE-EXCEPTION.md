# Single staging Node rebuild exception

Status: operational adapters implemented; policy disabled pending independent review and certification. No publication is authorized by a structurally valid JSON bundle alone.

The existing service remains srv-da4hb6c9v7es7386ttt0 at https://morro-digital-v2-staging.onrender.com. This is a Git/Node rebuild, not immutable OCI promotion. OCI remains the default. Node evidence has productionEligible:false and pagesEligible:false.

## Authority and transport

Reuse tooling/tdp-max/tdp-max-v2.mjs validateExternalEvidenceBundle, the runtime live-provider authority in .github/morro-control/tdp-max/authority-map.json, and ORCHESTRATOR_CONNECTOR_READBACK from final-gate.json. CI verifies transport, integrity and identity binding; it does not claim to have queried Render.

Receipt transport: an unedited comment on Control Tower #1072. Its body is the literal prefix TDP_STAGING_NODE_RECEIPT_V1 followed by one newline and JSON. Reference it with {commentId, sha256}; sha256 is the lowercase SHA-256 of the entire UTF-8 comment body, including the prefix and exact whitespace. Fetch the individual comment, check the configured numeric user ID/login/app provenance, verify complete authorized receipt listing, reject duplicate pre-deploy grants, forked post-observation supersession, revocation or conflicts, and reread the individual comment.

Common receipt fields:

- schemaVersion:1; producer:"ORCHESTRATOR_CONNECTOR_READBACK"
- phase:"pre-deploy" or "post-deploy"
- authorizationId, requestId, sourceSha, treeSha
- runId, runAttempt, callerRunId, callerRunAttempt (positive integers)
- serviceId:"srv-da4hb6c9v7es7386ttt0"
- mode:"staging-node-rebuild"; maximumDeployments:1
- observedAt (UTC ISO timestamp; at most five minutes old and not in the future)

A revocation uses the same prefix and authorizationId with phase:"revoked". It is an operator observation/decision, not a personal owner approval. Hashes alone never authenticate the observer.

## Pre-deploy observation

The pre-deploy receipt must bind the exact queued workflow run/attempt and frozen candidate. Include preflight.configurationPreserved:true only after real connector readback. Include preflight.recovery with status:"PROVEN", candidateSha, backupRef, restoreRef, rollbackRef and mutationInventoryRef. References must identify actual retained recovery evidence, including mutations in with-staging-mysql-env.mjs and staging-predeploy.mjs. Historical drills alone do not prove fresh recoverability. Code rollback does not undo backfills.

The transport adapter binds the sanitized service configuration fingerprint, previous provider deployment, previous runtime identity and immutable recovery references. Do not hash or publish secret values. Policy.enabled remains false until candidate approval.

## Dispatch and uncertain outcomes

Node dispatch retains the service lock through terminal/provider/runtime verification. Verification-only continuations reacquire the same lock and reject an intervening deployment via latestDeploymentId. OCI mutations share that lock; the parent Final Release Acceptance workflow must not hold it. Revalidate the pre-receipt after acquiring the lock. Reserve the authorization once before the hook POST through an atomic GitHub ref, using the existing immutable Git-ref mechanism:
refs/tags/staging-node-use/<sha256-of-authorizationId>.

The ref points to the candidate SHA and is never deleted to retry. A prior ref blocks every later run, including a different run for the same candidate. A failed or ambiguous ref creation requires reconciliation and sends no hook POST. A timeout or missing provider ID after POST leaves the reservation consumed. Never repeat POST to resolve uncertainty.

The adapter may issue only the existing hook POST; it has no provider configuration-write interface. A returned dep-* is dispatch acceptance, not proof of a live deployment.

## Post-deploy observation

Bind the authenticated post-receipt to the pre-receipt ID/hash, reservation ref, exact dispatch artifact ID/name/run/attempt, source SHA/tree and returned provider deployment ID. Supply the existing ExternalEvidenceBundle with one runtime item produced by ORCHESTRATOR_CONNECTOR_READBACK, source equal to the observation reference, identity serviceId:deploymentId:sourceSha, assertion render-node-deployment-live, status VERIFIED, observedAt and freshnessSeconds.

Normalized provider facts: deploymentId, serviceId, commitSha, status:"live", runtime:"node", configurationFingerprint, createdAt and liveAt. Their time order must follow dispatch. Runtime facts are separate: releaseSha, healthy, ready, identityKind:"application-runtime-identity", identity and observedAt. X-Deployment-ID may be an instance/service identity; never label it as the provider dep-* identifier. Reject an old same-SHA runtime observation.

A verification-only continuation must consume the original dispatch and authenticated post-receipt without invoking the hook. Final evidence must distinguish CI_VERIFIED, CONNECTOR_OBSERVED and RUNTIME_OBSERVED. No Node evidence may satisfy generic OCI, Pages or production acceptance.

Receipt actor provenance observed on #1072 comment 6357064863: GitHub user ID 318748875, login luizanunciostoca, performed_via_github_app.id 1144995. This is delegated connector provenance, not a personal user signature. Policy remains disabled.

## Operational sequence and exact receipt examples

The following examples are explicitly FICTIONAL, expired and invalid for publication. Never post fixtures as evidence. Replace every synthetic identity, timestamp, digest and reference with authenticated observations for the frozen candidate. Copy run/caller/request identity from the intent artifact, not from guesses. Compute configurationFingerprint with the exported configurationFingerprint(snapshot) function (SHA-256 over recursively key-sorted JSON); the example fingerprint is intentionally fictitious. Secret values are excluded.

Dispatch creates intent, waits for the pre-receipt under the child service lock, reserves before POST and uploads dispatch bytes even on uncertainty. The parent FRA holds no child lock. The post-receipt must hash the exact downloaded staging-node-dispatch.json bytes, not a reserialized JSON object. Its artifact identifies staging-node-dispatch-RUN-ATTEMPT. GitHub comment metadata supplies actor/app/creation/update timestamps; do not place invented metadata in payloads. Use second-resolution UTC observation timestamps at or before comment creation. Each receipt must be available within five minutes of observation.

Pre-receipt JSON (body prefix plus newline precedes this JSON):

```json
{
  "schemaVersion": 1,
  "producer": "ORCHESTRATOR_CONNECTOR_READBACK",
  "phase": "pre-deploy",
  "authorizationId": "FICTIONAL-DO-NOT-PUBLISH",
  "requestId": "fictional-request",
  "sourceSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "treeSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "runId": 12,
  "runAttempt": 1,
  "callerRunId": 10,
  "callerRunAttempt": 1,
  "serviceId": "srv-da4hb6c9v7es7386ttt0",
  "mode": "staging-node-rebuild",
  "maximumDeployments": 1,
  "observedAt": "2000-01-01T00:00:00Z",
  "preflight": {
    "configurationPreserved": true,
    "serviceSnapshot": {
      "serviceId": "srv-da4hb6c9v7es7386ttt0",
      "runtime": "node",
      "url": "https://morro-digital-v2-staging.onrender.com",
      "repository": "https://github.com/luizanunciostoca/touristic-digital-platform",
      "branch": "main",
      "autoDeploy": false,
      "diskId": "dsk-dbbd6stg1s2s738h3i4g",
      "diskMountPath": "/var/data",
      "diskSizeGB": 1,
      "plan": "starter",
      "region": "ohio",
      "instances": 1,
      "healthCheckPath": "/readyz",
      "buildCommand": "corepack pnpm install --frozen-lockfile && corepack pnpm build",
      "preDeployCommand": "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/staging-predeploy.mjs",
      "startCommand": "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/dev-server.mjs"
    },
    "configurationFingerprint": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "previousProviderDeploymentId": "dep-fictionalold",
    "previousRuntime": {
      "releaseSha": "dddddddddddddddddddddddddddddddddddddddd",
      "identity": "fictional-instance-old"
    },
    "recovery": {
      "status": "PROVEN",
      "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "retainedBackup": true,
      "wrapperAndPredeployCovered": true,
      "codeRollbackDoesNotUndoData": true,
      "backupRef": "FICTIONAL-retained-backup-reference",
      "restoreRef": "FICTIONAL-restore-reference",
      "rollbackRef": "FICTIONAL-rollback-reference",
      "mutationInventoryRef": "FICTIONAL-mutation-inventory-reference"
    }
  }
}
```

Post-receipt JSON:

```json
{
  "schemaVersion": 1,
  "producer": "ORCHESTRATOR_CONNECTOR_READBACK",
  "phase": "post-deploy",
  "verificationId": "13:1",
  "verificationBarrier": {
    "artifactId": 199,
    "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "jobId": 888,
    "recordedAt": "2000-01-01T00:01:59Z"
  },
  "verification": {
    "runId": 13,
    "runAttempt": 1,
    "callerRunId": 11,
    "callerRunAttempt": 1
  },
  "supersedesReceiptId": null,
  "authorizationId": "FICTIONAL-DO-NOT-PUBLISH",
  "requestId": "fictional-request",
  "sourceSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "treeSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "runId": 12,
  "runAttempt": 1,
  "callerRunId": 10,
  "callerRunAttempt": 1,
  "serviceId": "srv-da4hb6c9v7es7386ttt0",
  "mode": "staging-node-rebuild",
  "maximumDeployments": 1,
  "observedAt": "2000-01-01T00:02:00Z",
  "preReceiptId": 123,
  "preReceiptSha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "dispatchArtifactId": 99,
  "dispatchSha256": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "observation": {
    "schemaVersion": 1,
    "mode": "staging-node-rebuild",
    "environment": "staging",
    "productionEligible": false,
    "pagesEligible": false,
    "sourceSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "treeSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "serviceId": "srv-da4hb6c9v7es7386ttt0",
    "canonicalUrl": "https://morro-digital-v2-staging.onrender.com",
    "origin": {
      "kind": "authenticated-render-connector-observation",
      "reference": "FICTIONAL-observation-reference",
      "verificationLocation": "external-to-github-actions",
      "verifiedByActions": false,
      "observedAt": "2000-01-01T00:02:00Z"
    },
    "externalEvidence": {
      "schemaVersion": 1,
      "capturedAt": "2000-01-01T00:02:00Z",
      "unknowns": [],
      "conflicts": [],
      "items": [
        {
          "id": "FICTIONAL-observation",
          "domain": "runtime",
          "source": "FICTIONAL-observation-reference",
          "producer": "ORCHESTRATOR_CONNECTOR_READBACK",
          "status": "VERIFIED",
          "identity": "srv-da4hb6c9v7es7386ttt0:dep-fictionalnew:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "assertion": "render-node-deployment-live",
          "observedAt": "2000-01-01T00:02:00Z",
          "freshnessSeconds": 300
        }
      ]
    },
    "workflow": {
      "event": "workflow_dispatch",
      "path": ".github/workflows/staging-render-promotion.yml",
      "runId": 12,
      "runAttempt": 1,
      "callerRunId": 10,
      "callerRunAttempt": 1,
      "headSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "requestId": "fictional-request"
    },
    "artifact": {
      "id": 99,
      "name": "staging-node-dispatch-12-1",
      "runId": 12,
      "runAttempt": 1
    },
    "authorizationId": "FICTIONAL-DO-NOT-PUBLISH",
    "reservationId": "refs/tags/staging-node-use/FICTIONAL-HASH",
    "provider": {
      "deploymentId": "dep-fictionalnew",
      "latestDeploymentId": "dep-fictionalnew",
      "serviceId": "srv-da4hb6c9v7es7386ttt0",
      "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "status": "live",
      "runtime": "node",
      "configurationFingerprint": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "createdAt": "2000-01-01T00:01:01Z",
      "liveAt": "2000-01-01T00:01:59Z"
    },
    "runtime": {
      "releaseSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "healthy": true,
      "ready": true,
      "identityKind": "application-runtime-identity",
      "identity": "FICTIONAL-instance-new",
      "observedAt": "2000-01-01T00:02:00Z"
    }
  }
}
```

A later FRA continuation uses promotion_mode=staging-node-rebuild and node_dispatch_run_id set to the ORIGINAL dispatch run, never an archived verification as current proof. FRA starts a new verification-only child tied to its current run/attempt. The child preserves the original dispatch request/caller identity but requires a NEW post observation with verificationId="CURRENT_CHILD_RUN:CURRENT_CHILD_ATTEMPT" and verification={runId,runAttempt,callerRunId,callerRunAttempt} naming that child and current FRA. The first post uses supersedesReceiptId:null; each later immutable post names the immediately previous authorized post comment ID. The full chain must bind the same dispatch artifact/pre-receipt/source and have unique verification IDs. Forks, edits, superseded observations and revocation fail closed. Renewing an observation never renews the dispatch grant, deletes the reservation or permits a second POST.

Standalone verification-only requires expected_sha, request_id from original dispatch, CURRENT caller_run_id/caller_run_attempt, ORIGINAL dispatch_run_id/dispatch_run_attempt, operation=verify-only and a nonempty confirm_staging input. It has no hook or staging environment access. Fresh observation, current provider latestDeploymentId and runtime checks run inside the service lock. FRA then authenticates the post receipt again, rejects stale/revoked evidence and requires verification bound to the current FRA before accepting. The original dispatch caller remains visible in workflow provenance.

Canonical hook validation permits exactly https://api.render.com/deploy/srv-da4hb6c9v7es7386ttt0 with a single nonempty key query. It builds the exact ref query structurally, rejects imageURL/unknown/duplicate keys, userinfo, non-default ports and fragments, and refuses redirects. Missing provider ID or uncertain POST stays blocked for reconciliation without a blind retry.

Policy remains disabled pending complete independent review and exact-head certification. Enabling it changes the candidate and requires refreshed dependent proofs. The release ledger is finalized separately by the authorized orchestrator; worker scope does not include ledger writes.

## Post-lock verification barrier

Before querying Render or runtime for a post-deploy receipt, wait for the verifier JOB to acquire the shared service lock and publish `staging-node-verification-barrier-RUN-ATTEMPT`. Read its `staging-node-verification-barrier.json` bytes through authenticated GitHub Actions, verify the run/attempt/source/caller and current verifier job, and bind the artifact ID plus SHA-256 of those exact JSON bytes in `verificationBarrier`. A queued workflow's creation/start timestamp is not a lock-acquisition marker. Do not reuse a provider/runtime observation gathered before this artifact was exposed.

The barrier command executes inside each locked verifier job, records its clock time, verifies the job through the attempt-scoped jobs endpoint and individual job readback, then uploads the marker before receipt polling. The verifier and FRA authenticate the marker artifact, current-attempt job membership and source identity. `origin.observedAt` (provider query), `runtime.observedAt` (runtime query) and receipt `observedAt` must all be at or after marker `recordedAt`. Historical provider `createdAt` and `liveAt` remain the original deployment timestamps and need not follow the new verification barrier. The five-minute freshness limit is additional; it does not replace the barrier.

Fictional marker example, never evidence:

```json
{
  "schemaVersion": 1,
  "kind": "STAGING_NODE_VERIFICATION_BARRIER",
  "sourceSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "treeSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "authorizationId": "FICTIONAL-DO-NOT-PUBLISH",
  "requestId": "fictional-request",
  "verification": {
    "runId": 13,
    "runAttempt": 1,
    "callerRunId": 11,
    "callerRunAttempt": 1
  },
  "jobKey": "verify",
  "jobName": "staging / external provider and runtime verification",
  "jobId": 888,
  "jobStartedAt": "2000-01-01T00:01:58Z",
  "recordedAt": "2000-01-01T00:01:59Z"
}
```

Job-attempt membership uses the authenticated `/actions/runs/{run_id}/attempts/{attempt_number}/jobs` listing; it does not assume every individual job response has a `run_attempt` property. API contract: https://docs.github.com/en/rest/actions/workflow-jobs?apiVersion=2022-11-28 . Marker authenticity is CI/GitHub provenance, not an independent Render query.

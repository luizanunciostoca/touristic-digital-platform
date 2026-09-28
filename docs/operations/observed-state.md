# Generated engineering state

Run a read-only bootstrap from any checkout with Node 22+ and an authenticated
GitHub CLI:

```bash
node tooling/control-state/status.mjs status --summary \
  --staging-url https://YOUR-STAGING-HOST \
  --production-url https://YOUR-PRODUCTION-HOST
```

Omit --summary for machine-readable JSON. --repo selects the canonical repository
(default luizanunciostoca/touristic-digital-platform). --local-dir selects the
workspace to inspect. MORRO_STAGING_URL and MORRO_PRODUCTION_URL are optional
origin-only HTTPS environment variables. No new secret is required; gh uses its
existing credentials. No GitHub token is forwarded to runtime probes.

The command makes GET requests and reads local Git with optional index locks
disabled. It writes no registry, manifest, file, commit, issue, deployment or
workflow. Redirect JSON to an external artifact when needed; do not commit
operational snapshots to main. --strict returns exit 1 when any blocker is
observed. Invalid arguments return exit 2. Ordinary diagnostic mode returns JSON
even when some sources are unavailable.

The captured main SHA and tree identify every versioned claim, manifest and
backlog read. A second main read detects concurrent integration. PRs, Actions
and runtime are independently timestamped observations, not an atomic database
snapshot. Missing permissions, invalid data and transport failures are explicit
UNAVAILABLE sources; raw API errors and runtime diagnostic details are omitted.

Output includes main/tree, open PRs, registry claims, active ChangeSets, declared
task owners, active Actions, recent CI/deployment samples, runtime release SHAs,
readiness, local workspace and blockers. Active PR pagination is complete.
Recent CI and GitHub deployment histories are explicitly bounded samples.
A GitHub deployment record never substitutes for runtime identity. All active
registry entries stay visible in observedClaims. activeClaims excludes expired
entries and claims with proven MERGED observations. A merged observation requires
an exact canonical branch PR merged into main, its merge commit ancestral to the
captured main, the same ChangeSet id/branch/base identity in that merge commit,
and a branch that is absent or has no commits outside that main.
Missing access, reused branches with unique work and unproven ancestry retain an
unverified claim. Merge evidence records the PR, SHAs and branch observation; it
never implies deployment, accepted release proof or permission to write. The
registry remains unchanged, so completed merges need no reconciliation PR.

Runtime observation requires matching valid x-release-sha headers from /healthz
and /readyz, successful HTTP responses, live liveness, ready readiness, a healthy
overall status and explicit passing checks, including commerce-runtime. HTTP 200 with degraded status is
unhealthy. Disabled, missing or non-passing checks do not become a green result.
Observed health is still not release acceptance, artifact provenance, tenant
isolation proof, or permission to promote.

Fabric remains executable authority. Desired task definitions and exclusive
ownership remain versioned. nextReadyTasks stays empty until a trusted Fabric
scheduler supplies accepted dependency evidence; stale backlog status is never
used to authorize dispatch. Declared READY items are only readyCandidates with
DESIRED_STATE_CANDIDATE basis, dispatchAllowed=false and requiresFabricProof=true.
Every desired task includes its declared state and the reason it cannot be
advanced from these observations. nextActions translates each observed blocker
into a concrete next investigation. Claimed owners are not represented as running
processes. Use API observations to select the next investigation, then apply
existing ownership, proof and deployment gates.

Registry maintenance remains serialized by the orchestrator under the existing
Claim Guard. This command never changes claims or supplies write authorization.
The Claim Guard prerequisite is already merged; this CLI does not modify its
implementation or trusted workflows. The existing Quality CI selection contract
step includes the observed-state tests on Node 22.

```bash
node --test tooling/ci/control-state-status.test.mjs
```

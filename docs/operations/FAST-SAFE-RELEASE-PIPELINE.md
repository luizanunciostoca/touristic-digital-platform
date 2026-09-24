# Fast-Safe Release Pipeline

## Goal

Reduce release latency without weakening exact-SHA, security, staging, or production gates.

## Implemented

1. **Tree-equivalent evidence reuse**
   - Final Release Acceptance detects the second parent of a merge commit.
   - Reuse is allowed only when that parent has the exact same Git tree SHA as current `main`.
   - Only successful workflow evidence from that exact parent may be reused.
   - Any suite without reusable evidence is dispatched again on current `main`.

2. **Explicit reuse manifest**
   - `tooling/ci/release-acceptance-manifest.json` is the canonical inventory.
   - `pnpm release:acceptance-manifest:check` rejects missing, duplicate, non-dispatchable, or SHA-sensitive workflows marked reusable.

3. **Collective waiting**
   - Final acceptance polls all dispatched runs as one set instead of blocking sequentially on each run.

4. **One exact-head build authority in acceptance**
   - Final Release Acceptance builds current `main` once before evidence convergence.
   - Release Promotion remains the local runtime/build promotion authority.
   - Production preflight re-proves upstream gates and no longer performs an additional duplicate build.

5. **Merge-queue readiness**
   - The required `quality` workflow now supports GitHub's `merge_group` event.
   - The repository ruleset still has to enable Merge Queue at the GitHub administration layer.

## Security invariants

- No evidence may cross different Git tree SHAs.
- SHA-sensitive workflows cannot be marked tree-reusable.
- Staging must still report the exact current release SHA.
- Release Promotion must still prove successful Final Release Acceptance for the exact SHA.
- Production must still prove Final Release Acceptance, Release Promotion, dependency audit, and security scanning for the exact SHA.
- Production deployment still requires `confirm_production=DEPLOY`.
- Production health must still identify the exact deployed SHA.

## Administrative follow-up

The active repository ruleset `main-release-protection` currently requires pull requests and the `quality` status check with strict up-to-date enforcement. Enabling GitHub Merge Queue requires a repository-ruleset administration change; the connected GitHub integration available to this engineering session exposes ruleset reads but not ruleset writes.

After Merge Queue is enabled, `quality` is already prepared to execute on `merge_group`, removing the recurring "main moved, refresh branch, rerun" cycle without weakening the required quality gate.

## Pages certification gate

GitHub Pages is versioned through `.github/workflows/pages-after-final-acceptance.yml`.
It has no `push` or `pull_request` deploy trigger. It consumes the SHA from a successful
`Final Release Acceptance` workflow-run, proves that SHA is still current `main`,
re-proves the `Final Release Acceptance` commit status, builds that exact SHA, and
repeats the main/status proof immediately before deployment.

## External activation registry

The following are intentionally not simulated by repository code:

1. **GitHub Pages source** — Settings → Pages → Build and deployment must use
   **GitHub Actions**. If it remains **Deploy from a branch**, GitHub can continue its
   platform-managed Pages build outside this certified workflow.
2. **GitHub Merge Queue** — the repository ruleset must be administratively enabled
   for Merge Queue before `merge_group` becomes active. The workflows are only
   readiness code until that setting is enabled.
3. **Render OCI cutover** — Render services must be administratively configured for
   image-backed deployment and image deploy hooks before the OCI promotion workflows
   are usable. Existing Git-backed services remain authoritative until that cutover.

No production deployment is performed by this ChangeSet.

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

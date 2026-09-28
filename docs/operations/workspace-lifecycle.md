# Termux workspace lifecycle

GitHub `main` is the source of truth. The canonical local object store is
`~/morro-repo.git`, a bare repository with a normal origin (never a mirror).
Implementation happens only in `~/worktrees/<task-id>`. Existing clones and
dirty worktrees remain untouched.

## Bootstrap and create

Verify Commander and the Termux shell, then recapture the current GitHub main
SHA. Run these commands from a checkout containing this tooling:

```bash
node tooling/workspace/morro-workspace.mjs bootstrap <main-sha>
node tooling/workspace/morro-workspace.mjs create <task-id> infra/<task-id> <main-sha>
node tooling/workspace/morro-workspace.mjs inventory
```

Bootstrap verifies remote main before creating anything, fetches only
`refs/heads/main` into `refs/remotes/origin/main`, and refuses a different
origin, mirror configuration or unsafe refspec. It creates a complete,
independent Git object store; it does not depend on objects in the legacy clone.
The GitHub credential helper uses the existing `gh` authentication. No token
is printed or copied.

A create operation verifies live remote main before writing, then uses the exact
supplied main SHA, never the branch checked
out in another workspace or the bare repository's local `main` placeholder.
Bootstrap must be repeated after recapturing a new main SHA. A concurrent remote
main change aborts bootstrap after fetching; recapture before retrying.
Existing task paths and branches are never reset or reused. These commands do
not push, merge, install dependencies, alter repository claims or deploy.

Before editing a task, the orchestrator must register its ChangeSet and exclusive
claim through the current Fabric contract. A workspace is isolation, not write
authorization. Limit expensive dependency installs/builds according to the
device's available resources.

## Inventory and cleanup

Inventory is read-only and reports tracked/untracked dirtiness, ignored-entry
counts, HEAD reachability from cached `origin/main`, and branch identity.
It never grants deletion authority. A clean worktree can still contain valuable
ignored files or be used by a running process or active claim.

Before an orchestrator removes an old worktree, separately prove all of:

- a freshly verified main contains every required commit;
- tracked and untracked files are clean, and ignored files have been reviewed;
- no relevant open PR or active claim owns the worktree;
- no active process uses the worktree;
- branch ownership and any retained recovery evidence are known.

Preserve dirty, unique and unknown worktrees. Do not use `git clean`,
`reset --hard`, forced worktree removal or an automatic deletion loop to
establish those conditions. The utility intentionally has no remove command.
After a separately approved removal, `git worktree prune --dry-run` may inspect
stale metadata; pruning metadata is not a substitute for proving safe removal.

## Validation

```bash
node --test tooling/workspace/morro-workspace.test.mjs
```

Tests create temporary local repositories and verify exact-main isolation,
idempotent bootstrap, dirty/unique preservation, path collision protection and
rejection of mirror or unsafe fetch configuration. They do not access GitHub or
the user's existing worktrees.

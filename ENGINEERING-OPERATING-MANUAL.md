# Engineering Operating Manual

The constitution contains invariants; this file defines the Control Plane V3.2 operating path.

## Normal cycle

`CAPTURE → RECONCILE → PLAN → CLAIM → IMPLEMENT → PROVE → INTEGRATE → VERIFY → CLEANUP → MEASURE → NEXT`.

Use live discovery instead of asking an operator for values available from GitHub, runtime or the Termux bridge.

## Golden path

The activated worker interface is `mdctl task start <changeset>`, `mdctl task test <changeset>`, `mdctl task submit <changeset>`.

The first activated read-only surface is:

```text
pnpm mdctl -- bootstrap
pnpm mdctl -- status
pnpm mdctl -- invariants
pnpm mdctl -- plan
```

`bootstrap` and `status` are read-only. `--strict` fails when a critical invariant or observed-state blocker is red.

Task lifecycle example:

```text
pnpm mdctl -- task start .morro/changesets/MD-EXAMPLE.json --owner WORKER-ID
pnpm mdctl -- task test .morro/changesets/MD-EXAMPLE.json
pnpm mdctl -- task submit .morro/changesets/MD-EXAMPLE.json
```

Task state, capability leases, Context Packs and machine handoffs are stored under the repository Git metadata path (`git rev-parse --git-path morro-control`) by default, so ephemeral execution state is not committed accidentally. An explicit `--state-dir` may be used for isolated tests.

## Authority

Workers may implement, test, commit, push and open PRs only inside an active bounded claim. Workers do not merge main, arbitrarily deploy production, alter global authority, create financial authority or execute destructive database operations.

A capability lease is a secondary task-level gate and never replaces the active claim. Global write authority remains the orchestrator claim. A task-local lease registry cannot grant access outside the ChangeSet ownership paths, cannot mint financial authority, and cannot promote a task to remote proof.

Integration, release and external activation are separate gates. Configuration in Git is EXPECTED state until observed externally.

## State and evidence

Ephemeral bootstrap tooling must be removed from the candidate tree before trusted proof is accepted; historical helper commits are not release authority.

Desired state belongs in Git. Observed state is collected from live authorities. Derived state is computed from desired plus observed evidence. The authority event ledger records only authority-changing events.

A statement such as “tests passed” is insufficient. Evidence must identify its candidate and validator inputs. Reuse requires matching tree, validator, environment class and dependency fingerprint.

## Workspaces and WIP

New work uses the canonical bare repository and disposable worktrees. Default ceilings are four implementation workers, one critical worker and one shared patch. Conflicting paths, contracts, databases or authorities serialize work.

## Release

A release candidate is built once. Staging and production receive the same immutable artifact digest. Production acceptance compares expected and observed source, tree, artifact, configuration, migration and readiness identities.

## Exceptions

Real money, paid-provider activation, new production secrets, destructive/irreversible database actions and major authority/security-model changes stop at the configured owner gate. Complete reversible prior work first.

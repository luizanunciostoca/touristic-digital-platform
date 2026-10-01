# Engineering Operating Manual

The constitution contains invariants; this file defines the Control Plane V3.2 operating path.

## Normal cycle

`CAPTURE → RECONCILE → PLAN → CLAIM → IMPLEMENT → PROVE → INTEGRATE → VERIFY → CLEANUP → MEASURE → NEXT`.

Use live discovery instead of asking an operator for values available from GitHub, runtime or the Termux bridge.

## Golden path

The target worker interface is `mdctl task start <task>`, `mdctl task test`, `mdctl task submit`.

The first activated read-only surface is:

```text
pnpm mdctl -- bootstrap
pnpm mdctl -- status
pnpm mdctl -- invariants
pnpm mdctl -- plan
```

`bootstrap` and `status` are read-only. `--strict` fails when a critical invariant or observed-state blocker is red.

## Authority

Workers may implement, test, commit, push and open PRs only inside an active bounded claim. Workers do not merge main, arbitrarily deploy production, alter global authority, create financial authority or execute destructive database operations.

Integration, release and external activation are separate gates. Configuration in Git is EXPECTED state until observed externally.

## State and evidence

Desired state belongs in Git. Observed state is collected from live authorities. Derived state is computed from desired plus observed evidence. The authority event ledger records only authority-changing events.

A statement such as “tests passed” is insufficient. Evidence must identify its candidate and validator inputs. Reuse requires matching tree, validator, environment class and dependency fingerprint.

## Workspaces and WIP

New work uses the canonical bare repository and disposable worktrees. Default ceilings are four implementation workers, one critical worker and one shared patch. Conflicting paths, contracts, databases or authorities serialize work.

## Release

A release candidate is built once. Staging and production receive the same immutable artifact digest. Production acceptance compares expected and observed source, tree, artifact, configuration, migration and readiness identities.

## Exceptions

Real money, paid-provider activation, new production secrets, destructive/irreversible database actions and major authority/security-model changes stop at the configured owner gate. Complete reversible prior work first.

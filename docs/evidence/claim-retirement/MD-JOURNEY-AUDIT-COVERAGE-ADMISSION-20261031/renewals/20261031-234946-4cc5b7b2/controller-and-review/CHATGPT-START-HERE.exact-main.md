# CHATGPT START HERE — Persistent Termux Operator Contract

> Durable operating contract for ChatGPT sessions that need to use the Morro Digital Android/Termux environment.

## 1. Persistent capability exists

Canonical control repository:

`luizanunciostoca/morro-termux-control`

Repository visibility must remain **PRIVATE**.

Native Termux Agent V3 over GitHub Issues is the canonical preferred transport, by the operator's current instruction. Commander is optional and must not be a prerequisite for tablet access. Its historical boot acceptance does not authorize restoring its autostart.

### Optional secondary — direct Remote Desktop Commander

```text
ChatGPT
  -> Remote Desktop Commander MCP
  -> paired Remote Device on the tablet
  -> Termux shell / filesystem / processes
```

This path does **not** use GitHub Issues for command transport.

Historical direct installation (do not assume these pieces are active):

```text
~/.termux/boot/10-morro-remote-commander.sh
  -> termux-services / runit
  -> service: desktop-commander
  -> Desktop Commander 0.2.51 + libtermux-exec
```

This tablet uses Termux Google Play `googleplay.2026.06.21`; boot-hook support is integrated into the main Termux app, so no separate `com.termux.boot` package is required.

### Primary — Native Termux Agent V3 over GitHub Issues

```text
ChatGPT
  -> GitHub connector
  -> private GitHub Issue [TERMUX-JOB]
  -> Native Termux Agent V3
  -> target: Termux or Debian/PRoot
  -> stdout/stderr/result metadata posted to the issue
  -> issue closed
```

The Native Agent persistence chain is:

```text
Android boot
  -> integrated Termux boot hooks
  -> ~/.termux/boot/20-morro-native-agent.sh
  -> scripts/termux-native-supervisor.sh
  -> scripts/termux-native-agent.sh daemon
```

Never conclude that the tablet is inaccessible merely because one transport is unavailable.

## 2. Transport selection

For ordinary shell/filesystem/process work:

1. Read the live exact-title Native Agent heartbeat singleton.
2. If the Native Agent is healthy, use schema-v2 GitHub Issues jobs and verify their bound results.
3. If Native Agent execution is unavailable, Commander may be used when already available and its live health is proven.
4. Do not install, pair, restart or restore Commander autostart merely to satisfy transport selection.
5. Ask for manual tablet intervention only when no authorized remote route can perform the task or Android requires a physical/UI action.

Commander availability does not override the preferred Native Agent route. Preserve the Native Agent supervisor and boot persistence.

## 3. Direct Commander health and operation

Healthy direct state means all of the following are true:

- the Remote Desktop Commander device is listed as online;
- `ping` succeeds;
- a read-only shell probe succeeds;
- filesystem reads under the Termux home succeed.

The direct device lifecycle is controlled locally by:

```bash
cd "$HOME/morro-termux-control"
bash scripts/termux-remote-commanderctl.sh status
bash scripts/termux-remote-commanderctl.sh restart
bash scripts/termux-remote-commanderctl.sh logs
```

Interactive first-time or re-authorization pairing is:

```bash
bash scripts/termux-remote-commanderctl.sh pair
```

The authenticated Remote Device session remains local to the tablet. Never commit device credentials or tokens to GitHub.

## 4. Native Agent heartbeat

Before issuing a Native Agent job, enumerate all **open** issues whose title is exactly:

`[TERMUX-AGENT] status`

Invariant:

- there must be exactly one open exact-title heartbeat;
- never trust or hardcode an issue number;
- never trust a cached PID, timestamp, SHA, or device state;
- use the live singleton and its fresh `heartbeat_utc` as authority.

Healthy state resembles:

```text
MORRO_NATIVE_AGENT_V3

state: ONLINE
build: native-v3
protocol_version: 2
agent_instance_id: <stable for one daemon lifetime>
boot_id: <kernel boot id>
heartbeat_utc: <timestamp>
arch: aarch64
pid: <numeric shell pid>
poll_seconds: 30
transport: GitHub Issues
targets: termux,debian
```

If the heartbeat is stale, allow at least one 60-second supervisor cycle before declaring the Native Agent unhealthy.

## 5. Creating a Native Agent job

Create a GitHub issue in the canonical private repository.

Title:

```text
[TERMUX-JOB] <short descriptive title>
```

Body must be raw JSON:

```json
{
  "version": 2,
  "confirm": "EXECUTE",
  "id": "unique-job-id",
  "target": "termux",
  "cwd": "~",
  "timeout_seconds": 120,
  "command": "uname -a; id; pwd"
}
```

Rules:

- serialize the complete request with a real JSON serializer; never manually interpolate or nest quoted command text into JSON;
- the GitHub preflight workflow validates the exact current issue body, canonicalizes it with sorted JSON keys, computes its SHA-256, and posts a `MORRO_JOB_PREFLIGHT_V3` attestation as `github-actions[bot]`;
- the Native Agent will not claim or execute the job until that attestation matches the canonical hash of the current body;
- editing the issue body invalidates any older attestation automatically because its hash no longer matches;
- invalid JSON/schema is closed fail-closed by preflight and is never executable;
- `version`: `2`
- `confirm`: exactly `EXECUTE`
- `id`: letters, numbers, dot, underscore or hyphen
- `target`: `termux` or `debian`
- `cwd`: working directory; `~` and `~/...` are supported
- `timeout_seconds`: 1 through 3600
- `command`: shell command/script

The agent accepts jobs only from the authorized repository owner.

## 6. Reading a Native Agent result

A completed Native Agent job is normally closed and contains a comment beginning:

```text
MORRO_AGENT_RESULT_V3
```

Inspect at minimum:

- `id`
- `target`
- `exit_code`
- `started_at`
- `ended_at`
- `duration_seconds`
- `request_sha256`
- `stdout`
- `stderr`

Do not infer success merely from issue closure. Success normally requires `exit_code: 0` plus expected output.

The `request_sha256` in the result is the SHA-256 of the canonical validated JSON request, and must match the preflight attestation for that execution.

## 7. Target semantics

### Termux

Typical capabilities include:

- git / gh
- bash
- curl
- jq
- node/npm/pnpm when installed
- Python when installed
- Termux utilities
- proot-distro
- filesystem/process/network commands allowed by Android/Termux permissions

### Debian

Runs inside Debian GNU/Linux 13 (trixie), PRoot, ARM64/aarch64, home `/root`.

An effective uid of 0 inside PRoot is **not Android kernel root**.

## 8. Security and execution rules

Both transports operate under the tablet user's effective permissions and are intentionally auditable.

Never place passwords, PATs, registration tokens, API secrets, private keys, or other long-lived secrets in GitHub issue bodies, source files, logs intended for publication, or chat text.

Prefer already-authenticated local CLIs and local credential stores.

The Native Agent remains fail-closed with repository/owner checks, GitHub Actions pre-dispatch attestation, canonical request serialization/hash binding, request schema validation, explicit confirmation, body-edit invalidation, bounded timeouts, stdout/stderr capture, replay protection, supervisor recovery, and boot persistence.

The Commander path must keep its saved device authorization local to the tablet.

## 9. Operational behavior for future chats

When the user asks to inspect, build, test, modify, run, deploy, diagnose, or operate something available through the tablet:

1. Recapture the current `main` of this repository.
2. Check the exact-title Native Agent heartbeat singleton and freshness.
3. If healthy, use Native Agent V3 and gather concrete request/result evidence.
4. If Native execution is unavailable, check Commander only as an optional secondary route.
5. Use a secondary route only after verifying its live health and task authorization.
6. Iterate until the requested task is complete.
7. Report the transport used and concrete result evidence.

Do **not** send the user manual Termux commands first while either remote transport is healthy.

Do **not** say "Termux has no access" merely because a ChatGPT-side connector/tool call is blocked. Distinguish at least:

- `DIRECT_COMMANDER_OFFLINE`
- `NATIVE_AGENT_HEARTBEAT_STALE`
- `GITHUB_JOB_DISPATCH_BLOCKED_BY_CLIENT`
- `GITHUB_CONNECTOR_UNAVAILABLE`
- `TABLET_UNREACHABLE_BOTH_TRANSPORTS`

## 9A. Touristic Digital Platform checkout discipline

For `luizanunciostoca/touristic-digital-platform`, never treat the long-lived checkout at `$HOME/touristic-digital-platform` as current authority or as a shared writable workspace.

Use the bare store at `$HOME/repos/touristic-digital-platform.git` and disposable worktrees under `$HOME/worktrees`.

Before creating a writer worktree, the Control Plane must have selected a READY task and granted its claim/lease. Read-only discovery must not create a branch.

Use:

```bash
cd "$HOME/morro-termux-control"
scripts/tdp-worktreectl.sh bootstrap
scripts/tdp-worktreectl.sh refresh
scripts/tdp-worktreectl.sh create <task-id> <lease-id> refs/heads/main <exact-main-sha>
```

Never reuse a worktree for another writer or lease. Retire clean worktrees after completion. Dirty worktrees are quarantined and preserved for forensic recovery instead of being silently deleted.

See `docs/PLATFORM_WORKTREES.md` for the full lifecycle.

## 10. Recovery

### Direct Commander offline

Commander being offline does not block work through a healthy Native Agent. Inspect or recover Commander only when the task specifically needs that optional route; do not restore autostart by default.

Local recovery commands are:

```bash
cd "$HOME/morro-termux-control"
bash scripts/termux-remote-commanderctl.sh status
bash scripts/termux-remote-commanderctl.sh restart
```

If pairing is required:

```bash
bash scripts/termux-remote-commanderctl.sh pair
```

### Native Agent heartbeat stale

1. allow at least one 60-second supervisor cycle;
2. re-enumerate exact-title open heartbeat issues and verify singleton + freshness;
3. if still stale, use Commander when available;
4. otherwise local break-glass recovery is:

```bash
cd "$HOME/morro-termux-control"
bash scripts/termux-native-agentctl.sh status
bash scripts/termux-native-agentctl.sh recover
```

A recuperação só está concluída quando **daemon e supervisor persistente** estão vivos. O comando `recover` deve restaurar ambos; um agente isolado sem `termux-native-supervisor.sh` não é estado persistente.

## 11. Acceptance evidence

### Native Agent — historically validated

Validated flows include:

- ChatGPT -> GitHub -> Termux -> GitHub -> ChatGPT
- ChatGPT -> GitHub -> Termux -> Debian/PRoot -> GitHub -> ChatGPT
- agent crash -> supervisor recovery
- Android reboot -> Termux:Boot -> supervisor -> agent
- post-reboot Termux execution
- post-reboot Debian execution

Historical proof issues include #15, #23, #25, #26 and #27. They are historical evidence only.

### Direct Commander — historical acceptance

The direct path was accepted on 2026-10-01. That historical acceptance does not define the current transport preference or prove present boot configuration.

Validated on 2026-10-01:

1. tablet appears online in Remote Desktop Commander;
2. ChatGPT `ping` succeeds;
3. direct Termux shell execution succeeds;
4. direct filesystem create/read/delete succeeds;
5. Debian/PRoot execution succeeds;
6. controlled runit service restart reconnects without re-pairing;
7. Android reboot reconnects without manual command entry;
8. post-reboot direct shell execution succeeds;
9. Native Agent also recovers after the same reboot and executes a real job successfully.

Historical post-reboot Native Agent proof: issue #569. Treat that issue only as evidence; always check current live state before acting.

## 12. Canonical files

- `CHATGPT-START-HERE.md` — this contract
- `docs/DIRECT_ACCESS.md` — direct Commander runbook
- `scripts/termux-remote-commanderctl.sh` — direct device lifecycle controller
- `scripts/install-direct-commander.sh` — Termux:Boot installer
- `scripts/direct-commander-bootstrap.test.sh` — direct bootstrap regression proof
- `scripts/termux-native-agent.sh` — GitHub job agent
- `scripts/termux-native-agentctl.sh` — Native Agent lifecycle controller
- `scripts/termux-native-supervisor.sh` — Native Agent recovery supervisor
- `scripts/termux-native-agent-heartbeat.test.sh` — Native Agent lifecycle/singleton regression proof
- `scripts/tdp-worktreectl.sh` — exact-SHA bare-store/disposable-worktree controller
- `scripts/tdp-worktreectl.test.sh` — worktree lifecycle regression proof
- `docs/NATIVE_AGENT.md` — Native Agent architecture documentation
- `docs/PLATFORM_WORKTREES.md` — Touristic Digital Platform checkout/worktree runbook
- `~/.termux/boot/10-morro-remote-commander.sh` — historical optional direct boot hook; do not restore by default
- `~/.termux/boot/20-morro-native-agent.sh` — Native Agent tablet boot hook

## 13. Authority rule

Never rely on a hardcoded repository SHA, issue number, PID, device state, or timestamp from this document or an older conversation.

Before modifying code or assuming state:

```text
fetch current main
check live Native Agent heartbeat singleton and freshness
check current job/result state and hash binding
check Commander live health only when using that optional route
```

The live repository defines the execution contract; current transport observations prove availability. Operator authorization defines allowed actions. Historical transport acceptance never overrides the current Native Agent preference.



## Bounded P2 provisioning admission

The only exception to the pre-existing task/claim/lease prerequisite is the
exact pair and restricted preparation lease defined in
[PLATFORM_WORKTREES.md](docs/PLATFORM_WORKTREES.md#bounded-p2-correction-provisioning-admission).
It requires specific owner approval, independent review, valid canonical
authority and the reviewed adapter gates. It does not issue or consume a
grant, start a worker, create credentials, widen transport permissions or
authorize deployment. All other task/claim/lease prerequisites remain active.

## One-time P2 control checkout

The exact, time-bounded assignment in docs/PLATFORM_WORKTREES.md requires
specific owner approval, independent review, normal integration and readback
before use. It covers only the identified P2 control checkout; no implicit lease,
credentials, historical writer reuse, composition recovery or deploy is admitted.
All P2 grant, claim, identity and exclusivity gates remain mandatory.


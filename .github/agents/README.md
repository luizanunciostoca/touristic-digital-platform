# Morro custom agents — staged activation

## B3 contract

These twelve profiles declare specialization, not an ACTIVE coding factory. All disable automatic model invocation and permit manual selection. `release-engineer` and `security-auditor` expose only `read` and `search`. The ten implementation/testing profiles explicitly expose `read`, `search`, `edit` and `execute`; these tools do not grant ownership of any repository path or environment.

A selected implementation profile requires an isolated worktree and a current, unexpired exclusive ChangeSet claim before writing. Test engineers may change only claimed test/harness paths. Release/security reviewers remain read-only and cannot approve their own implementation work. The Integrator retains merge and canonical promotion authority.

The `tools` allowlist restricts profile tools. It is not a filesystem sandbox, a claim lock, a secret-access filter, or proof that a client loaded the intended profile. Shell-enabled profiles are not technically read-only. Sessions must not receive production secrets or privileged provider credentials. Do not describe these files as enforced Claim Guard or safety hooks.

`AGENTS.md` and `.morro/{fabric,ownership,risk-policy}.json` remain authoritative. Executable ChangeSets live in `.morro/changesets/`; `.github/morro-control` is an orchestration projection. The orchestrator serializes registry maintenance; workers must not claim the registry itself.

## Controlled activation

No mass autonomous dispatch is authorized by B3. MD-CP-003 must prove claim enforcement, safety hooks and negative bypass tests. MD-FR-001 must then exercise the limited first-run with independent acceptance before mass dispatch. Configuration validation does not satisfy either activation gate.

At activation, record the exact loaded profile revision and actual client toolset. A file on main does not prove a Codex/Copilot session started. Do not claim factory, provider, runtime, edge or production acceptance from this static profile test.

## Static proof

Run from the repository root:

```sh
node --test .github/agents/*.test.mjs
node .github/agents/profile-contract.mjs
```

The second command validates the real repository's profile set, role-specific tools and referenced Skill files and emits clean commit/tree identity. The tests use explicit synthetic fixtures for rejection cases. CI runs both commands on the exact PR head with a read-only token and no production secrets.

The validator accepts only the single-line frontmatter subset used here. New fields, tools, automatic invocation or additional profiles require an explicit reviewed contract change, not a permissive parser fallback. This check must pass before B3 is accepted; configuring it as a protected required check is a separate repository-administration concern.

## Evidence and authority

Record ChangeSet, main/head/tree SHAs, check/run IDs, timestamps, result and blockers. Static evidence is not a runtime proof or an independent review of the underlying implementation. Unexecuted tests remain NOT_RUN. The Integrator owns merge and promotion after all applicable gates; a profile cannot grant itself that authority.

## Configuration references

- [GitHub custom agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [Creating custom agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents)

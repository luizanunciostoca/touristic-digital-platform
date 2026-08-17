# Affiliate domain foundation

`packages/affiliates` contains the executable, policy-versioned FEATURE-0010 domain foundation.

Current stage:

- `AFFILIATE-POLICY-V1` is frozen in code and documentation;
- domain types and invariants are executable;
- Ordering and Financial are consumed only through public structural ports;
- no Affiliate-owned Payment, ledger, payable, wallet, settlement, transfer or payout authority exists;
- browser referral data remains untrusted evidence;
- tests are invoked from the root `affiliates:check` command and the permanent FEATURE-0010 workflow.

The manifest already establishes the ESM/package identity `@touristic/affiliates`. Workspace linking is intentionally excluded in `pnpm-workspace.yaml` until the pinned pnpm version can regenerate `pnpm-lock.yaml` reproducibly. Until then, root scripts invoke lint/typecheck/test/build directly, so the foundation remains inside repository quality gates without introducing an untracked lockfile importer.

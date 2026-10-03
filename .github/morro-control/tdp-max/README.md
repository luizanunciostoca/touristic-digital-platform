# TDP-MAX

TDP-MAX is a versioned policy and guard projection for ChatGPT/operator execution.
It does **not** replace Control Plane V3.2 or create a parallel lifecycle authority.

Canonical authorities:
- lifecycle: `.morro/fabric.json`
- ownership: `.morro/ownership.json`
- risk/proof selection: `.morro/risk-policy.json`
- claims/orchestration projection: `.github/morro-control/**`
- engineering policy: `AGENTS.md` and `CONSTITUTION.md`
- Termux operations: LIVE `luizanunciostoca/morro-termux-control/CHATGPT-START-HERE.md`
- runtime: live provider/runtime evidence

Mutable operational state (SHA, branch, PR, issue, PID, heartbeat, claim, worktree,
deploy, runtime identity, transport preference) must never be frozen into this policy.

Validation: `pnpm tdp-max:check`

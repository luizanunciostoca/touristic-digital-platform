# TDP-MAX guard layer

TDP-MAX is a projection and validation layer for the existing Touristic Digital Platform Control Plane V3.2.

It does not create a second control plane, lifecycle, ownership model, risk model, release authority, or runtime authority.

Canonical authority remains:

- lifecycle: `.morro/fabric.json`
- semantic/path ownership: `.morro/ownership.json`
- risk and required proof: `.morro/risk-policy.json`
- engineering policy: `AGENTS.md` and `CONSTITUTION.md`
- code authority: current GitHub `main`
- runtime authority: live observed runtime/external state

The TDP-MAX files make recurring failure modes executable and reviewable. The validator fails closed when a guard is weakened, an authority is duplicated, or evidence can be accepted without exact identity.

Run `pnpm tdp-max:check`.

The check is also invoked from the existing CI governance path; no additional GitHub Actions workflow is introduced.

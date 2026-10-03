# TDP-MAX policy

TDP-MAX extends the existing Control Plane V3.2 as a validation layer.

Canonical files remain unchanged in authority:
- `.morro/fabric.json`
- `.morro/ownership.json`
- `.morro/risk-policy.json`
- `AGENTS.md`
- `CONSTITUTION.md`

The TDP-MAX validator checks exact candidate identity, required evidence, execution-target identity, external Termux transport observation, and recovery-evidence freshness.

A TDP-MAX result is complete only after integration readback and lifecycle reconciliation.

This change is governance tooling only.

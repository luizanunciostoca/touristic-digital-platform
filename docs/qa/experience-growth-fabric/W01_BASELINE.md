# Experience & Growth Fabric — W01 baseline

- Canonical repository: `luizanunciostoca/touristic-digital-platform`
- W00 main SHA: `bf7d0195ae88b1d14cf4c2e44dbf32be173751d5`
- W00 tree SHA: `c277f537220364730e6637183bc821376c87b8c2`
- Construction branch: `feat/experience-growth-fabric-isolated-20260929`
- Worker branch: `feat/egf-w01-contracts-20260929`
- Runtime integration: none
- Database mutation: none
- Production activation: none

## Repository-reality adjustment

A new top-level workspace package would require changing the existing
`pnpm-lock.yaml`, which violates the isolated phase ADD-ONLY constraint.
Therefore W01 is materialized as a new module namespace under the existing
`@touristic/shared` package. It is compiled, linted and tested by the
existing workspace without modifying the lockfile or any current source file.

The later Controlled Integration Plan may extract these contracts into a
dedicated package only after the isolated acceptance is complete.

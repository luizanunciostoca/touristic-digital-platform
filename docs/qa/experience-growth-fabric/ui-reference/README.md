# Experience & Growth Fabric — UI Reference

This directory is an isolated, static reference only.

It is intentionally not imported, served or mounted by the current Morro Digital
runtime. The reference exists to make W16 reviewable without changing Home,
Assistant, Map, Control Center or any production route.

## Acceptance boundaries

- minimum interactive target: 44 px;
- semantic headings and landmark navigation;
- keyboard focus visibility;
- responsive layout;
- locale-aware surface contract;
- no payment, settlement, commission or ledger authority;
- no current API calls;
- no current database calls;
- no production activation.

The corresponding machine-readable contract is under
`packages/shared/src/experience-growth-fabric/ui-reference`.

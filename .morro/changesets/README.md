# Morro ChangeSet Registry

Every executable unit of work should have a versioned ChangeSet manifest.

Required fields:

- id
- baseSha
- branch
- state
- risk
- owns.paths
- owns.contracts
- reads.contracts
- dependencies
- requiredEvidence
- stopAt

Workers may advance only through REMOTE_PROVEN.
Integrators own COMPOSITION_PROVEN, POLICY_SATISFIED, MERGE_READY and MERGED.
Release managers own release states.

A manifest must never be edited to claim evidence that was produced for another HEAD SHA.

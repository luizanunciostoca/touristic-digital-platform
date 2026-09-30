# Architecture

Assistant VNext is an isolated Platform Orchestrator.

Pipeline:

INPUT -> NORMALIZER -> CONTEXT ASSEMBLER -> UNDERSTANDING -> ORCHESTRATOR -> PLANNER -> POLICY ENGINE -> CAPABILITY GATEWAY -> TOOL REGISTRY -> DOMAIN TOOLS -> EVIDENCE -> GROUNDED COMPOSER -> ACTION ENVELOPE -> MEMORY -> OBSERVABILITY

The implementation in this directory is non-authoritative and does not import into the current application.

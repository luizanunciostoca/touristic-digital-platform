# CRM M70 — Leads/Pipeline Server Boundary Evidence

## Scope

M70 introduces the first server-authoritative CRM command/query boundary. It consumes the M69 CRM authorization policy and remains persistence/transport agnostic.

## Frozen V1 behavior

The frozen CRM exposes protected lead operations for list, get, create, update, stage update and delete. Lead listing supports stage/status/search filtering. Stage mutation updates `lastContactAt` and appends a `stage_change` interaction.

The V1 create flow also contains a defect: it writes a system interaction with `leadId: 0` before rediscovering the inserted lead.

## Permanent V2 implementation

`@touristic/crm/leads-boundary` now provides:

- authenticated bounded lead list/search queries;
- get/create/update/updateStage/delete commands;
- explicit CRM ID, stage, status, email, money and text validation;
- maximum list limit of 200 and non-negative offsets;
- M69 authorization policy enforcement before mutations;
- structured denial, invalid-input and not-found audit events through `CrmLeadAuditPort`;
- stage-change interaction preservation;
- create lifecycle that requires the repository to return the created lead before checklist/interaction writes.

The last point intentionally fixes the frozen V1 `leadId: 0` behavior. Checklist and interaction writes can only receive the real returned lead ID.

## Executable evidence

Temporary validation run `31548898112` passed before documentation reconciliation:

- lockfile generation and frozen reinstall;
- M70 validation fixes and canonical Prettier formatting;
- CRM lint;
- CRM typecheck;
- CRM tests including M70 boundary scenarios;
- CRM build;
- repository `format:check`;
- `architecture:check`;
- `features:check`;
- repository lint;
- repository typecheck;
- repository tests;
- repository build.

Permanent M70 tests prove fail-closed unauthenticated reads, bounded queries, viewer mutation denial, no `leadId: 0` create write, valid stage-change interaction and invalid-stage rejection/audit.

## Matrix decision

Three rows advance from GAP to PARTIAL: Lead list/search, Lead CRUD/server validation and automated regression coverage. Existing pipeline and server authorization rows remain PARTIAL with stronger evidence. Matrix: `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`.

No PASS is claimed because no concrete persistence adapter, transport boundary or browser consumer exists yet.

## State decision

`MIG-0008` remains `migrating`. `FEATURE-0006` remains `baseline-pending`, not `equivalent`.

## Next milestone

M71 should implement the first concrete CRM persistence adapter behind the M70 repository port, preserving server-only credentials and the frozen schema constraints before an HTTP/browser surface is introduced.

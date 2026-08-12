# CRM M88 — Recurring follow-up scheduler host

## Scope

M88 turns the merged M87 scheduler boundary into a reusable recurring process host without introducing a concrete messaging provider.

## Included

- recurring host around `CrmFollowUpScheduler`;
- immediate first run by default with opt-out;
- minimum 1000 ms interval validation;
- serialized execution so overlapping timer ticks cannot start concurrent scheduler runs inside one host;
- idempotent `start()` and `stop()` lifecycle;
- graceful stop waits for the active scheduler run to finish;
- per-run success callback and contained error callback;
- recurring execution continues after a scheduler failure;
- MySQL composition helper using `MySqlCrmFollowUpRepository`;
- delivery provider, task UID factory, clock and actor remain injected dependencies;
- focused host lifecycle tests.

## Deliberately deferred

- concrete WhatsApp provider integration;
- provider credentials/secrets;
- executable production process/container entrypoint;
- AI-assisted message generation;
- browser Follow-ups/settings UI;
- historical V1 migration.

## Safety

M88 does not introduce an external side-effect provider. A host cannot deliver anything unless a concrete `CrmFollowUpDeliveryPort` is explicitly injected. In-process overlapping ticks are collapsed into the currently running promise, while M87 row claims continue to protect against duplicate work across multiple hosts/processes.

## Promotion rule

Keep the PR draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M88 files and no review thread remains unresolved.

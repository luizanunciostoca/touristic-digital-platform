# CRM M85 — Follow-ups MySQL persistence

## Scope

M85 adds durable MySQL persistence behind the merged M84 authenticated Follow-ups boundary.

## Included

- `crm_follow_up_settings` relational persistence for deterministic automation settings;
- `crm_follow_ups` relational persistence preserving the frozen V1 statuses `pending | sent | responded | skipped`;
- lead FK with cascade and optional setting FK with `ON DELETE SET NULL`;
- prepared settings/list/create/read queries;
- due-pending query ordered by schedule;
- atomic `pending → sent` and `sent → responded` updates;
- durable follow-up interaction persistence;
- durable lead `last_contact_at` update;
- durable authorization/audit adapter through `crm_audit_events`;
- focused schema/repository tests.

## Deliberately deferred

- authenticated HTTP/Node composition;
- scheduler/cron execution;
- AI-assisted follow-up message generation;
- browser Follow-ups/settings UI;
- historical V1 migration.

## Safety

M85 does not introduce an in-memory production fallback. SQL values remain prepared and the lifecycle transition updates fail closed when the expected source state no longer matches.

## Promotion rule

Keep the PR draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M85 files and no review thread remains unresolved.

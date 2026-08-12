# CRM M87 — Scheduled follow-up execution

## Scope

M87 adds deterministic scheduled Follow-ups execution on top of the merged M84 boundary, M85 MySQL persistence and M86 authenticated HTTP composition.

## Included

- due automated follow-up execution through a dedicated scheduler boundary;
- atomic row claim using `schedule_cron_task_uid` so concurrent workers cannot dispatch the same pending follow-up;
- only due, unclaimed, `pending` records are scheduler candidates;
- manual follow-ups without a setting remain outside automated delivery;
- inactive settings, missing templates and exceeded attempt limits fail closed to `skipped`;
- delivery is abstracted behind `CrmFollowUpDeliveryPort`;
- successful delivery transitions the claimed row to `sent`, records a `follow_up` interaction and updates lead `last_contact_at`;
- failed or throwing delivery releases the claim and leaves the row pending for a future retry;
- terminal scheduler updates are bound to the same claim UID that acquired the row;
- focused scheduler and MySQL concurrency tests.

## Deliberately deferred

- concrete WhatsApp provider integration;
- AI-assisted message generation;
- recurring process/cron host wiring;
- browser Follow-ups/settings UI;
- historical V1 migration.

## Safety

M87 does not send through a production messaging provider. The scheduler consumes only explicit templates and never invents a message. Concurrent execution is fail-closed through prepared conditional updates and a stable per-dispatch claim UID.

## Promotion rule

Keep the PR draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M87 files and no review thread remains unresolved.

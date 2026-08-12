# CRM M92 — Trials automatic expiry scheduler evidence

## Scope

M92 adds automatic expiry execution for durable CRM trials after M89 domain semantics, M90 MySQL persistence and M91 authenticated HTTP transport were merged and validated.

## Permanent implementation

- `packages/crm/src/trials-scheduler.ts`
- `packages/crm/src/trials-scheduler.test.ts`
- `packages/crm/package.json`
- `services/crm/src/mysql-trials-repository.ts`
- `services/crm/src/mysql-trials-repository.test.ts`
- `services/crm/src/trials-scheduler-host.ts`
- `services/crm/src/trials-scheduler-host.test.ts`
- `services/crm/src/index.ts`

## Scheduler contract

The scheduler considers only trials satisfying all durable conditions:

- `status = 'active'`
- `end_date <= CURRENT_TIMESTAMP(3)`
- `schedule_cron_task_uid IS NULL`

Each candidate is claimed through a compare-and-set update that writes a unique task UID only while those conditions remain true. A claimed trial can be expired only when the same task UID still owns the claim.

## Failure behavior

- a candidate lost to another claimant is ignored
- a persistence failure releases only the matching active claim
- overlapping host ticks are coalesced into one in-flight scheduler execution
- the host isolates scheduler errors through `onError`
- the scheduler appends a system interaction after successful automatic expiry

## Lifecycle parity

Automatic expiry performs the same terminal `active -> expired` state transition already frozen by M89. It does not mutate the lead stage because the existing manual expiry contract does not do so.

## Deliberately excluded from M92

- trial-expiry notifications or message delivery
- `notified_at` mutation
- browser UI
- historical V1 migration
- changes to manual M91 HTTP lifecycle routes

## Promotion rule

Keep the PR in draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M92 files, and no review thread remains unresolved.

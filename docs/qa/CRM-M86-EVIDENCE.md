# CRM M86 — Follow-ups authenticated HTTP/Node composition

## Scope

M86 composes the merged M84 Follow-ups boundary and M85 MySQL persistence with the platform Auth/Node runtime already used by the other CRM domains.

## Included

- authenticated `GET /api/crm/follow-ups` with optional lead filter;
- authenticated `POST /api/crm/follow-ups` create;
- authenticated `GET /api/crm/follow-ups/pending`;
- authenticated `GET /api/crm/follow-ups/settings`;
- authenticated `PUT /api/crm/follow-ups/settings`;
- authenticated `POST /api/crm/follow-ups/:id/sent`;
- authenticated `POST /api/crm/follow-ups/:id/responded`;
- shared platform session, Origin and CSRF enforcement through the existing CRM Auth bridge;
- MySQL Follow-ups repository and durable audit composition;
- deterministic HTTP status mapping including read-only role and invalid transition;
- focused transport coverage.

## Deliberately deferred

- scheduler/cron execution;
- AI-assisted follow-up message generation;
- WhatsApp delivery integration;
- CRM browser Follow-ups/settings UI;
- historical V1 migration.

## Security

M86 does not duplicate cookie/session/Origin/CSRF logic. Mutation security remains delegated to platform Auth before the Follow-ups boundary executes. Viewer mutation denials remain audited by the CRM boundary.

## Promotion rule

Keep the PR draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M86 files and no review thread remains unresolved.

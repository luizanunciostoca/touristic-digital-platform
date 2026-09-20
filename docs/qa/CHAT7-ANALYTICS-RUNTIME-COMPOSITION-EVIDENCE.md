# Chat 7 — Analytics Runtime Composition Evidence

## Scope

This wave composes the durable Analytics service into the Morro Digital runtime host without enabling production credentials.

## Feature contract

`ANALYTICS_FEATURE_ENABLED` is explicit:

- empty / `false`: feature disabled, runtime readiness passes with `analytics-disabled`;
- `true`: durable Analytics becomes a critical configured dependency;
- any other value: startup for the capability fails closed and readiness reports unavailable.

When enabled, `ANALYTICS_DATABASE_URL` is mandatory.

`ANALYTICS_RETENTION_DAYS` defaults to 90 and is bounded to 1–365 days.

## HTTP host protection

Before the domain transport receives an event, the host enforces:

- exact endpoint only;
- POST only;
- same-origin Origin/Host/protocol check;
- `application/json` only;
- 16 KiB body limit;
- strict UTF-8/JSON parsing;
- bounded per-network-subject fixed-window rate limiting;
- no-store responses.

The network subject is used only in the in-memory rate limiter and is not persisted in the Analytics event table.

## Readiness

Disabled Analytics does not block readiness.

Enabled Analytics reports critical readiness failure when configuration, schema or persistence initialization fails.

The process may remain alive so `/readyz` can expose the real failure rather than hiding it behind a crash loop.

## Retention

Startup applies the Analytics schema and immediately purges expired rows.

A non-blocking hourly timer repeats retention purge using the server clock.

Shutdown clears the timer and closes the MySQL pool.

## Authority

Analytics remains append-only product telemetry.

This runtime does not mutate Commerce, Ticketing, Financial, CMS or user state as a consequence of an Analytics event.

## Production boundary

This PR does not populate `ANALYTICS_DATABASE_URL` or enable the feature in production.

Infrastructure/Chat 8 must provision the isolated database, secret, monitoring and deployment evidence before production Analytics can be marked ready.

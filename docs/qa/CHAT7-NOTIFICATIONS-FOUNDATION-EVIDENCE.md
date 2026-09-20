# Chat 7 — Notifications Foundation Evidence

## Scope

This change materializes the provider-neutral Notifications domain foundation defined by the Domain Map and CAP-0025.

It does not invent an email, push or SMS vendor and does not claim production delivery.

## Canonical notification intents

The package owns these initial notification templates:

- ticket confirmation;
- reservation reminder;
- tour reminder;
- payment issue;
- cancellation;
- refund.

Supported delivery channel contracts are email, push and SMS.

## Privacy boundary

The domain request carries an opaque `recipientReference`, not an email address or phone number. Direct delivery addresses therefore remain outside the portable domain contract and must be resolved by an authorized provider-side integration.

Template variables are flat primitives only. Nested objects are rejected.

Direct sensitive delivery keys such as email, phone, CPF, card, token, secret and password are rejected by the portable domain contract.

## Preference boundary

Preferences are evaluated before idempotency is claimed or a provider is called. An opted-out notification is suppressed and no provider delivery occurs.

## Idempotency

Every request has an explicit idempotency key.

The dispatcher claims that key before provider delivery. A duplicate claim produces no send. When all eligible providers fail, or no provider exists for the requested channel, the claim is released so a later retry can proceed.

A production persistence adapter must make the claim atomic across replicas before this capability can be considered production-ready.

## Provider fallback

Providers are ordered. Only providers declaring support for the requested channel are attempted. A failed provider falls through to the next eligible provider.

A successful provider must return a non-empty provider message identifier.

## Non-goals

This foundation does not yet include:

- provider credentials;
- production email/SMS/push adapters;
- Push API subscription storage;
- durable idempotency persistence;
- queue/outbox workers;
- retry backoff/dead-letter queues;
- template rendering/localization storage;
- notification admin UI.

Those remain separate integration and production-readiness items.

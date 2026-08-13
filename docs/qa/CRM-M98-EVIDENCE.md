# CRM M98 — Trial notification provider idempotency capability evidence

## Objective

Prevent a future concrete notification adapter from being wired into the CRM trial-expiry host while silently ignoring the stable idempotency key introduced by M97.

## Capability contract

`CrmTrialNotificationDeliveryPort` may declare the capability:

`stable-key-provider-deduplication`

The production composition root validates that capability before constructing the notification processor.

`createCrmTrialNotificationHost()` fails closed when the delivery adapter does not declare the capability and accepts adapters that explicitly declare it.

## Architectural boundary

The check belongs to the host/composition boundary rather than the domain processor. This keeps domain behavior independently testable while preventing an unsafe external adapter from being connected in production.

The declaration means the adapter is responsible for forwarding M97's stable `idempotencyKey` to a provider-native deduplication mechanism or an equivalent provider-side guarantee.

## Deliberately not included

M98 does not select WhatsApp, email, SMS, Instagram, push or any vendor. It does not add provider credentials, SDKs, schemas, HTTP routes or UI.

A future concrete provider adapter remains a separate milestone and must satisfy this capability before the host will accept it.

## Regression evidence

- composition fails before wiring a delivery adapter without the capability;
- composition accepts an adapter declaring stable-key provider deduplication;
- existing overlap-safe host execution remains unchanged;
- M95 claim recovery, M96 heartbeat and M97 stable-key behavior remain owned by their existing layers.

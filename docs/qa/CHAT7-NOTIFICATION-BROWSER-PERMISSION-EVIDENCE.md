# Chat 7 — Browser Notification Permission Evidence

## Scope

This wave adds an explicit browser-permission boundary for Push notifications on top of the Notifications foundation.

## Fail-closed behavior

Push delivery requires both:

1. product/topic/channel preference allowed by the existing `NotificationPreferencePort`;
2. browser permission already equal to `granted`.

The following browser states suppress Push:

- `default`;
- `denied`;
- `unsupported`.

Email and SMS remain governed by the product preference port and are not coupled to browser Notification permission.

## No permission prompt on bootstrap

The adapter separates:

- `current()` — passive permission read;
- `request()` — explicit permission request.

No code in this wave calls `request()` automatically.

A UI may only invoke it from an explicit user action, preserving browser permission UX and avoiding unsolicited prompts.

## Provider boundary

This wave does not create:

- Web Push subscription persistence;
- VAPID keys;
- APNs/FCM credentials;
- push provider integration;
- background push handling.

It only closes the browser permission/opt-in boundary required before any future Push adapter is permitted to send.

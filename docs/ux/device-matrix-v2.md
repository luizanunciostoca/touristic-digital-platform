# UX Design V2 Device Matrix

The permanent Home responsive browser gate now retains its deep V1 checks on mobile, tablet and desktop and adds a fast live-runtime geometry sweep across the UX Design V2 matrix.

## Canonical widths

320, 360, 375, 390, 393, 412, 430, 768, 820, 1024, 1280, 1366, 1440 and 1920 px.

Relevant landscape cases are also exercised for compact mobile, large mobile and tablet layouts.

## Runtime checks

At every matrix point the test verifies:

- no horizontal document overflow;
- visible Weather, Global View, Assistant composer and its controls stay inside the viewport;
- Assistant composer controls retain at least 44 × 44 px targets;
- browser support for `svh` and `dvh` used by the V2 foundations;
- no page errors during resize transitions.

A compact 390 × 520 viewport with the Assistant input focused is also used as a deterministic keyboard-like viewport contraction check. This does not claim to emulate a physical Android keyboard; physical Android remains a separate acceptance gate.

The evidence is appended to the existing `v1-home-responsive-evidence` artifact so responsive certification stays traceable in one browser gate.

## Safe-area containment

The persistent Assistant composer is the canonical Assistant entry surface. Its fixed positioning and safe-area paddings keep the composer and text/voice/settings controls inside compact and desktop viewports; the retired floating trigger is not part of the UX V2 matrix. The responsive browser matrix treats any visible control escaping the viewport as a regression.

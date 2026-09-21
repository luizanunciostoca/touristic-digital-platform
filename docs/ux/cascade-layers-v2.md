# Cascade Layers V2

Morro Digital has one declared V2 cascade order:

`reset → vendor → legacy → tokens → base → components → features → utilities → overrides`.

Premium UX owns the declaration and keeps its reusable V2 rules inside named layers.

## Intentional compatibility boundary

A single unlayered compatibility bridge remains in `premium-ux-v2.css`. This is a **formal exception**, not an implicit hybrid styling path.

It exists because `public/legacy/**` is immutable audit evidence and contains legacy declarations, including `!important`, that cannot be safely re-layered without changing the frozen V1 cascade contract. Moving those bytes into a CSS layer would reverse important-layer precedence and could make the V2 bridge unable to neutralize legacy behavior.

The bridge is therefore intentionally unlayered, explicitly documented and covered by source tests. No new feature styling may be added to it unless the rule is required solely to neutralize frozen legacy behavior.

## Deterministic runtime order

Home, Commerce and Ticketing load Premium UX immediately before Design System V2, with Design System V2 as the final stylesheet. This order is contract-tested.

## Closure criterion

Cascade Layers is considered closed under the UX manual's allowance for a formally accepted intentional difference: the layered V2 architecture is canonical, while the one audited unlayered bridge is a temporary interoperability boundary until the frozen legacy runtime is fully retired.

# UX V2 foundation visual authority — 2026-09-22

This report records the foundation/cascade state after the visual-authority wave.
It does not certify surface redesign work owned by Home, Place, Navigation, Tour,
Assistant, Commerce, or Ticketing waves.

## Authority model

The public Tourist UI now loads CSS in the following authority sequence:

1. vendor styles;
2. frozen/transitional V1 compatibility (`styles.css` + legacy bundle);
3. canonical Design System V2 tokens and shared foundations;
4. feature consumers;
5. explicit V2 feature/bridge styles and shell.

Design System V2 canonical brand, accent, typography, semantic state, spacing,
motion, safe-area and layer tokens no longer inherit `--primary`, `--accent`
or `--font-sans` from `styles.css`.

## Surface authority inventory

| Surface | State | Foundation evidence | Residual bridge / owner request |
| --- | --- | --- | --- |
| Home | HYBRID | V2 tokens/shell are loaded before consumers | Home wave must retire remaining `styles.css`/legacy geometry after visual parity |
| Place | HYBRID | V2 foundation + premium mode available | Place wave owns final sheet/card migration and legacy override removal |
| Explore | HYBRID | semantic tokens enforced; no new hex/font-stack authority | Explore wave owns existing `!important` bridge retirement |
| Navigation | HYBRID | semantic layer contract available; Stylelint guards new arbitrary z-index | Navigation wave owns remaining legacy/banner overrides |
| Tour | HYBRID | V2 foundation and shell active | Tour wave owns residual V1 visibility/geometry bridges |
| Assistant | HYBRID | Assistant V2 consumes V2 tokens; no new local palette/font stack | Assistant wave owns remaining legacy modal/composer override retirement |
| Commerce | V2_AUTHORITY | feature CSS is semantic-token based and strict Stylelint consumer | Keep runtime visual regression green while dependent surfaces migrate |
| Ticketing | V2_AUTHORITY | isolated page loads V2 foundation first; feature CSS uses V2 primitives/tokens | Keep ticketing visual/accessibility workflow green |

No surface is classified as `LEGACY_AUTHORITY` after this foundation change;
the shared Tourist runtime remains intentionally hybrid until the surface waves
remove their documented compatibility bridges.

## Residual legacy bridges

- `public/styles.css` remains a transitional compatibility stylesheet and is
  intentionally outside strict V2 linting.
- `public/legacy/**` remains frozen evidence and was not modified.
- `public/v1-*.css`, business transitional CSS and privacy preferences remain
  explicit Stylelint allowlist entries until their owning waves certify removal.
- Existing `!important` declarations in premium/explore/navigation/assistant/shell
  remain migration debt. New local palettes, font stacks, `transition: all` and
  large arbitrary z-index values are prevented in migrated consumers.

## Surface requests

Surface waves should consume semantic V2 tokens/primitives, then remove only the
bridge they supersede after exact-head functional, visual and accessibility
evidence. Do not mass-normalize legacy CSS and do not edit `public/legacy/**`.

FOUNDATION_CONTRACT_READY is YES when the exact-head Quality Gate and applicable
V2 visual workflows pass for this PR.

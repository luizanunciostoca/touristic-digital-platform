# Unified Contextual Assistant Dock

## Authority

The public Morro Digital map shell composes Assistant message, composer and the five-action bottom navigation as one persistent lower-surface experience.

Canonical DOM authority:

- `#unified-assistant-dock`
- `#assistant-messages.md-assistant-message-region`
- `#assistant-category-rail.md-assistant-category-rail`
- `#assistant-input-area.md-assistant-composer`
- `#home-bottom-navigation.md-home-bottom-nav`

## Geometry contract

The dock is the only fixed-position owner for the composition. Its children participate in normal flow in this order: grabber → bounded Assistant message → horizontal category rail → composer → primary navigation.

Standard Assistant text is bounded by `--md-unified-dock-message-max-height` and scrolls internally. Long text must not increase the message region beyond that cap or displace the composer/navigation off-screen.

Rich Assistant content such as option sets and photo carousels uses the separately bounded `--md-unified-dock-rich-max-height`. This keeps rich interaction usable without reverting to the former full-height grow-upward modal.

Send and Voice remain persistently reachable. Input focus may add focus state but must not control action visibility.

## Runtime insets

A `ResizeObserver` measures the rendered dock and publishes:

- `--md-unified-dock-height`
- `--md-unified-dock-map-inset`

Map controls, loading states, onboarding surfaces and Explore camera framing consume those values so map content is not hidden behind the dock.

## Accessibility

- interactive targets remain at least 44x44 CSS px;
- input font size remains at least 16px on mobile;
- Assistant message output remains `aria-live="polite"`;
- the persistent message preview is a region, not a modal dialog;
- RTL, forced-colors and reduced-motion remain supported;
- virtual keyboard resizing must keep the dock/input visible.

## Regression acceptance

The change is accepted only when browser evidence proves:

1. one dock contains message, composer and navigation;
2. Send and Voice are visible before input focus;
3. standard long text stays within the bounded message height and scrolls internally;
4. composer and navigation remain visible during long responses;
5. the dock remains inside all canonical mobile viewports;
6. keyboard resize does not cover the focused input;
7. Explore camera framing uses dock-aware bottom padding;
8. existing Assistant menu, voice, photo, Tour, Place, Navigation and Onboarding flows retain semantic authority.

## Horizontal category rail

The category rail is a first-class internal region of the dock, not a floating card. It exposes the canonical Assistant category values:

`beaches`, `restaurants`, `hotels`, `shops`, `transport`, `attractions`, `tours`, `nightlife`, `emergencies`, `help`.

Each chip publishes `data-assistant-category="<slug>"` and dispatches the existing `morro:assistant-option-selected` event. Business/category routing therefore remains owned by the existing Assistant runtime.

The rail uses one horizontal row with `overflow-x:auto`, touch panning, hidden visual scrollbar, proximity scroll snap and a clipped continuation at the inline edge. RTL reverses the inline reading/scroll direction without changing canonical category values.

The legacy external Discover category rail is hidden whenever `data-md-unified-dock="true"` so categories are not duplicated visually.

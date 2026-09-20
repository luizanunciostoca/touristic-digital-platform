# Assistant Modal V2

## Runtime composition

Assistant V2 keeps the established Morro Digital conversational behavior while modernizing the shell around it:

- `app-shell.ts` owns semantic structure for the non-blocking dialog, conversation region, option group and composer.
- `assistant-shell-ui.ts` owns visibility, Escape handling, focus entry/return and accessible busy state.
- `assistant-ui-state.ts` owns the semantic `idle | loading | success | error` state event and localized screen-reader status copy.
- `browser-assistant-runtime.ts` publishes real request lifecycle state around every input source.
- `assistant-v2.css` owns the post-legacy token-driven presentation.

The assistant remains intentionally non-modal (`aria-modal="false"`) because the map and destination context remain usable while the assistant is open. Focus is moved into the composer on explicit open and restored to the previous trigger on close; keyboard users are not trapped away from the map.

## Accessibility

- dialog label and described status;
- live conversation region;
- grouped options;
- 44 px shared controls;
- Escape closes outside the onboarding tutorial and restores focus;
- loading uses `aria-busy` plus localized live status;
- voice pressed state remains explicit;
- forced colors and reduced motion have dedicated contracts.

## Legacy boundary

Frozen V1 assistant CSS remains migration evidence. Assistant V2 loads after the checkpoint. The one `!important` declaration in the V2 stylesheet is a documented transitional z-layer neutralizer for the frozen legacy stacking declaration and uses the canonical `--md-layer-dialog` token rather than a numeric z-index.

## Verification

Permanent unit/source contracts cover shell semantics and state transitions. The Assistant Modal Reading Order browser workflow is extended to validate open focus, dialog semantics, loading state and Escape focus restoration on the real runtime.

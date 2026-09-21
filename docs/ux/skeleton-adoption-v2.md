# Skeleton adoption — UX Design V2

Loading feedback is now shared across the three active tourist commerce/assistant surfaces:

- Ticketing renders Design System `md-skeleton` cards while inventory loads.
- Commerce detail renders `md-skeleton` lines while experience data loads.
- Assistant Modal V2 renders three `md-skeleton` lines while a conversational turn is processing.

The Assistant skeleton is decorative and therefore `aria-hidden="true"`. Screen readers receive the separate localized live-status message and `aria-busy` state from Assistant Modal V2, avoiding duplicate announcements.

The permanent Assistant Modal Reading Order browser gate validates both the live loading announcement and the visual skeleton structure. Existing Ticketing and Commerce contract tests retain their own loading-state coverage.

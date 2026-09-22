# GA4 owner exclusion contract

ToolScout keeps raw GA4 acquisition visible while separating owner traffic from the operational acquisition signal.

## Marker

An authenticated Command Center visit sets `toolscout_owner=1` and `toolscout_owner_since=<timestamp>` on that browser. The marker is analytics classification only and must never be used as authorization.

When analytics consent is granted and the owner marker is present, the GA4 config uses:

- source: `toolscout_owner`
- medium: `internal`
- campaign: `owner_exclusion_v1`

Country, IP address and behavioral heuristics are never used to decide that a GA4 session belongs to the owner.

## Reporting contract

- GA4 total sessions remain visible and unchanged.
- Owner-marked sessions are reported separately.
- `GA4 external sessions` equals GA4 total sessions minus sessions explicitly marked `toolscout_owner / internal`.
- Historical sessions that occurred before the marker cannot be retroactively classified.
- A new browser marker requires a full 24 hour rolling window before the external metric is considered operational.
- During that warm-up period the UI may show non-owner-marked candidate sessions, but they are not a trusted external total.

## Growth learning contract

The machine-readable external acquisition payload exposes `growthSignal.learningAllowed`.

- `false`: owner exclusion is warming up. Do not promote or penalize acquisition channels from GA4 attribution.
- `true`: a full 24 hour owner-marked window is available and `ga4_external_sessions_24h` may be used as an operational acquisition signal.

First-party exact attribution remains separate and may use stricter browser-confirmed evidence. The `toolscout_owner=1` cookie is already recognized by `session-classification.js`, so future first-party events from a marked owner browser are classified as owner/internal rather than business acquisition.

## Multiple devices

Owner marking is browser-specific. Any browser or device used by the owner to browse ToolScout should open the authenticated Command Center once so it receives the marker. Until all regularly used owner browsers are marked, the external metric can still contain unmarked owner traffic.

# ToolScout Funnel Analytics

## Scope and truth model

M01 extends the existing D1 analytics and Command Center; it does not create a parallel analytics service. Funnel activity is **observed** in ToolScout. Conversion and revenue are **verified** only when a vendor evidence row exists in `revenue_ledger`. Missing vendor evidence is **unknown**, never zero and never inferred from clicks.

The reporting window for the Command Center funnel is the latest 30 days, excluding events explicitly marked `internal-test`. Historical `click_events` and `search_events` remain intact, but are not fabricated into funnel events. Consequently the new funnel begins at deployment of migration `0007_funnel_events.sql`.

## Anonymous session semantics

- The browser creates a random UUID; there is no login, fingerprint, raw IP, name, email or advertising identifier.
- A session expires after 30 minutes of inactivity. Browser local storage retains only the UUID and last-seen time; the matching secure, `SameSite=Lax` cookie expires after 30 minutes.
- Navigation and refresh reuse the session while it is active. `sessionStorage` prevents `session_started` from repeating on a refresh in the same tab/session.
- The Worker upserts the existing `sessions` row on every accepted event and outbound redirect. `first_seen_at` is the session start source of truth and `last_seen_at` records activity.
- A direct `/go/*` visit may create a session and outbound event without a preceding `session_started`; this accurately represents an entry directly at the redirect rather than inventing upstream steps.
- Owner activity is stored with `source=internal-test` and `owner_flag=1`. Deterministic header-only curl/wget/healthcheck traffic is not ingested and production redirect smoke checks do not write click/funnel rows.

## Canonical events

| Event | Exact boundary | Optional context |
| --- | --- | --- |
| `session_started` | First page load of a newly generated 30-minute anonymous session | path, source, referrer host |
| `recommendation_started` | Visitor submits a free-text recommendation or opens the guided journey | path, source |
| `recommendation_completed` | The scoring engine has produced a non-empty ranked shortlist | intent, path, source |
| `recommendation_result_viewed` | That shortlist is rendered to the visitor | intent, path, source |
| `tool_viewed` | Reserved for a genuine individual tool-detail view; not emitted by the current recommendation cards | tool, intent, path, source |
| `outbound_clicked` | `/go/<tool>` resolves a valid destination and records the redirect | tool, inferred intent, path, source, referrer host |

Every browser event has a random event ID. `funnel_events.event_id` is the primary key and ingestion uses `INSERT OR IGNORE`, making retries idempotent. Redirect events receive a server-generated event ID.

## Storage and APIs

`POST /api/events` accepts only JSON up to 2 KiB and only the documented fields. Event type, UUID, event ID, slugs, source, path and referrer host are length- and character-validated; unknown fields and malformed JSON are rejected. No arbitrary payload or query text is stored. Cross-origin response permission is granted only to `https://trytoolscout.org`.

`GET /api/stats` remains protected by the existing Cloudflare Access/admin-token rules. The active Worker chain is now:

`revenue-worker.js -> funnel-worker.js -> dynamic-worker.js -> worker.js`

The `funnel` response contains totals, rates, daily rows, and practical intent/tool/source segments. Denominator-zero rates are `null` (shown as Unknown), not a fabricated 0%. Existing legacy totals remain available for continuity, but the Command Center no longer calls distinct click sessions genuine sessions.

## Command Center metrics

The displayed flow is sessions → recommendation starts → completions → result/tool views → outbound clicks → verified conversions → verified revenue. Observed and verified labels are explicit. Completion rate is completions / starts; result-to-outbound CTR is outbound clicks / result plus tool views; session-to-outbound CTR is outbound clicks / genuine sessions.

The outbound numerator is the canonical post-M01 `outbound_clicked` event. Revenue per 1,000 sessions now uses genuine non-owner funnel sessions. This deliberately means historical clicks do not appear in the new funnel and cannot bias its rates.

## Known limitations

- No events are backfilled; pre-M01 funnel stages remain unknowable.
- `tool_viewed` is defined but not emitted because the active recommendation UX renders cards rather than an individual tool-detail view in `app.js`.
- Browser-side telemetry can be blocked by privacy tools or connectivity; product behavior remains unaffected.
- Application-level validation and deterministic smoke exclusion reduce obvious noise but are not a general bot-detection or rate-limiting system.
- Remote D1 migration state and account-side bindings still require verified Cloudflare access before manual infrastructure action.


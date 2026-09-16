# Traffic Integrity

## Canonical human traffic definition

ToolScout's canonical operational human population is D1 activity where the session is classified `likely-human` and the browser has emitted `page_confirmed`.

Unique visitors use the same population. A visitor ID is written to `confirmed_visitor_events` only after the matching session has a D1 `page_confirmed` event and remains classified likely-human. Owner, known-bot, synthetic/test and unknown/legacy sessions are excluded.

GA4 remains a consent-based acquisition and engagement audit. PostHog remains consent-based behavioral telemetry. Google Search Console remains the source of truth for Google Search clicks and impressions. None replaces D1 for the Command Center's operational human traffic count.

## Worker-native observability

`traffic-integrity-worker.js` adds a Cloudflare Worker/D1 heartbeat on the existing hourly cron. `/api/traffic-integrity-health` reports:

- last browser-confirmed likely-human session;
- age of that confirmation;
- browser-confirmed sessions in the last 24 hours;
- last Worker/D1 heartbeat and its age;
- whether traffic is active or simply quiet.

A quiet period is not treated as an ingestion failure while the Worker/D1 heartbeat is fresh. This critical health path does not depend on GitHub Actions.

## Deployment state

Repository implementation added on 2026-09-16 while GitHub Actions Conservation Mode was active. `wrangler.toml` points to `traffic-integrity-worker.js`, and migration `0071_browser_confirmed_visitor_truth.sql` defines the canonical visitor/heartbeat tables.

Do not claim this layer is production-live until a Cloudflare Worker deployment is independently verified and `/api/traffic-integrity-health` returns the new health payload from `trytoolscout.org`.

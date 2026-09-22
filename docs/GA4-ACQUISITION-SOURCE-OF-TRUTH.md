# GA4 Acquisition Source of Truth

Effective: 2026-09-22

## Decision

ToolScout uses two canonical business measurement sources in the Command Center:

1. Google Analytics 4 is canonical for acquisition: sessions, users, session source, medium, channel and landing page.
2. The ToolScout Worker redirect ledger is canonical for outbound commerce: `/go/*` redirects and whether the affiliate route was active at click time.

The D1 Traffic Truth / Browser Guard system remains available as Traffic Quality. It is diagnostic only and must never subtract from, zero, replace or silently override GA4 acquisition sessions.

## Transport architecture

GA4 reporting data is transported into ToolScout through Make.

The canonical acquisition chain is:

`Google Analytics 4 -> Make -> ToolScout GA4 ingestion endpoint -> D1 snapshot -> Command Center`

Make is a transport layer only. It does not redefine the measurement population or replace GA4 as the acquisition source of truth.

The native Make Google Analytics 4 connection handles Google authorization. ToolScout therefore does not require the owner to create or maintain a Google Cloud OAuth client, service account JSON or Google refresh token.

Implementation details are documented in `docs/GA4-MAKE-BRIDGE.md`.

## Why

The previous strict traffic classifier can produce false negatives when GA4 observes a real referral session that does not satisfy ToolScout's positive browser-confirmation rules. That makes it unsuitable as the headline business acquisition metric.

GA4 already provides mature acquisition attribution and reporting semantics. ToolScout should not recreate those semantics with a stricter parallel session classifier.

ToolScout does have first-party evidence that GA4 does not own: the Worker sees the actual `/go/*` redirect. That server event is therefore the commercial source of truth for outbound and monetized outbound.

## Consent boundary

The current public analytics implementation loads GA4 only after analytics consent is granted. As a result, GA4 acquisition is consent dependent and can undercount physical visitors who decline or block analytics.

This limitation must be stated in the Command Center. ToolScout does not inflate GA4 sessions with its own estimated or classified sessions. Canonical means faithful to the GA4 reporting population, not a claim that every physical human visitor is measured.

Server-side `/go/*` redirect counts do not depend on the GA4 browser tag. Owner traffic marked `internal-test` is excluded from the business redirect totals. Monetized outbound is determined from the immutable `affiliate_active_at_click` state recorded at redirect time.

## Runtime implementation

`command-center-make-ga4-worker.js` sits immediately below `d1-read-budget-worker.js` in the production Worker chain.

For `/analytics/api/stats` it:

- calls the existing Command Center stats implementation;
- reads the latest accepted GA4 snapshot delivered by Make;
- marks the snapshot stale after 135 minutes;
- maps GA4 sessions into the existing headline traffic compatibility fields only when the snapshot is fresh;
- preserves ToolScout server redirect totals for outbound and monetized outbound;
- keeps Traffic Quality diagnostic only;
- never promotes Traffic Quality as a fallback if GA4 is unavailable.

The Make ingestion endpoint is:

`POST /api/ga4/make-snapshot`

It requires a dedicated bearer token generated from the protected setup page:

`/analytics/make-setup`

Only the SHA-256 hash of that token is stored in D1.

## Failure semantics

If no fresh GA4 snapshot has been delivered by Make, acquisition is `unavailable`. The Command Center must not present D1 strict-human sessions as a replacement headline number.

If the D1 redirect ledger cannot be read or verified, outbound and monetized outbound are `unavailable`. GA4 browser outbound events must not replace the first-party redirect ledger.

Traffic Quality can continue to flag bots, synthetic traffic, browser confirmation gaps and anomalies. Those findings remain diagnostic evidence rather than acquisition totals.

## Deprecated Google authorization paths

The ToolScout-owned OAuth and service-account approaches are no longer the normal integration path.

The old ToolScout Google connect and callback routes return HTTP 410 and direct the owner to `/analytics/make-setup`.

Historical migration `0081_google_analytics_oauth.sql` may remain in the repository because migrations are append-only operational history. Its presence does not make OAuth an active source of truth.

## Closed-loop attribution exception

Distribution and Growth Engine experiments may continue to use stricter D1 browser-confirmed sessions when the question is exact action attribution, such as proving that a specific tracked distribution action produced a browser-confirmed visit. Those metrics must be labelled attributed or browser-confirmed and must not be presented as ToolScout's total acquisition traffic.

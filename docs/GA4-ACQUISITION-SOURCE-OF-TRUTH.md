# GA4 Acquisition Source of Truth

Effective: 2026-09-22

## Decision

ToolScout uses two canonical business measurement sources in the Command Center:

1. Google Analytics 4 Data API is canonical for acquisition: sessions, users, session source, medium, channel and landing page.
2. The ToolScout Worker redirect ledger is canonical for outbound commerce: `/go/*` redirects and whether the affiliate route was active at click time.

The D1 Traffic Truth / Browser Guard system remains available as Traffic Quality. It is diagnostic only and must never subtract from, zero, replace or silently override GA4 acquisition sessions.

## Why

The previous strict traffic classifier can produce false negatives when GA4 observes a real referral session that does not satisfy ToolScout's positive browser-confirmation rules. That makes it unsuitable as the headline business acquisition metric.

GA4 already provides mature acquisition attribution and reporting semantics. ToolScout should not recreate those semantics with a stricter parallel session classifier.

ToolScout does have first-party evidence that GA4 does not own: the Worker sees the actual `/go/*` redirect. That server event is therefore the commercial source of truth for outbound and monetized outbound.

## Consent boundary

The current public analytics implementation loads GA4 only after analytics consent is granted. As a result, GA4 acquisition is consent dependent and can undercount physical visitors who decline or block analytics.

This limitation must be stated in the Command Center. ToolScout does not inflate GA4 sessions with its own estimated or classified sessions. Canonical means faithful to the GA4 reporting population, not a claim that every physical human visitor is measured.

Server-side `/go/*` redirect counts do not depend on the GA4 browser tag. Owner traffic marked `internal-test` is excluded from the business redirect totals. Monetized outbound is determined from the immutable `affiliate_active_at_click` state recorded at redirect time.

## Runtime implementation

`command-center-ga4-worker.js` sits immediately below `d1-read-budget-worker.js` in the production Worker chain.

For `/analytics/api/stats` it:

- calls the existing Command Center stats implementation;
- obtains a Google OAuth access token from a GA4 service account;
- resolves the Analytics property from `GA4_PROPERTY_ID` or, when possible, discovers it from the ToolScout measurement ID;
- queries the GA4 Data API for today, rolling 24-hour, month-to-date and acquisition-source reporting;
- queries D1 `click_events` for non-owner `/go/*` redirects and click-time affiliate state;
- returns `acquisition`, `commerceTruth` and `trafficQuality` objects;
- maps legacy headline traffic fields to GA4 only when GA4 is connected;
- never promotes Traffic Quality as a fallback if GA4 is unavailable.

The Command Center page is decorated with an `Acquisition & Outbound Truth` card and the North Star card is rewritten to use GA4 sessions plus server-side outbound metrics.

## Worker configuration

Preferred secret:

- `GA4_SERVICE_ACCOUNT_JSON`: complete Google service account JSON with Analytics read access.

Alternative split secrets:

- `GA4_CLIENT_EMAIL`
- `GA4_PRIVATE_KEY`

Optional configuration:

- `GA4_PROPERTY_ID`: numeric GA4 property ID. Recommended because it avoids Admin API discovery.
- `GA4_MEASUREMENT_ID`: defaults to ToolScout's public measurement ID `G-9VR80SYYH7`.

The service account must have read access to the ToolScout GA4 property. The Google Analytics Data API must be enabled for its Google Cloud project. If property auto-discovery is used, Analytics Admin API access must also be available.

## Failure semantics

If GA4 cannot be queried, acquisition is `unavailable`. The Command Center must not present D1 strict-human sessions as a replacement headline number.

If the D1 redirect ledger cannot be queried, outbound and monetized outbound are `unavailable`. GA4 browser outbound events must not replace the first-party redirect ledger.

Traffic Quality can continue to flag bots, synthetic traffic, browser confirmation gaps and anomalies. Those findings remain diagnostic evidence rather than acquisition totals.

## Closed-loop attribution exception

Distribution and Growth Engine experiments may continue to use stricter D1 browser-confirmed sessions when the question is exact action attribution, such as proving that a specific tracked distribution action produced a browser-confirmed visit. Those metrics must be labelled attributed or browser-confirmed and must not be presented as ToolScout's total acquisition traffic.

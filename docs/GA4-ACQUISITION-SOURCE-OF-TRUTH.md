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
- prefers the owner's stored Google OAuth connection for GA4 access;
- keeps the service account implementation only as a technical fallback;
- resolves the Analytics property from a stored property ID, `GA4_PROPERTY_ID`, or the ToolScout measurement ID through the Google Analytics Admin API;
- queries the GA4 Data API for today, rolling 24-hour, month-to-date and acquisition-source reporting;
- queries D1 `click_events` for non-owner `/go/*` redirects and click-time affiliate state;
- returns `acquisition`, `commerceTruth` and `trafficQuality` objects;
- maps legacy headline traffic fields to GA4 only when GA4 is connected;
- never promotes Traffic Quality as a fallback if GA4 is unavailable.

The Command Center page contains an `Acquisition & Outbound Truth` card and the North Star card uses GA4 sessions plus server-side outbound metrics.

## Owner OAuth connection

The normal owner flow is mobile friendly:

1. Open the protected Command Center.
2. Tap `Connect Google Analytics`.
3. Sign in to Google and approve read-only Analytics access.
4. Google returns to `/api/google-analytics/callback`.
5. ToolScout validates OAuth state, PKCE and the Google account identity.
6. The refresh token is encrypted before it is stored in D1.
7. Future Command Center reads refresh the Google access token without another owner interaction.

The callback accepts only the owner Google account `pcaiano@gmail.com`. The refresh token is never sent to the browser after the callback and is never stored in repository files.

OAuth connection state is stored in `google_oauth_connections`, created by migration `0081_google_analytics_oauth.sql`.

## One-time Worker configuration

Required secrets for the OAuth app:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

The OAuth web client must authorize this exact redirect URI:

`https://trytoolscout.org/api/google-analytics/callback`

Optional configuration:

- `OAUTH_TOKEN_ENCRYPTION_KEY`: dedicated secret used to encrypt the stored refresh token. When absent, the Worker derives the encryption key from the existing `ADMIN_TOKEN` secret.
- `GA4_PROPERTY_ID`: numeric GA4 property ID. If absent, ToolScout attempts discovery through the Analytics Admin API.
- `GA4_MEASUREMENT_ID`: defaults to `G-9VR80SYYH7`.
- `GOOGLE_OAUTH_REDIRECT_URI`: defaults to the production callback above and should not normally be changed.

The Google Cloud project used by the OAuth client must have the Google Analytics Data API enabled. If property discovery is required, the Google Analytics Admin API must also be enabled. The OAuth app requests only `openid`, `email` and `analytics.readonly`.

## OAuth security contract

The connection flow uses a short-lived encrypted state cookie and PKCE. The callback is routed outside the protected `/analytics` path so Google can return to it, but it cannot establish a connection unless the encrypted state is valid and the Google account is the ToolScout owner.

The refresh token is encrypted with AES-GCM before D1 storage. Disconnect attempts to revoke the Google token and always removes the local OAuth connection. The disconnect endpoint remains owner protected and same-origin checked.

## Service account fallback

The earlier service account path remains supported only as a fallback through:

- `GA4_SERVICE_ACCOUNT_JSON`, or
- `GA4_CLIENT_EMAIL` plus `GA4_PRIVATE_KEY`.

The normal owner experience should not require a service account JSON file.

## Failure semantics

If GA4 cannot be queried, acquisition is `unavailable`. The Command Center must not present D1 strict-human sessions as a replacement headline number.

If the OAuth app has not been configured, the Command Center states that one-time setup is required. If the app is configured but the owner has not connected Google Analytics, the card shows `Connect Google Analytics`.

If the stored Google token is revoked or refresh fails, the connection remains visible as needing attention rather than silently falling back to Traffic Quality.

If the D1 redirect ledger cannot be queried, outbound and monetized outbound are `unavailable`. GA4 browser outbound events must not replace the first-party redirect ledger.

Traffic Quality can continue to flag bots, synthetic traffic, browser confirmation gaps and anomalies. Those findings remain diagnostic evidence rather than acquisition totals.

## Closed-loop attribution exception

Distribution and Growth Engine experiments may continue to use stricter D1 browser-confirmed sessions when the question is exact action attribution, such as proving that a specific tracked distribution action produced a browser-confirmed visit. Those metrics must be labelled attributed or browser-confirmed and must not be presented as ToolScout's total acquisition traffic.

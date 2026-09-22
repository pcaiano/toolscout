# GA4 Make Bridge

Effective: 2026-09-22

## Purpose

ToolScout uses Google Analytics 4 as the acquisition source of truth while avoiding a ToolScout-owned Google OAuth application.

Make is the transport layer only. Google Analytics remains the measurement source. ToolScout remains the source of truth for server-side outbound and monetized outbound redirects.

## Owner setup

Open:

`https://trytoolscout.org/analytics/make-setup`

The page is protected by the same owner access used by the Command Center.

Tap `Generate token`. The plaintext token is returned once. ToolScout stores only its SHA-256 hash in D1. Generating another token invalidates the previous one.

The ingestion endpoint is:

`https://trytoolscout.org/api/ga4/make-snapshot`

## Make scenario

Recommended schedule: once per hour.

Use the native Google Analytics 4 app in Make. Connect it with the Google account that owns the ToolScout GA4 property. Make handles the Google authorization.

Minimum useful scenario:

1. Scheduler, hourly.
2. Google Analytics 4 `Generate a Report` for today.
3. Google Analytics 4 `Generate a Report` for month to date.
4. HTTP `Make a request` to the ToolScout ingestion endpoint.

A third GA4 report for source, medium, channel and landing page can be added to populate the acquisition source rows.

For the HTTP request:

- Method: `POST`
- URL: `https://trytoolscout.org/api/ga4/make-snapshot`
- Authentication: API key or bearer token stored in Make credentials, using `Authorization: Bearer <bridge token>`
- Body type: `application/json`

## Payload contract

The endpoint accepts this normalized shape:

```json
{
  "propertyId": "123456789",
  "measurementId": "G-9VR80SYYH7",
  "timeZone": "Europe/Lisbon",
  "observedAt": "2026-09-22T12:00:00Z",
  "sessions": {
    "today": 12,
    "last24Hours": 18,
    "monthToDate": 315
  },
  "users": {
    "today": 10,
    "activeToday": 8,
    "monthToDate": 270
  },
  "sources": [
    {
      "source": "reddit.com",
      "medium": "referral",
      "channel": "Referral",
      "landingPage": "/tools/example",
      "sessions": 4
    }
  ]
}
```

`dailyAverageMTD` and `projectedMonth` are optional. ToolScout calculates them from month-to-date sessions when they are omitted.

`last24Hours` is optional during initial setup. When absent, ToolScout temporarily uses today's GA4 sessions for that field. The scenario should supply a true rolling 24-hour figure when the hourly report step is added.

`sources` is optional during initial setup. When absent, the headline GA4 acquisition numbers still work but the source rows remain empty.

The endpoint also accepts flat aliases such as `sessionsToday`, `sessions24h`, `sessionsMTD`, `usersToday`, `activeUsersToday` and `usersMTD`.

## Freshness and failure behavior

A snapshot is considered fresh for 135 minutes. This allows one missed hourly execution without immediately replacing the business view with stale data.

If no fresh Make snapshot exists, GA4 acquisition is shown as unavailable. Traffic Quality is not promoted as a substitute.

The Command Center continues to use the ToolScout Worker redirect ledger for outbound and monetized outbound counts.

## Security

The Make token can only submit GA4 snapshots to the dedicated ingestion route. It does not grant access to the Command Center, GitHub, Cloudflare, Google Analytics or any other ToolScout mutation route.

Only the token hash is stored in D1. The plaintext token exists only in the one-time generation response and inside the Make credential store.

The owner can rotate the token at any time by generating a new one from the protected setup page.

## Deprecated path

The ToolScout-owned Google OAuth routes are deprecated. The Worker returns HTTP 410 for the old connect and callback routes and directs the owner to `/analytics/make-setup`.

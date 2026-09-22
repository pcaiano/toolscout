# Google Analytics OAuth Setup

Effective: 2026-09-22

This is the one-time setup required for the ToolScout Command Center `Connect Google Analytics` button.

## Google Cloud

1. Use a Google Cloud project controlled by the ToolScout owner.
2. Enable Google Analytics Data API.
3. Enable Google Analytics Admin API if ToolScout should auto-discover the GA4 property from measurement ID `G-9VR80SYYH7`.
4. Configure Google Auth Platform for an external application.
5. Create an OAuth 2.0 client with application type `Web application`.
6. Add this exact authorized redirect URI:

`https://trytoolscout.org/api/google-analytics/callback`

7. The app requests only:

- `openid`
- `email`
- `https://www.googleapis.com/auth/analytics.readonly`

## Publishing status

For durable operation, do not leave the OAuth application in Google `Testing` status. Follow Google's current publishing and verification requirements for the configured app and scope.

## Cloudflare Worker secrets

Store these as secrets on Worker `toolscout`:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Optional:

- `GA4_PROPERTY_ID`: numeric GA4 property ID. Supplying it avoids Analytics Admin API property discovery.
- `OAUTH_TOKEN_ENCRYPTION_KEY`: dedicated secret for refresh-token encryption. If absent, ToolScout derives the key from the existing `ADMIN_TOKEN` secret.

Do not put the OAuth client secret in GitHub, D1 plaintext, logs or chat.

## First connection

After the Worker deploy is live:

1. Open the protected ToolScout Command Center.
2. Tap `Connect Google Analytics`.
3. Sign in with the ToolScout owner Google account.
4. Approve read-only Google Analytics access.
5. Google returns to ToolScout.
6. ToolScout validates OAuth state, PKCE and owner identity.
7. ToolScout encrypts the refresh token before storing it in D1.
8. The Command Center refreshes and uses GA4 as the acquisition source of truth.

The Google account accepted by the callback is restricted to the ToolScout owner. A different Google account is rejected.

## Disconnect

The Command Center exposes `Disconnect Google Analytics`. Disconnect attempts to revoke the Google token and deletes the local encrypted connection record.

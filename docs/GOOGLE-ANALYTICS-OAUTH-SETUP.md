# Google Analytics OAuth Setup

Effective: 2026-09-22

This is the one-time setup required for the ToolScout Command Center `Connect Google Analytics` button.

## Google Cloud

1. Use a Google Cloud project controlled by the ToolScout owner.
2. Enable Google Analytics Data API.
3. Enable Google Analytics Admin API if ToolScout should auto-discover the GA4 property from measurement ID `G-9VR80SYYH7`.
4. Configure the Google OAuth consent screen for the ToolScout owner.
5. Create an OAuth 2.0 client with application type `Web application`.
6. Add this exact authorized redirect URI:

`https://trytoolscout.org/api/google-analytics/callback`

7. The app requests only:

- `openid`
- `email`
- `https://www.googleapis.com/auth/analytics.readonly`

## Publishing status

Do not leave the OAuth application in Google `Testing` status for normal ToolScout operation. Google documents that refresh tokens issued while an OAuth consent screen is in Testing can expire after 7 days for this type of access.

Move the owner-only OAuth app to `In production` before treating the connection as durable. Follow any Google verification requirements shown for the configured scope and application status. Do not bypass an unverified-app warning or verification requirement.

## Cloudflare Worker secrets

Store these as secrets on Worker `toolscout`:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Optional dedicated encryption secret:

- `OAUTH_TOKEN_ENCRYPTION_KEY`

When `OAUTH_TOKEN_ENCRYPTION_KEY` is absent, ToolScout derives its AES-GCM token encryption key from the existing `ADMIN_TOKEN` secret.

Do not store the OAuth client secret in GitHub, D1 plaintext, public environment variables, logs or chat.

## First connection

After the Worker deploy and migration `0081_google_analytics_oauth.sql` are live:

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

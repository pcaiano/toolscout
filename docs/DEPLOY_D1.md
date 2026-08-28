# ToolScout: D1 deployment

## One-time Cloudflare setup

1. Install Wrangler and authenticate with Cloudflare.
2. Create the D1 database named `toolscout`.
3. Copy its database ID into `wrangler.toml`.
4. Apply migrations with `wrangler d1 migrations apply toolscout --remote`.
5. Deploy the Worker with `wrangler deploy`.

## What is automatic afterwards

- `POST /api/click` stores anonymous click events.
- `GET /api/stats` exposes aggregate tool/intent counts for the future dashboard.
- A daily Cron Trigger deletes click events older than 180 days.

No names, emails, IP addresses, or advertising identifiers are stored by this Worker.

The Free plan is sufficient for the MVP, subject to Cloudflare's current limits. D1 migrations remain version-controlled in `migrations/`.

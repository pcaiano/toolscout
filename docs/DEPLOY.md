# ToolScout deployment

## 1. Create D1

```bash
npx wrangler d1 create toolscout-db
```

Copy the returned `database_id` into `wrangler.toml` under the `DB` binding.

## 2. Apply migrations

```bash
npx wrangler d1 migrations apply toolscout-db --remote
```

## 3. Create the private dashboard token

```bash
npx wrangler secret put ADMIN_TOKEN
```

Use a long random value. Never commit it to Git.

## 4. Deploy

Primary local method:

```bash
npx wrangler deploy
```

### Make Cloudflare deployment workaround

When direct Cloudflare access is unavailable from ChatGPT, use the Make Cloudflare connection as the operational fallback.

Verified ToolScout target:

- Cloudflare account ID: `16054933850d8af4ba498b772cbe2de9`
- Worker script: `toolscout`
- Make connection: `Pedro Caiano's (pcaiano@gmail.com) Cloudflare credentials - MCP`
- Read and verification scenario: `ToolScout Cloudflare Worker Status` (scenario `7424413`)
- Deployment scenario: `ToolScout Cloudflare Deploy Version` (scenario `7465964`)

Safe sequence:

1. Run `ToolScout Cloudflare Worker Status` to read the current deployments and Worker versions.
2. Confirm the intended version ID belongs to Worker `toolscout`.
3. Run `ToolScout Cloudflare Deploy Version` with that `version_id`.
4. Require HTTP 200 and `success: true` from Cloudflare.
5. Verify the affected public URL with a fresh uncached fetch.

The deployment scenario uses the Cloudflare API endpoint `POST /v4/accounts/16054933850d8af4ba498b772cbe2de9/workers/scripts/toolscout/deployments` and assigns 100 percent of traffic to the supplied version.

Important: this scenario deploys an existing Cloudflare Worker version. It does not upload new source code or static assets by itself. If the intended repository change has not yet produced a Cloudflare Worker version, upload/build that version first, normally with Wrangler, then use the Make deployment scenario.

The Make workaround was verified successfully on 17 September 2026. Cloudflare returned HTTP 200 and created deployment `5475eab6-9d86-4e6b-aa24-23cb1fa39f0e` for version `19985b56-fb08-49c6-a0ed-cfacbc244cc0`.

## 5. Verify

Open `/api/health`. The private analytics page is `/admin.html` and prompts for the `ADMIN_TOKEN`.

For public content changes, also fetch the exact changed URL without cache and confirm the expected content or CTA is present.

## Affiliate activation

Affiliate URLs live in `data/affiliate.json`. Keep entries disabled until the corresponding affiliate programme has approved the account and the URL has been verified. Then set `enabled` to `true` and the approved URL.

## Free-tier guardrails

The MVP is intentionally designed for Workers Free + D1 Free. Current Cloudflare limits are 100,000 Worker requests/day, 5 million D1 rows read/day, 100,000 rows written/day and 5 GB total D1 storage. If the project reaches those limits, the next step is optimisation or the $5/month Workers Paid plan, not an automatic spend.

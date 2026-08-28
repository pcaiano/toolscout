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

```bash
npx wrangler deploy
```

## 5. Verify

Open `/api/health`. The private analytics page is `/admin.html` and prompts for the `ADMIN_TOKEN`.

## Affiliate activation

Affiliate URLs live in `data/affiliate.json`. Keep entries disabled until the corresponding affiliate programme has approved the account and the URL has been verified. Then set `enabled` to `true` and the approved URL.

## Free-tier guardrails

The MVP is intentionally designed for Workers Free + D1 Free. Current Cloudflare limits are 100,000 Worker requests/day, 5 million D1 rows read/day, 100,000 rows written/day and 5 GB total D1 storage. If the project reaches those limits, the next step is optimisation or the $5/month Workers Paid plan—not an automatic spend.

# ToolScout Launch Checklist

## Cloudflare

- Create one D1 database named `toolscout`.
- Apply migrations in order.
- Set `ADMIN_TOKEN` as a Worker secret.
- Replace `database_id` in the local Wrangler configuration.
- Deploy the Worker and static assets.
- Verify `/api/health`.
- Verify `/api/stats` returns 401 without the token.

## Monetization

- Apply to selected official affiliate programs.
- Only enable an affiliate entry after approval and after verifying its tracking URL.
- Test `/go/<tool>` before sending traffic.
- Never rank a tool because its commission is higher.

## SEO

- Submit the sitemap in Google Search Console.
- Publish only approved SEO candidates.
- Each page must contain original comparison/recommendation value.
- Avoid keyword-swapped doorway pages.

## Analytics

- Test a search event.
- Test a click event.
- Confirm D1 receives both events.
- Check dashboard totals.

## Cost guardrail

Do not upgrade Cloudflare until measured traffic or database usage actually requires it.

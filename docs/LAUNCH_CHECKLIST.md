# ToolScout Launch Checklist

## Zero-cost target

- Workers Free: 100,000 requests/day.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage.
- Do not upgrade until measured traffic or usage requires it.

## Cloudflare

- Create one D1 database named `toolscout`.
- Apply migrations in order.
- Set `ADMIN_TOKEN` as a Worker secret.
- Replace `database_id` in the local Wrangler configuration.
- Deploy the Worker and static assets.
- Verify `/api/health`.
- Verify `/api/stats` returns 401 without the token.
- Verify authenticated `/api/stats` returns aggregate data.

## Monetization

- Apply to selected official affiliate programs.
- Only enable an affiliate entry after approval and after verifying its tracking URL.
- Test `/go/<tool>` before sending traffic.
- Never rank a tool because its commission is higher.

## SEO

- Submit the sitemap in Google Search Console.
- Publish only approved SEO candidates.
- Each page must contain original comparison/recommendation value.
- Avoid keyword-swapped doorway pages and scaled low-value content.

## Analytics

- Test a search event.
- Test a click event.
- Confirm D1 receives both events.
- Check dashboard totals.
- Keep analytics anonymous: no names, emails, IP addresses, or advertising IDs.
- Retain event data for 180 days unless a shorter period is preferable.

## Pre-launch acceptance

- Recommendation engine returns deterministic results.
- Guided questionnaire works on desktop and mobile.
- Affiliate redirects remain disabled until real approval/tracking URLs exist.
- Daily Cron can clean old analytics and update SEO opportunities.

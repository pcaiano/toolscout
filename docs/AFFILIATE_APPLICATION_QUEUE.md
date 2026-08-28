# Affiliate Application Queue

Updated 2026-08-28.

## Priority 1 — Apply first

### HubSpot
- Official affiliate program: https://www.hubspot.com/partners/affiliates
- Published commission: 30% recurring for up to 1 year at Starter tier; higher tiers can have additional/custom rewards.
- Published cookie window: 180 days.
- Fit: CRM, small business, marketing automation.
- Status: `apply`

### Semrush
- Official affiliate program: https://www.semrush.com/lp/affiliate-program/en/
- Published commission: varies by product; current page advertises up to $300 per sale at base tiers and up to $450 for Semrush One at Platinum, plus $10 for eligible trials.
- Published cookie window: 120 days.
- Fit: SEO, search visibility, AI visibility, marketing.
- Status: `apply`

## Priority 2 — Verify before activation

### Pipedrive
- Official affiliate page should be checked immediately before application.
- Fit: CRM and sales.
- Status: `verify`

### Zapier
- Official affiliate page should be checked immediately before application.
- Fit: automation/integrations.
- Status: `verify`

### Typeform
- Official affiliate/partner terms should be checked immediately before application.
- Fit: forms and lead capture.
- Status: `verify`

## Rules

1. Never invent an affiliate URL.
2. Never enable an affiliate redirect until the account is approved and the exact tracking URL is available.
3. Commission must not influence the recommendation score.
4. Add a clear affiliate disclosure to monetized pages.
5. Respect each program's promotional restrictions.
6. Prefer recurring or high-value SaaS economics when product fit is equal.

## First revenue experiment

Apply to HubSpot and Semrush first. Once approved, activate only those exact affiliate URLs in `data/affiliate.json`, test `/go/<slug>`, and then publish the first high-intent comparison pages.
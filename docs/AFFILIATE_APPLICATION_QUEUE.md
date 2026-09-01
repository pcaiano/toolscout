# Affiliate Application Queue

Updated 2026-09-01.

## Immediate revenue queue

### Make
- Official programme: https://www.make.com/en/affiliate
- Application/account route: https://make.com/user/affiliate
- Published economics: 35% commission for 12 months.
- ToolScout fit: automation, workflow, productivity and small-business CRM clusters.
- Verified blocker: the application route redirects to Make sign-in in the available browser session.
- Exact next action: Pedro signs in to the existing Make account, opens `/user/affiliate`, reviews the publisher declarations and submits them. Record the exact approved tracking URL only after it is issued.
- Status: `login_required_not_applied`

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
- Application route: https://app.impact.com/campaign-campaign-info-v2/Semrush.brand
- Current official base economics observed 2026-09-01: 120-day cookie; $10 for eligible trials; $200 per SEO Toolkit sale and $300 per Semrush One sale, with other products and higher loyalty tiers varying.
- ToolScout fit: Semrush is already the first catalogue match for competitor SEO, SEO for agencies and keyword research pages.
- Verified blocker: the route opens Impact's Semrush publisher signup and requires account/publisher declarations.
- Exact next action: Pedro signs in to Impact, completes the Semrush publisher profile for `https://trytoolscout.org/`, and submits. Record the exact approved tracking URL only after acceptance.
- Status: `impact_signup_required_not_applied`

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

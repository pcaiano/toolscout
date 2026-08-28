# Automated tool health checks

The Worker can periodically check configured tool URLs and record only aggregate health information.

## Checks

- HTTP availability
- response status
- checked timestamp
- optional redirect target

## Guardrails

- Do not crawl private pages.
- Do not bypass robots or access controls.
- Do not scrape pricing pages automatically until a source-specific parser is implemented and permitted.
- A failed health check must not automatically remove a tool from recommendations.
- Affiliate URLs are not health-checked until the affiliate program is active.

## Next implementation

Add a D1 `tool_health` table and a daily scheduled check for the small catalogue. If a tool fails repeatedly, surface it in the admin dashboard for review instead of silently changing rankings.

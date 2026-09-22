# ToolScout Google Search Console

## Current integration

Google Search Console is the authoritative source for ToolScout Google Search visibility metrics such as impressions, clicks, CTR, landing pages, queries and average position.

ToolScout authenticates to the Search Console API with a service account stored outside the repository and uses the read only scope:

`https://www.googleapis.com/auth/webmasters.readonly`

The configured property is:

`sc-domain:trytoolscout.org`

Credentials must never be committed to Git.

## Automated collection

The scheduled workflow `.github/workflows/gsc-search-reality.yml` collects first party Search Console evidence daily and can also be run manually.

The main collector is:

`scripts/sync-gsc-signals.mjs`

It writes:

- `reports/gsc-search-reality.json`
- `data/gsc-search-reality.json`
- `reports/gsc-signals.json`

This dataset supplies the Command Center Google Search Reality card, Search and Growth Brain opportunity evidence, country and device summaries, URL Inspection health and sitemap status.

The daily trend collector is:

`scripts/sync-gsc-daily-trend.mjs`

It writes:

- `reports/gsc-daily-trend.json`
- `data/gsc-daily-trend.json`

The default trend window is 28 days. The daily series contains:

- impressions
- clicks
- CTR
- average position
- search visible pages

Search visible pages means distinct ToolScout pages returned by Search Analytics for that date. It must not be presented as the total number of URLs indexed by Google.

Average position is nullable on days with no impressions. A missing position must never be converted to zero. Lower average position values indicate stronger average ranking.

## Command Center presentation

The protected Command Center Google Search Reality card includes a daily temporal chart sourced from `data/gsc-daily-trend.json`.

The chart shows five aligned trend lanes over the same date axis:

1. Impressions
2. Clicks
3. CTR
4. Average position
5. Search visible pages

Each metric uses its own vertical scale because the units and magnitudes are not directly comparable. Average position is visually inverted so an improvement in ranking moves upward while the displayed raw value remains the Search Console value.

The chart is implemented by `gsc-command-center-trend-worker.js`, an outer decorator around the existing closed loop Worker chain. It enriches the protected stats payload and decorates the canonical Command Center response. It does not replace or rebuild the canonical Command Center composition owned by `growth-command-center-v2-worker.js`.

## Search Console reality semantics

Search Analytics and URL Inspection answer different questions.

Search Analytics reports observed Google Search performance. It is authoritative for impressions, clicks, CTR, queries, pages and average position, but Google does not guarantee that every possible row is returned.

URL Inspection reports Google's indexed view of inspected URLs. It is not a live indexability test. ToolScout keeps URL Inspection coverage, indexed status, discovery issues, canonical mismatches and related technical evidence separate from Search Analytics performance.

The sitemap API reports submitted sitemap state. Sitemap counts must not be treated as equivalent to a complete Google index count.

## Quality and freshness rules

- The scheduled GSC workflow validates that both the search reality dataset and daily trend dataset are fresh and use the read only scope.
- The daily trend must contain at least seven valid observations before the workflow can commit it.
- The normal Command Center trend window is 28 days.
- Empty Search Analytics days retain zero impressions, zero clicks and zero CTR, but average position is `null`.
- Search visible pages are a visibility indicator only, not an index coverage metric.
- Missing GSC evidence must be shown as unavailable or awaiting refresh, never fabricated from another analytics system.

## Legacy CSV importer

`scripts/import-gsc-signals.mjs` may remain available for historical or diagnostic CSV imports, but it is no longer the primary production ingestion path.

Do not describe ToolScout as dependent on manual Search Console CSV exports while the authenticated read only API workflow is healthy.

## Operational checks

When diagnosing Google Search performance, distinguish these questions:

1. Is the Search Console API collection fresh and healthy?
2. Are impressions, clicks, CTR and average position changing over time?
3. How many ToolScout pages are appearing in Search Analytics?
4. What does URL Inspection say about canonical sitemap URLs?
5. Are sitemap submission and download states healthy?
6. Are Search opportunities reaching the Growth Brain execution loop?

The Command Center should make these signals readable without requiring the owner to interpret raw JSON or manually export Search Console data.

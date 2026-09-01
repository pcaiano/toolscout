# ToolScout Google Search Console

## What this integration does

Google Search Console (GSC) and ToolScout's internal growth intelligence are separate systems.

- GSC property verification, sitemap submission, crawling and indexing happen in Google.
- ToolScout does not currently authenticate to the Google Search Console API.
- ToolScout's `reports/growth-priority.json` can optionally consume page-performance signals imported from a GSC Pages CSV export.

Therefore, `gsc.available: false` in a ToolScout report must never be interpreted as "the site is not verified/indexed in Google". It means only that no matching GSC performance dataset has been imported into the repository.

## Current ingestion path

1. In Google Search Console, open the `trytoolscout.org` property.
2. Open Performance / Search results.
3. Use the Pages dimension.
4. Export the table as CSV with columns for Page, Clicks, Impressions, CTR and Position.
5. Run:

```bash
node scripts/import-gsc-signals.mjs <gsc-pages.csv>
```

6. This creates `reports/gsc-signals.json`.
7. Run:

```bash
node scripts/build-growth-priority.mjs
```

8. `reports/growth-priority.json` will then report `gsc.ingestionStatus: "signals-imported"` when matching `best-*` intent pages contain GSC observations.

## Status semantics

`gsc.available` means "usable imported GSC intent signals exist".

`gsc.ingestionStatus` can be:

- `signals-imported` — imported GSC data is actively influencing growth prioritization;
- `imported-no-matching-intents` — a GSC dataset exists but does not contain matching ToolScout `best-*` intent pages;
- `not-imported` — no `reports/gsc-signals.json` exists yet.

None of these fields are authoritative for Google's verification/indexing status. Search Console itself is authoritative for that.

## Automation decision

Do not spend Work/Codex credits merely to import GSC data. The current CSV ingestion is sufficient for early-stage growth and keeps Google credentials out of the repository.

A future direct Search Console API integration is justified only when repeated manual exports become a material operating burden. That implementation would require a dedicated Google credential path, least-privilege access, secret storage outside Git, scheduled ingestion, and explicit property validation for `trytoolscout.org`.

## Operational rule

Before claiming GSC integration is broken, distinguish these three questions:

1. Is the Google property verified and is the sitemap accepted? — answer in Search Console.
2. Is Google generating impressions/clicks? — answer in Search Console Performance.
3. Has that performance data been imported into ToolScout growth intelligence? — answer from `reports/gsc-signals.json` and `gsc.ingestionStatus`.

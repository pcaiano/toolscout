# GSC slug audit

The SEO pipeline classifies every observed Google Search Console `best-*` slug as:

- `canonical`: present in `data/intents.json`.
- `redirected`: present in `data/seo-consolidations.json` and therefore intentionally consolidated to a canonical guide.
- `orphan`: observed by GSC but not represented by either source.

The audit writes `reports/gsc-slug-audit.json` after Search Console sync. Orphans generate a workflow warning rather than a hard failure so historical Google URLs do not block generation. An orphan should be reviewed before adding a redirect because some historical slugs do not have a clear canonical destination.

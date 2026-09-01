# Google Search Console acquisition input

Current verified state (2026-09-01): the signed-in owner account has properties for the earlier GitHub Pages and Worker URLs, but not for the canonical `trytoolscout.org` domain. No canonical-domain query, impression or click data is currently available.

## Minimal owner action

1. In Search Console choose **Add property** and add the URL-prefix property `https://trytoolscout.org/`.
2. Use the offered HTML verification file (preferred for the existing repository workflow) and place it at the repository root; deploy through the normal ToolScout workflow, then press **Verify**.
3. Submit `https://trytoolscout.org/sitemap.xml` in **Sitemaps**.
4. After data appears, open **Performance → Search results → Pages**, export CSV, and run:

   `node scripts/import-gsc-signals.mjs <exported-pages.csv>`

5. Run `node scripts/build-growth-priority.mjs` and review `reports/growth-priority.json`.

The importer accepts only canonical `best-*.html` pages. It stores aggregate page metrics, not account credentials or query-level personal data. Observed GSC pages are ranked ahead of heuristic-only opportunities; the remaining heuristic score still represents commercial fit and monetization readiness.

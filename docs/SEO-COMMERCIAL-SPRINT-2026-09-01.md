# Commercial SEO Traffic Sprint — 2026-09-01

## Scope and guardrails

This sprint is limited to qualified organic discovery, commercial internal linking, and indexability. It does not change recommendation scores, editorial ranking, affiliate configuration, distribution state, BEARING, or any non-ToolScout infrastructure.

Startup reconciliation confirmed a clean `main` at `310abeb` (`Classify analytics sessions conservatively`), equal to `origin/main`. Production health, robots, sitemap, homepage, and a representative commercial guide returned HTTP 200 before implementation.

## Commercial pages audited and improved

- 38 catalog-backed intent guides: retained their approved intent set and factual catalog copy; added direct links from every ranked tool card to its static tool profile while preserving `/go/<slug>` as the tracked commercial CTA.
- 15 comparison pages: moved their pair registry to `data/comparisons.json`; changed both product-profile links on every comparison from query-string pages to crawlable static profiles. Existing guide links, canonicals, OG metadata, disclosure, and non-paid-ranking language remain intact.
- 100 catalog-backed tool profiles: created under `/tools/<slug>.html`, using only verified catalog fields. Each has a unique title, description, canonical, H1, OG metadata, WebPage/SoftwareApplication, BreadcrumbList and FAQ schema, best-for context, capabilities, pricing wording, relevant guide/comparison links when supported, and a tracked `/go/<slug>` CTA.
- Tool directory and interactive compare surface: now link to static profiles rather than `/tool.html?tool=<slug>`.
- 43 blog pages: audited through the existing generation/validation pipeline; no speculative or distribution-led content was added in this sprint.

No new intent, alternatives, comparison, or use-case page was added without a distinct approved catalog-backed input. The 38 intent pages and 15 comparison pages remain the canonical commercial set.

## Internal linking

The commercial crawl graph now supports:

`Guide -> Tool profile -> relevant Guide / Comparison -> Tool profile -> /go/<slug>`

The directory provides an inbound path to every tool profile. Guides link to the three ranked profiles shown on the page. Comparisons link to both compared profiles. Profiles link back only to comparisons containing that tool and guides where the tool is within the editorial model's top five. Affiliate status is not read by this linking/ranking logic.

## Sitemap and indexability

- `robots.txt` continues to allow crawling and declares `https://trytoolscout.org/sitemap.xml`.
- Sitemap expanded from 107 to 207 URLs by adding exactly 100 static tool profiles.
- Private/admin/query-string/duplicate surfaces remain excluded by the existing sitemap policy.
- Every generated profile has a self-referencing canonical and `index,follow`.
- `scripts/validate-commercial-indexability.mjs` validates profile existence, canonical, H1, Breadcrumb and FAQ schema, tracked CTA, sitemap membership, guide-to-profile links, comparison-to-profile links, and removal of query-string profile links from the public directory/compare surface.
- GitHub Pages and SEO generation workflows now generate the same profiles and run the commercial-indexability validator before publishing.

No Google submission or indexing claim was made. The existing verification file remains untouched; Search Console account-side state still requires credentialed verification.

## Validation and production acceptance

Before deployment, run the complete generation chain, data/intent/SEO/public-surface/commercial-indexability/hostname validators, Node tests, commercial surface smoke, health checks, and production smoke. After pushing `main`, verify the ToolScout Worker deploy and both public smoke surfaces before marking this sprint live.

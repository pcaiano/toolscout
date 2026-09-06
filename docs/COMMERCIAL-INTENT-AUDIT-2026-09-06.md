# ToolScout Commercial Intent Audit — 2026-09-06

## Scope

Audit of the current repository against `docs/COMMERCIAL-INTENT-STRATEGY.md`, focused on redesign, SEO, AEO, GEO, comparison architecture, tool profiles, long-tail intent, and commercial measurement.

This audit is repository-backed. It does not claim Search Console performance, conversion rates, or live vendor facts that were not verified in this pass.

## Executive finding

ToolScout already has much of the structural foundation required for a commercial-intent growth model:

- 100 crawlable tool profiles are part of the current production baseline;
- 38 base intent guides are defined in `data/intents.json`;
- 16 additional long-tail intent seeds are defined in `data/seo-longtail.json`;
- 15 explicit comparison pairs are defined in `data/comparisons.json`;
- guide, comparison, tool-profile, sitemap, validation, blog, and distribution generators already exist;
- affiliate payout is explicitly excluded from ranking logic;
- canonical funnel and Revenue Intelligence already provide a base for commercial measurement.

The main gap is therefore not "build SEO" or "add comparisons". The opportunity is to evolve existing surfaces from catalog/scoring pages into a deeper decision architecture that models persona, job-to-be-done, constraints, candidates, trade-offs, and recommendation context.

## Already aligned

### 1. Intent-led pages

`data/intents.json` already contains commercial categories and jobs such as CRM for real estate, CRM for consultants, CRM for sales teams, CRM with automation, affordable CRM, lead-capture forms, sales prospecting, cold email, AI research, AI coding and other practical software decisions.

The current SEO generator:

- generates deterministic recommendations from catalog scores and intent weights;
- exposes pricing/free-plan evidence from the catalog;
- links to tool profiles and tracked outbound routes;
- includes canonical URLs, metadata, visible affiliate disclosure and SoftwareApplication ItemList structured data;
- cross-links related guides.

### 2. Long-tail/persona foundation

`data/seo-longtail.json` already includes seeds such as:

- best CRM for independent consultants;
- best CRM for property agents;
- best CRM for small sales teams;
- best affordable CRM with automation;
- best lead-capture forms for real estate;
- best workflow automation for agencies.

This is directionally correct for the new strategy.

### 3. Comparison surfaces

`data/comparisons.json` defines 15 head-to-head pairs including Make vs Zapier, HubSpot vs Pipedrive, beehiiv vs Kit, Jotform vs Typeform, Semrush vs Ahrefs, Notion vs ClickUp and Webflow vs Framer.

The comparison generator already:

- presents both products symmetrically;
- exposes best-fit bullets, pricing and capabilities;
- identifies relative score strengths;
- links into related buying guides;
- states there is no paid winner;
- routes outbound clicks through canonical `/go/<slug>` tracking;
- emits Article structured data about both SoftwareApplication entities.

### 4. Tool profiles

Tool profiles already expose best-for, features, pricing, free-plan state, related buying guides, related comparisons, verification recency and tracked outbound routing. They emit WebPage, SoftwareApplication, BreadcrumbList and FAQ structured data.

### 5. SEO/AEO/GEO technical surface

The SEO workflow already treats the public surface as a generated system rather than isolated pages. It includes intent coverage validation, Search Console signal sync, growth-priority generation, guide generation, comparison generation, tool-profile generation, cross-link enrichment, blog/distribution generation, sitemap generation, public-surface validation, commercial indexability checks, `robots.txt`, and `llms.txt`.

This means the right next step is refinement of semantics and decision usefulness, not a parallel replacement SEO stack.

## Pipeline finding

The 2026-09-06 failed SEO workflow was not an SEO-generation failure. Intent validation, GSC sync, growth-priority generation, all guide/comparison/tool-profile generation steps, sitemap generation and SEO validation succeeded. The run failed only at public-surface validation because the Gorgias affiliate link format was not recognized as verified tracking.

That format was subsequently added to `scripts/validate-public-surface.mjs` in commit `f1cfcc85163f3e0280024bd4c5c85fecdda32f8d`, after which the automated SEO refresh proceeded again. Issue #11 was therefore closed as completed.

## Gaps and priorities

### P1 — Introduce explicit decision-context data

Current intents mostly encode title, description, category, weights and keywords. Long-tail seeds often inherit the parent scoring model without adding meaningful constraints.

The pilot now adds a backward-compatible decision-context layer in `data/decision-context.json` with:

- `persona`;
- `jobToBeDone`;
- `constraints`;
- `decisionQuestions`;
- `comparisonPairs` for explicit contextual graph edges.

This data is deliberately separate from ranking weights. Affiliate economics remain outside editorial scoring.

### P1 — Upgrade guide content from ranked list to decision aid

PR #10 now includes `scripts/enrich-decision-context.mjs`, which enriches selected existing guide URLs after normal SEO generation. The pilot adds visible sections explaining who the guide is for, the job-to-be-done, relevant constraints, and questions to answer before choosing.

Initial pilot intents:

- CRM for real estate;
- CRM for consultants;
- forms for small business;
- lead-capture forms;
- sales prospecting;
- email marketing.

This preserves the current generator and URLs while testing deeper decision semantics safely.

### P1 — Make comparisons context-sensitive

PR #10 now also includes `scripts/enrich-comparison-context.mjs`. It connects existing A-vs-B pages to decision contexts already represented by ToolScout without generating new indexable variants.

Initial graph edges include:

- `hubspot-vs-pipedrive` ← CRM for real estate and CRM for consultants;
- `jotform-vs-typeform` ← forms for small business and lead capture;
- `tally-vs-typeform` ← forms for small business and lead capture;
- `apollo-vs-lemlist` ← sales prospecting;
- `beehiiv-vs-kit` ← email marketing;
- `brevo-vs-mailchimp` ← email marketing;
- `activecampaign-vs-mailchimp` ← email marketing.

The enrichment adds a visible “When this comparison matters” section with persona, workflow constraints, decision questions and a link back to the relevant buying guide. It does not alter scoring, affiliate routing, comparison slugs or canonical URLs.

### P1 — Strengthen graph relationships

The pilot introduces manually curated semantic edges via `comparisonPairs`. This is preferable to immediately replacing current related-content logic because it is auditable, reversible and avoids accidental semantic overreach.

If the pilot proves useful, the next implementation should generalize graph selection using explicit persona/job/constraint relationships while retaining manual overrides where needed.

### P2 — Expand long-tail only from validated decision families

Expand in controlled batches based on one or more of:

- Search Console impressions/queries;
- likely-human internal search behavior;
- outbound/recommendation behavior;
- observed competitor gaps;
- known commercial software decisions.

A candidate page should have a clear distinct decision. Do not generate page permutations only to increase URL count.

### P2 — Upgrade structured data conservatively

Potential improvements include consistent BreadcrumbList on guides/comparisons, clearer WebPage/Article `about` relationships, `dateModified` where trustworthy, and Organization/WebSite entity consistency. Do not add Review/AggregateRating without genuine review evidence.

### P2 — Commercial-intent analytics segmentation

Revenue Intelligence already has page/intent/tool rankings and monetization coverage. Extend reporting when technically justified to distinguish page families and decision context, including tool profiles, generic intent guides, persona/workflow guides, comparisons, and future alternatives pages.

### P2 — Alternatives as a first-class relationship

The current graph has comparisons and related guides, but no clearly audited first-class `alternatives` data model in this pass. Introduce explicit alternatives only after checking overlap and canonicalization. The goal is useful substitutability, not one alternatives page per tool by default.

### P3 — Redesign integration

The approved V5 minimalist redesign should become the visual expression of this decision system:

- homepage asks for the problem before showing inventory;
- results explain why tools fit;
- tool pages expose decision-relevant context progressively;
- comparisons foreground the practical choice rather than feature-table density;
- related intents/comparisons remain discoverable without turning the UI into a directory wall;
- commercial CTAs stay visually clear but never dominate editorial reasoning.

## Immediate next validation

Before merging or scaling the pilot:

1. run the SEO workflow against the branch/PR or equivalent validation path;
2. confirm the enrichment scripts are idempotent and execute after the corresponding generators;
3. verify all contextual comparison targets exist in `data/comparisons.json`;
4. confirm generated guide/comparison pages still pass canonical, disclosure and commercial-indexability validators;
5. inspect representative generated HTML for layout/semantic regressions;
6. merge only after the generated surface remains clean.

## Non-goals

- Do not inflate catalog/page count for its own sake.
- Do not rank by affiliate payout.
- Do not generate fake reviews, test results or statistics.
- Do not create thousands of thin persona/tool permutations.
- Do not replace the existing production SEO stack with a second parallel architecture.
- Do not let redesign reintroduce homepage clutter merely to expose more SEO inventory.

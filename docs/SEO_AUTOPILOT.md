# SEO Opportunity Autopilot

## Goal

Turn observed search intent into a small queue of high-value SEO opportunities without automatically publishing low-value pages.

## Rules

- Never generate pages just to multiply URLs.
- Only consider an intent after repeated observed searches or a manually curated seed.
- Require a useful page concept: comparison, buyer guide, calculator, directory view, or decision workflow.
- Keep pages in `candidate` state until reviewed.
- Do not create doorway pages or near-duplicate pages.
- Affiliate relationships must be disclosed.

## Candidate scoring

`opportunity_score = demand_score + commercial_score + catalog_score - duplication_penalty`

Signals:

- demand: number of unique anonymous sessions searching the intent
- commercial: whether the intent maps to an active or plausible affiliate category
- catalog: whether ToolScout can provide at least 3 genuinely useful recommendations
- duplication penalty: similarity to an existing indexed intent page

## Publishing workflow

1. Daily Cron aggregates search events.
2. Candidate intents are written to `seo_opportunities`.
3. Candidates with enough evidence are marked `review`.
4. A human approves a candidate.
5. A page template is populated from structured tool data plus original editorial guidance.
6. Sitemap is updated.
7. Performance is measured through search and click analytics.

## Why manual approval remains

Google's current spam policies warn against scaled content abuse and doorway pages. Automation should discover opportunities and maintain data; it should not blindly publish thousands of thin pages.

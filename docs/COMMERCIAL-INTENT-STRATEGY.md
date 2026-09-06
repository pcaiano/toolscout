# ToolScout Commercial Intent Strategy

## Status

Adopted strategic direction: 2026-09-06.

This document is a decision framework for redesign, SEO, AEO, GEO, content generation, catalog growth, affiliate prioritization, analytics, and future monetization. It complements `AGENTS.md`, `docs/PRODUCTION-BASELINE.md`, and `docs/COMMAND-CENTER.md`. It does not override project-isolation or production-safety rules.

## Product model

ToolScout should evolve from an affiliate directory into:

`Discovery Engine -> Decision Engine -> Commerce Layer`

The primary value is not catalog size or raw pageviews. It is helping a user make a high-quality software decision and, where appropriate, continuing that decision into a measurable outbound click and affiliate conversion.

### Discovery

Answer: what tools exist for this need?

### Decision

Answer: which tool is best for this user, job, constraints, and alternatives?

### Commerce

Provide a transparent path to try or buy the selected tool, using affiliate monetization when available without allowing affiliate economics to affect editorial ranking.

## Commercial Intent Graph

Each worthwhile catalog entity should be able to participate in a graph of genuinely useful decision surfaces:

`tool profile -> alternatives -> A vs B -> category/best-of -> job-to-be-done/use case -> persona/workflow -> pricing/free/constraints -> recommendation`

Do not generate combinations merely because they are technically possible. A page must correspond to a plausible human decision and add information beyond a thin template.

## Core recommendation/content model

Use this structure where applicable:

`Persona -> Job-to-be-done -> Constraints -> Candidates -> Comparison -> Recommendation`

Constraints can include budget, team size, existing stack, required integrations, skill level, deployment preference, free-plan requirement, or another decision-relevant limitation supported by evidence.

Prefer specific commercial long-tail decisions over generic list queries. For example, a narrowly useful decision such as choosing a meeting transcription tool for a five-person agency can be more valuable than another generic list of AI tools.

## SEO + AEO + GEO

Treat SEO, AEO, and GEO as one evidence architecture with different discovery surfaces.

### SEO

- Target specific decision and comparison intent.
- Build strong internal links across the Commercial Intent Graph.
- Preserve canonicalization, crawlability, sitemaps, and useful metadata.
- Prioritize quality and maintained information over indiscriminate page count.
- Refresh software facts that can become stale, especially pricing, features, availability, and program status.

### AEO

Pages should answer the decision directly before expanding into supporting detail. Use clear headings, concise answer passages, structured comparisons, explicit trade-offs, and useful FAQs only where genuine questions exist.

### GEO

Make claims attributable and easy for AI systems to interpret: clear entities, explicit relationships, evidence-backed facts, dates/recency where relevant, structured comparisons, transparent methodology, and consistent terminology. Do not manufacture statistics, reviews, tests, or first-hand experience.

Structured data must describe visible page content accurately; it is not a mechanism for claiming unsupported authority.

## Redesign implications

The approved minimalist V5 direction remains authoritative. The redesign should support decision-making rather than become a dense directory.

- Keep the homepage selective and calm rather than displaying a large inventory by default.
- Make the primary interaction about describing a need and reaching a recommendation.
- Surface comparison, alternatives, workflows, and use cases progressively.
- Preserve substantial negative space and strong hierarchy.
- Avoid affiliate-led visual bias in editorial recommendations.
- Tool detail and comparison surfaces should make trade-offs, best-fit use cases, constraints, and the next decision obvious.

## Affiliate economics

Affiliate coverage should follow demonstrated or plausible commercial demand rather than program availability alone.

Use a prioritization concept such as:

`expected affiliate value ~ qualified click demand x conversion probability x commission economics x recurrence x retention`

This is a prioritization framework, not a forecast unless each input is supported by evidence.

A high headline commission is not automatically superior to a lower recurring commission with stronger conversion or retention. Affiliate economics must never be used in the editorial ranking function.

## Analytics and KPIs

Continue the canonical funnel and add commercial-intent analysis when technically justified and evidence is available.

Priority business measures include:

- genuine/likely-human sessions;
- recommendation completions;
- outbound clicks;
- affiliate-covered outbound clicks;
- outbound CTR by page type;
- revenue per 1,000 genuine human sessions;
- revenue per outbound click;
- revenue per landing page;
- revenue per query/intent family;
- conversion and revenue evidence by affiliate/vendor where available.

Do not fabricate revenue attribution where vendor evidence does not exist.

## Catalog and content expansion

Catalog expansion is valuable when it increases useful decision coverage. Do not use total tool count as the primary growth objective.

When deciding between adding many undifferentiated tools and deepening commercially relevant decision surfaces around existing tools, prefer the latter when evidence suggests buyer intent.

Test persona/workflow verticals in controlled batches and scale based on measured impressions, qualified sessions, recommendation behavior, outbound clicks, and conversion/revenue evidence. Real estate, consultants, recruiters, marketers, and solo founders are candidate test personas, not permanent priorities until data validates them.

## Distribution

SEO is an acquisition engine, not the whole distribution strategy. Continue building owned and referral distribution through the Content Engine, social profiles, launch/listing platforms, newsletter/YouTube when justified, and other measurable channels. Evaluate channels by qualified traffic and downstream commercial behavior rather than follower count alone.

## Long-term monetization

Affiliate revenue is the initial commerce layer, not necessarily the final business model. Once audience and evidence justify it, possible extensions include:

1. sponsored visibility that is clearly disclosed and never corrupts editorial rankings;
2. newsletter/content sponsorship;
3. qualified vendor lead generation;
4. ToolScout-owned products only when observed user demand supports building them.

Do not prematurely build these layers before traffic, decision quality, and measurement justify them.

## Decision rules

Before approving a redesign, SEO, AEO, GEO, catalog, content, or monetization change, ask:

1. Does this help a real user discover or make a software decision?
2. What commercial or informational intent does it serve?
3. Is the page/feature materially useful rather than programmatic filler?
4. Is its evidence accurate, attributable, and maintainable?
5. Does it strengthen the Discovery -> Decision -> Commerce journey?
6. Can its impact be measured without confusing bots, owner activity, or legacy traffic with genuine demand?
7. Does monetization remain separate from editorial ranking?

If the answer to these questions is weak, do not scale the pattern merely to increase page or catalog counts.

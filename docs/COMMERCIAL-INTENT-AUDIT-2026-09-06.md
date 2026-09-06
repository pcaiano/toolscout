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

The SEO workflow already treats the public surface as a generated system rather than isolated pages. It includes:

- intent coverage validation;
- Search Console signal sync step;
- growth-priority generation;
- guide generation;
- comparison generation;
- tool-profile generation;
- cross-link enrichment;
- blog/distribution generation;
- sitemap generation;
- multiple indexability/public-surface validation steps;
- `robots.txt` and `llms.txt` in the workflow inputs/outputs.

This means the right next step is refinement of semantics and decision usefulness, not a parallel replacement SEO stack.

## Gaps and priorities

### P0 — Fix/verify the SEO generation pipeline before expanding it

The workflow is the production path for intents, comparisons, tool profiles, blog/distribution assets and sitemap. A failing generation workflow blocks every downstream improvement. Treat current SEO workflow health as a prerequisite for expansion.

Acceptance target:

- generation workflow green on `main`;
- all existing validation steps green;
- generated asset commit/push succeeds or cleanly reports no changes;
- Search Console sync failure, if credentials/signals are unavailable, is explicitly classified rather than confused with page-generation failure.

### P1 — Introduce explicit decision-context data

Current intents mostly encode title, description, category, weights and keywords. Long-tail seeds often inherit the parent scoring model without adding meaningful constraints.

Add a backward-compatible intent context model such as:

- `persona`;
- `jobToBeDone`;
- `constraints` (budget, free-plan requirement, team size, ease, integrations, existing stack, deployment type, etc.);
- `decisionQuestions`;
- optional `candidateSlugs` or eligibility filters only when evidence supports restricting the candidate set.

Do not replace deterministic ranking with affiliate economics.

### P1 — Upgrade guide content from ranked list to decision aid

Current guide pages explain the ranking criteria and show top tools, but they do not yet fully express:

`Persona -> Job -> Constraints -> Candidates -> Trade-offs -> Recommendation`

Add visible sections generated only from structured evidence:

- "Best if..." / "Choose this when...";
- trade-offs / limitations where catalog evidence exists;
- comparison links selected because they are relevant to the current decision;
- who should choose another option;
- concise answer-first summary suitable for search snippets and AI answer systems.

Avoid unsupported "tested by us", performance statistics, review counts or first-hand claims.

### P1 — Make comparisons context-sensitive

Current comparison pages answer a generic A vs B decision. The next layer should connect comparison outcomes to the jobs/constraints represented in the intent graph.

Examples of architecture, not pre-approved claims:

- A vs B for a solo consultant;
- A vs B when a free plan is mandatory;
- A vs B for automation-heavy workflows;
- A vs B for small teams.

Do not create separate indexable pages for every combination. Prefer a single strong comparison page with contextual decision blocks unless query/performance evidence justifies a dedicated page.

### P1 — Strengthen graph relationships

Current related-guide logic is based mainly on category and shared scoring dimensions. Upgrade relationships to include explicit semantic edges:

- persona;
- job-to-be-done;
- constraint;
- category;
- direct alternative/comparison relationships.

This improves human navigation, internal linking, and machine understanding simultaneously.

### P2 — Expand long-tail only from validated decision families

The long-tail file is small and useful, which is preferable to indiscriminate scale. Expand in controlled batches based on one or more of:

- Search Console impressions/queries;
- likely-human internal search behavior;
- outbound/recommendation behavior;
- observed competitor gaps;
- known commercial software decisions.

A candidate page should have a clear distinct decision. Do not generate page permutations only to increase URL count.

### P2 — Upgrade structured data conservatively

Current structured data is a solid base. Improve it only when visible content supports the claim. Potential improvements include:

- consistent BreadcrumbList on guides/comparisons;
- WebPage/Article `about` and `mainEntity` relationships reflecting visible software entities;
- `dateModified` when a trustworthy generated/verified date exists;
- Organization/WebSite entity consistency across surfaces.

Do not add Review/AggregateRating unless ToolScout has genuine review evidence meeting schema/search policy requirements.

### P2 — Commercial-intent analytics segmentation

Revenue Intelligence already has page/intent/tool rankings and monetization coverage. Extend reporting when technically justified to distinguish page families and decision context, for example:

- tool profile;
- generic intent guide;
- persona/workflow guide;
- comparison;
- alternatives page when introduced.

Desired derived measures include outbound CTR by page family, affiliate-covered outbound by page family, and evidence-backed revenue by landing page/intent family. Do not infer vendor conversions from clicks.

### P2 — Alternatives as a first-class relationship

The current graph has comparisons and related guides, but no clearly audited first-class `alternatives` data model in this pass. Introduce an explicit alternatives relationship only after checking existing generators/data for overlap and canonicalization rules.

The goal is not "one alternatives page per tool" by default. It is useful alternative discovery where products genuinely substitute for one another.

### P3 — Redesign integration

The approved V5 minimalist redesign should become the visual expression of this decision system:

- homepage asks for the problem before showing inventory;
- results explain why tools fit;
- tool pages expose decision-relevant context progressively;
- comparisons foreground the practical choice rather than feature-table density;
- related intents/comparisons are discoverable without turning the interface into a directory wall;
- commercial CTAs remain visually clear but do not dominate editorial reasoning.

## Immediate execution queue

### Connector-safe / documentation and planning now

1. Persist this audit and the Commercial Intent Strategy in GitHub.
2. Create implementation issues for P0/P1 work.
3. Use web research to build a validated candidate-intent backlog, keeping evidence/source and decision rationale separate from production data.
4. Audit current SEO workflow failure before any new page-generation change.

### Work/Codex batch when execution capacity is available

Batch the compatible implementation work:

1. repair/verify SEO generation workflow;
2. add backward-compatible decision-context fields and validation;
3. update guide/comparison generators to render evidence-backed context blocks;
4. upgrade graph/internal-link selection;
5. extend validators/tests;
6. regenerate assets;
7. run smoke/indexability checks;
8. deploy only after tests pass;
9. reconcile resulting production state into `docs/COMMAND-CENTER.md` and production documentation.

## Non-goals

- Do not inflate catalog/page count for its own sake.
- Do not rank by affiliate payout.
- Do not generate fake reviews, test results or statistics.
- Do not create thousands of thin persona/tool permutations.
- Do not replace the existing production SEO stack with a second parallel architecture.
- Do not let redesign reintroduce homepage clutter merely to expose more SEO inventory.

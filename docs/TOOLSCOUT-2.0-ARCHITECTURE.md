# ToolScout 2.0 Architecture

Effective design target: 2026-09-29

## Mission

ToolScout exists to earn qualified software-buyer attention and convert that attention into useful, editorially independent affiliate outbound.

The economic loop is:

`external discovery -> qualified human visit -> useful decision support -> monetized outbound -> confirmed revenue`

Engineering activity, generated pages, submissions, backlinks and engine cycles are inputs. None are success by themselves.

## Non-negotiable preservation invariants

ToolScout 2.0 is an evolutionary migration, not a rewrite.

1. Existing public canonical URLs are preserved unless there is explicit evidence that consolidation improves search outcomes.
2. Existing indexed pages are not deleted or redirected merely to simplify architecture.
3. Existing verified backlinks, placements and referring-domain evidence are preserved.
4. Existing `/go/<slug>` affiliate routes remain compatible.
5. Existing verified affiliate relationships remain affiliate-neutral inputs to monetization, never editorial ranking.
6. Existing GA4, GSC, D1 and external backlink truth are preserved during migration.
7. A 2.0 component may replace an old component only after parity is verified.

## Four-system target architecture

### 1. Public Site

Responsibilities:
- fast indexable HTML;
- tool profiles, comparisons, guides and software intelligence/news;
- recommendation UX;
- stable canonicals and sitemap;
- `/go/` redirect boundary.

The public site must continue serving useful pages if Growth/Distribution systems are degraded.

### 2. Signals

Canonical inputs:
- Google Search Console for search performance and URL inspection;
- GA4 for visitors and sessions;
- first-party redirect ledger for outbound and monetized outbound;
- vendor evidence for confirmed revenue;
- external backlink provider snapshots plus internal placement evidence;
- primary vendor sources for editorial facts.

Signals measure the outside world. They do not create strategy.

### 3. Growth Planner

One planner ranks interventions by expected qualified-human value.

Its decision order is:
1. protect proven external outcomes;
2. deepen pages already earning demand;
3. publish high-information-gain software intelligence;
4. earn authority/referral distribution;
5. recover commercial leakage;
6. explore new mechanisms within a bounded budget.

The planner must not prioritize work because it is easy to automate.

### 4. Executor

The executor performs only planner-authorized work:
- content/editorial updates;
- SEO/internal-link changes;
- distribution/outreach;
- safe machine submissions;
- verification.

Cloudflare remains control/state plane. Render is bounded external execution capacity. Make remains reputation-sensitive email transport.

## Editorial authority contract

Every priority commercial or comparison page should answer a question that cannot be answered by copying vendor homepages.

Preferred evidence:
- primary documentation;
- pricing/plan changes;
- changelogs and release notes;
- integration/feature constraints;
- use-case trade-offs;
- dated factual comparisons;
- proprietary ToolScout datasets derived from cited first-party facts.

Software News and the Software Trends Index are authority wedges. Fresh verified changes should update both intelligence pages and relevant commercial decision pages.

## External-value-first distribution

Before ToolScout spends route-discovery, CAPTCHA/auth classification or submission capacity, a surface receives an external value score.

Positive drivers:
- audience fit;
- authority;
- referral traffic potential;
- backlink/editorial value;
- verified human or commercial outcomes.

Automation ease is not a positive value driver.

Commodity directories and registries are discounted unless they demonstrate real human, authority or commercial yield.

Already-live, verified, submitted or pending placements are preserved and continue measurement even if their future acquisition value is low.

## Migration phases

### Phase 1 - Objective function and preservation
- introduce the external acquisition value model;
- gate future research capacity by value;
- preserve all existing live/indexed/backlink outcomes;
- add regression tests.

### Phase 2 - Editorial authority engine
- define information-gain requirements per page type;
- connect software update intelligence to commercial pages;
- make Software Trends Index citation-worthy;
- concentrate SEO work on a small priority portfolio.

### Phase 3 - Architecture consolidation
- move runtime DDL to formal migrations;
- replace implicit worker-decorator chains with explicit routing/scheduling;
- separate public serving from growth/control paths;
- retire redundant truth/integrity wrappers after parity checks.

### Phase 4 - Command Center simplification
Primary business view:
- GA4 visitors/sessions;
- Google clicks/impressions;
- qualified human acquisition by source;
- outbound and monetized outbound;
- confirmed revenue;
- authority/referring domains;
- priority portfolio movement.

Execution counts and queues remain diagnostics, not headline KPIs.

## Stop rules

Do not add a new engine when an existing planner/executor can own the responsibility.

Do not create new SEO surface merely because generation is cheap.

Do not spend external execution capacity on low-value surfaces unless explicitly selected as a bounded experiment.

Do not change a proven URL, placement or affiliate route solely for architectural neatness.

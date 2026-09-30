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


## Current route-ownership state

As of Phase 23, every route group declared in `runtime-route-contract.js` has an explicit owner. Unknown or undeclared paths still retain the legacy fallback for compatibility.

The commercial `/go/*` boundary is intentionally different from a clean-room rewrite. Its explicit owner calls a bounded compatibility core beginning at `distribution-embed-worker.js` and then applies the existing social-attribution, outbound-integrity and visitor-linkage stages explicitly. This preserves the mature redirect, affiliate-state, sub-ID, fallback and measurement semantics while removing declared commercial requests from the full decorator traversal.

Further decomposition of the bounded commercial core is allowed only after parity can be demonstrated for:
- affiliate and public destinations;
- `/go/embed`;
- click reference and affiliate sub-ID propagation;
- click-time affiliate state;
- session and funnel evidence;
- known-bot/synthetic bypass;
- strict outbound proof;
- visitor linkage;
- social affiliate attribution;
- noindex/no-store redirect headers.


### Command Center read-model boundary

The direct Command Center owner must not depend on the legacy operational worker chain. Its canonical Business Truth implementation lives in `command-center-business-truth-runtime.js` and may depend on the simplified view plus read-only data sources, but not on a generic `base.fetch` decorator path or request-time schema mutation.

Compatibility workers may consume this canonical read model. They may not carry a divergent copy of it.


### Legacy edge ratchet

After explicit route ownership is proven, redundant decorator edges are removed one at a time. Each removal must preserve any still-useful fallback behavior explicitly at the front router and lower the architecture audit's maximum legacy-edge budget. The budget is a ratchet, not a target that may grow again.


### Scheduled-owner extraction

A worker that owns both direct routes and cron work does not need to remain in the generic request decorator chain. Its scheduled responsibility should be exported as a named function and invoked by the front scheduler according to `runtime-schedule-contract.js`. Internal calls may retain bounded lower-chain compatibility until their endpoint owners are extracted.


### Schema before dispatch extraction

A wrapper that still owns request-time DDL is not eligible for direct-owner extraction. Move its schema into an additive D1 migration, replace runtime DDL with a read-only schema probe, then change routing or scheduling in a later phase. This keeps data-plane and dispatch risk independently reversible.


### Coordinator extraction

A coordinator wrapper may be removed from generic request traversal once its schema is migration-owned and its route/schedule responsibilities are exported explicitly. Preserve orchestration order: lower scheduled dispatch stays inside the coordinator contract where that ordering is part of the existing behavior, while unrelated explicit owners may continue in parallel at the front router.


### Direct-owner side effects

When a route moves ahead of a legacy decorator, preserve any intentional side effect that was coupled to that route even if the response HTML is replaced. Cookie marking, attribution context and security/session state are part of route semantics. Extract those effects into a shared primitive and invoke them from the direct owner rather than relying on a bypassed wrapper.


### Attribution-stage extraction

Analytics attribution that applies to generic public GET responses belongs in an explicit front-router response stage, not in a broad decorator. Preserve stage order relative to other response transforms and give protected analytics read endpoints their own route owner.


### Budget-stage extraction

A quota-protection wrapper should be narrowed to the routes that still reach it after direct ownership is introduced. Dead cache entries for already intercepted routes are not a reason to retain broad traversal. Preserve live cache, circuit-breaker and credential-scope semantics as an explicit route owner.


### Redundant decorator retirement

If every route a decorator mutates is already intercepted by explicit owners, that decorator must not remain in generic traversal merely for historical symmetry. Keep it only inside the bounded compatibility composition that still needs its transform, and ratchet the generic edge budget downward.


### Surface-owner extraction

Small UI-support endpoints such as SVG, CSS and health evidence should have explicit ownership when their wrapper otherwise exists only to decorate already-owned HTML. Preserve lower-runtime composition for health enrichment and keep legacy page decoration available only as compatibility behavior.


### Post-schedule ownership

A wrapper-owned scheduler mission is not considered preserved if a higher dispatcher intercepts that cron and returns without delegating the wrapper chain. Post-schedule work must be exported as a named scheduler owner and explicitly sequenced after the core missions it depends on.


### Core-to-drain ordering

Authority recovery sequencing is explicit: settle the independent hourly core missions, run the authority closed loop, then run the sender drain. This ordering keeps machine-first recovery ahead of external-handoff draining and prevents wrapper traversal from determining mission reachability.


### Canonical response-stage ownership

Canonical redirects and canonical public assets are explicit route owners. Generic HTML canonicalization is an explicit response stage that runs immediately after the lower runtime and before attribution, SEO runtime transforms and social-footer injection. This prevents SEO behavior from being coupled to Command Center presentation wrappers.


### Helper-preserving wrapper removal

A wrapper may leave generic traversal while its exported helpers remain in use by direct owners or bounded compatibility compositions. Removing a traversal edge does not require deleting the module. Preserve explicit helper imports and only retire request interception that is already owned elsewhere.


### Split request and scheduled ownership

A legacy wrapper may leave generic request traversal before its scheduled responsibility is fully removed from compatibility chains. Export the scheduled responsibility explicitly and invoke it where the front scheduler previously delegated to that wrapper. Preserve ordering and avoid duplicate invocation when another bounded coordinator still traverses the compatibility chain.


### Stateful response-stage extraction

When a wrapper performs state linkage around a lower request, preserve both sides of the boundary: prepare any request context before lower execution, then apply persistence-dependent linkage only after the lower response exists. Response decoration may then be expressed as an ordered front-router stage without changing identity semantics.


### Human-confirmation stage extraction

Browser-confirmed human evidence is a first-class response and signal stage. The confirmation client must be injected before downstream traffic transforms, while its ingestion endpoint and heartbeat schedule are explicitly owned. Schema remains migration-owned.


### Presentation-only compatibility wrappers

Once the current product surface is served by a direct owner, an older wrapper that only decorates legacy UI should not remain in generic request traversal. Keep its decorator available for bounded compatibility if needed, direct-own any remaining health endpoint, and let the front router bypass the presentation layer.


### Autoload presentation extraction

Autoload scripts that hydrate a legacy dashboard from an already direct-owned API are presentation compatibility, not route ownership. Direct-own their health surface and remove the wrapper from generic traversal once the current Command Center no longer depends on that presentation layer.


### Pure health endpoint extraction

A wrapper that only adds a read-only health endpoint can be removed from generic traversal once that endpoint has an explicit route owner. Keep the underlying domain worker as the fallback base and preserve the health payload exactly.


### Redundant enrichment wrapper removal

A legacy enrichment wrapper may leave generic traversal when the direct route owner already emits the same business truth. Keep the legacy decorator available only for bounded compatibility paths and protect the direct payload with policy tests before cutting the edge.


### Public syndication stage extraction

When a wrapper combines protected administration routes with public response decoration and a scheduled publish task, separate request ownership from response transformation without duplicating the scheduled path. Preserve the public transform's position relative to later integrity and SEO stages.

# ToolScout 2.0 Migration Status

Last updated: 2026-10-02

This file is the handoff ledger for the ToolScout 2.0 migration. It exists to prevent architectural work from becoming an opaque sequence of patches.

## Production safety rule

Nothing in this migration is considered deployed merely because it exists in GitHub.

The rollout order is:

1. branch implementation;
2. targeted CI;
3. review of preservation invariants;
4. merge;
5. apply D1 migrations;
6. deploy the Cloudflare Worker;
7. verify public URLs, canonicals, sitemap, /go/ routes and Command Center truth;
8. compare GSC/GA4/backlink baselines after deployment.

## Phase 1 - External-value-first acquisition

Status: implemented on branch.

Implemented:
- central external acquisition value model;
- automation ease removed as a positive value driver;
- publisher/editorial/vendor surfaces favored over commodity directories;
- verified human/commercial proof can override weak heuristics;
- low-value opportunities remain recorded but stop consuming Render route-research capacity;
- already live/verified/submitted/pending/scheduled outcomes are preservation-protected;
- Command Center/overflow metrics can distinguish discovered research universe from value-eligible research universe;
- migration 0085 adds value fields without removing existing state.

Production impact before merge/deploy: none.

## Phase 2 - Editorial authority

Status: implemented on branch, generation not yet published.

Implemented:
- editorial authority scoring model;
- observed-demand editorial portfolio;
- Growth Planner authority-gap signal;
- primary-source evidence added to tool-profile generator;
- primary-source evidence and verification dates added to commercial guide generator;
- primary sources added to comparison analysis;
- Software News and Software Trends formally defined as authority/freshness inputs;
- SEO workflow builds the editorial authority portfolio before normal planning.

Current initial portfolio findings from the current GSC snapshot:
- 15 top opportunities audited;
- 11 are below the initial editorial target of 70;
- /best-seo-tools-for-agencies is the largest authority-deepening opportunity in the audited set;
- multiple high-impression tool profiles have source data internally but do not yet expose that evidence in the public page.

Production impact before generated pages are published: none.

## Phase 3 - Architecture consolidation

Status: active migration.

Implemented:
- migration 0086 owns compute overflow, contact-supply and auth-capability schema/index creation;
- migration 0087 owns SEO runtime state schema/index creation;
- compute-router and SEO runtime no longer execute CREATE TABLE or CREATE INDEX at runtime;
- runtime now verifies that the migrated schemas exist;
- scheduler ownership is explicit in runtime-schedule-contract.js and observable at /api/runtime/schedule-contract;
- distribution, affiliate, catalog and content scheduling has been extracted from the Command Center theme layer into growth-scheduler.js;
- route ownership is explicit in runtime-route-contract.js and observable at /api/runtime/route-contract;
- distribution priority, Growth/Distribution control and mission evidence APIs now use early owner dispatch instead of traversing the full decorator chain;
- the legacy decorator chain is currently 72 edges and CI prevents it from growing;
- Command Center business-truth GETs are read-only: legacy affiliate schema reconciliation is an explicit admin mutation, not an observability side effect.

Still to do:
- replace remaining implicit worker-decorator chains with explicit route ownership;
- continue moving remaining scheduled ownership behind the central schedule contract;
- identify and retire redundant Command Center truth/integrity wrappers after parity verification;
- separate public serving dependencies from growth/control dependencies where the current chain still couples them.

## Phase 4 - Command Center simplification

Status: started.

Implemented so far:
- Editorial Authority is now part of business truth and the Command Center;
- observed-demand authority gaps are visible as a priority portfolio;
- business truth v6 keeps unavailable data unavailable instead of manufacturing zeros;
- technical execution remains visible but is secondary to business outcomes.

Target headline view:
- visitors;
- sessions;
- Google clicks/impressions;
- qualified human acquisition by source;
- outbound;
- monetized outbound;
- confirmed revenue;
- referring domains/authority;
- editorial priority portfolio progress.

Execution counts, classifiers, queues and internal engine activity remain diagnostic drill-down only.

## Preservation baseline

Do not regress:
- current canonical URL inventory;
- current sitemap URLs;
- current indexed-page inventory;
- existing verified backlinks/referring domains;
- existing /go/ affiliate routes;
- existing active affiliate relationships;
- current GA4 and GSC source-of-truth semantics.

## Current branch / PR

Base: main

Active migration branch: architecture/toolscout-2.0-phase-23

PR #168 and phases through #195 are merged. Phase 23 is the current commercial-boundary migration and is not production-deployed merely because it exists in GitHub.


## Phase 2 - Runtime consolidation continuation

Status: active on branch architecture/toolscout-2.0-phase-2.

Implemented in this phase:
- migration 0089 moves Growth Planner state tables/indexes out of runtime;
- authority closed-loop POST action is an explicit early-dispatch route;
- runtime architecture audit measures declared direct-route coverage and rejects runtime DDL in direct 2.0 owners;
- software news (/news/*) has a dedicated public editorial plane that preserves SEO transformation, canonical handling and ToolScout social footer while bypassing the legacy control chain;
- Command Center page, Business Truth GET and Simplified Health GET are explicit read-only route owners and bypass the legacy chain;
- schema reconciliation remains on the legacy/admin path until a compatibility-safe idempotent migration is available;
- priority editorial pages are materialized in a bounded GSC-observed portfolio rather than regenerating the entire public surface.

Deliberately not migrated yet:
- /go/* affiliate redirects and commercial tracking;
- authority closed-loop health enrichment;
- remaining analytics/statistics augmentation routes;
- dynamic tool/ranking public pages;
- agent protocol routes.

These remain on legacy fallback until parity can be demonstrated.


### Phase 2 additions after route consolidation

- Canonical ownership is now explicit in `public-canonical-contract.js`. The production contract remains extensionless even where older static source files still contain `.html` canonicals.
- Software news and the Software Trends Index are served through the direct editorial public plane with the same extensionless canonical behaviour as the legacy runtime.
- Existing static `best-*` guides are sovereign. Runtime rankings may create a genuinely new guide surface, but may not replace an existing indexed guide at request time.
- Runtime-admitted tool profiles and runtime-created rankings expose primary vendor evidence.
- Authority closed-loop health is a direct read-only owner. GET observability no longer normalizes failed engine runs as a side effect.
- MCP, A2A and `/.well-known/agent-card.json` are direct route owners. The remaining machine discovery catalog endpoints stay on legacy fallback.
- AgentReady verification moved from an unreachable `15 3 * * *` wrapper condition to the central hourly scheduler with a daily 03:15 UTC subcadence.
- Production recovery deploy now rechecks preservation before migrations/deploy and performs a post-deploy smoke for canonicals, editorial plane, Command Center, authority health and a synthetic non-recording affiliate redirect.

Historical note: the items above were the remaining legacy groups at that earlier checkpoint. Subsequent phases moved analytics/statistics reads, public decision/navigation surfaces, machine discovery and control mutations behind explicit owners. The commercial redirect boundary is handled by Phase 23 below.


## Phase 23 - Commercial redirect ownership

Status: implemented on `architecture/toolscout-2.0-phase-23`; production rollout still requires preservation checks and live smoke verification.

Implemented:
- GET `/go/*` is assigned to the explicit `affiliate_redirect` route owner;
- the direct owner uses a bounded compatibility core beginning at `distribution-embed-worker.js`, rather than rewriting the mature commercial implementation;
- `/go/embed` tracking remains inside that core;
- catalog public fallback remains inside the existing affiliate workflow layer;
- the canonical tracked redirect continues to snapshot affiliate-active-at-click state, session/source context, click reference, affiliate sub-ID and funnel evidence before redirecting;
- social affiliate redirect attribution is replayed explicitly after the commercial core;
- known-automation bypass, strict outbound proof and redirect noindex/no-store behavior reuse the existing outbound-integrity implementation;
- visitor-to-session linkage reuses the existing visitor-integrity implementation;
- the response-stage order remains social attribution -> outbound integrity -> visitor linkage, matching the existing wrapper response order;
- synthetic affiliate-route health checks remain non-recording;
- the runtime architecture audit now requires 100% direct ownership across all declared route groups and permits no declared legacy group;
- the production smoke verifies that a synthetic active affiliate redirect is still external and is served by the `affiliate_redirect` owner.

Residual compatibility:
- unknown and undeclared paths still retain the generic legacy fallback;
- the direct affiliate owner intentionally retains a bounded lower commercial compatibility core until deeper decomposition can prove destination, attribution, monetization and measurement parity;
- the 72-edge historical decorator chain is therefore no longer traversed for declared `/go/*` requests, but it is not deleted as part of this safety-sensitive phase.

Preservation rule:
No affiliate destination, public URL, canonical, sitemap URL, active programme relationship, click-time monetization semantics or verified outbound definition may change as a side effect of this migration.


## Phase 24 - Command Center read-model isolation

Status: implemented on `architecture/toolscout-2.0-phase-24`; production behavior intentionally unchanged.

Implemented:
- the canonical Command Center Business Truth read model is extracted to `command-center-business-truth-runtime.js`;
- `command-center-direct-runtime.js` no longer imports `operational-truth-reconciliation-worker.js`;
- the extracted read model has no `base.fetch`, runtime DDL or schema mutation;
- the legacy operational reconciliation module consumes the same canonical direct handler instead of carrying a second copy of the Business Truth implementation;
- the legacy reconciliation module is reduced from roughly 59 KB to roughly 7.5 KB and retains only its compatibility/reconciliation responsibilities;
- architecture audit and CI now inspect the real direct read-model implementation;
- production recovery syntax-checks the isolated read model before any D1 or Worker mutation.

Preservation rule:
This phase changes module ownership, not business semantics. Business Truth queries, cache behavior, Command Center session cookie, redirects, health contract, card inventory and unavailable-is-never-zero behavior remain unchanged.


## Phase 25 - Retire operational truth wrapper

Status: implemented on `architecture/toolscout-2.0-phase-25`.

Implemented:
- production remains rooted at `compute-router-worker.js`;
- the compute router now connects its generic fallback directly to `authority-acquisition-worker.js`;
- the remaining useful legacy behavior from the retired wrapper, ToolScout social-footer injection on fallback GET HTML, is applied explicitly by `legacyFallback()` in the compute router;
- redundant Command Center, stats and dynamic tool-profile interceptions are removed because those route groups are already owned and dispatched before fallback;
- `operational-truth-reconciliation-worker.js` is deleted;
- its reusable JSON reconciliation is retained as the pure `operational-truth-reconciliation-runtime.js`, with no fetch-wrapper/base import;
- direct admin stats now declares its mature lower-chain compatibility composition explicitly before applying that reconciliation;
- CI no longer syntax-checks the retired wrapper;
- the legacy decorator edge budget ratchets from 72 to 71 so the removed edge cannot silently return.

Preservation rule:
Declared owners retain priority. Unknown/undeclared requests still reach the same lower legacy runtime and GET HTML fallback still receives the ToolScout social footer.


## Phase 26 - Explicit Authority Acquisition scheduling

Status: implemented on `architecture/toolscout-2.0-phase-26`.

Implemented:
- `runAuthorityAcquisitionScheduled()` is an explicit exported scheduler owner for the hourly vetted-acquisition and authority-pipeline-recovery missions;
- the compute router invokes that owner directly on the hourly schedule;
- the compute router's generic base chain now connects directly to `seo-cloudflare-runtime-worker.js`, bypassing the Authority Acquisition decorator;
- Authority Acquisition internal recovery calls continue to use the same lower SEO/runtime chain, preserving authenticated internal endpoint composition;
- the default Authority Acquisition worker remains compatibility-capable for isolated use, but is no longer part of production's generic decorator traversal;
- the architecture edge budget ratchets from 71 to 70.

Preservation rule:
The vetted acquisition route handlers, hourly cadence, public-placement reconciliation and pipeline recovery sequence remain unchanged. Only ownership and dispatch become explicit.


## Phase 27 - Explicit SEO runtime ownership

Status: implemented on `architecture/toolscout-2.0-phase-27`.

Implemented:
- `runSeoRuntimeScheduled()` explicitly owns the hourly/daily SEO runtime refresh;
- the compute router invokes that scheduler only after the lower scheduled chain completes, preserving prior ordering;
- generic request fallback now connects directly to `cloudflare-primary-runtime-worker.js`;
- the compute fallback applies `transformSeoPublicPage()` explicitly before ToolScout social-footer injection, preserving the prior response transformation order;
- direct `/api/seo/*` ownership remains unchanged;
- the SEO wrapper remains available as a compatibility module but is no longer part of production's generic decorator traversal;
- the architecture edge budget ratchets from 70 to 69.

Preservation rule:
Canonical/redirect behavior, observed-search-demand activation, IndexNow queuing, public SEO transformation and hourly/daily refresh cadence remain unchanged.


## Phase 28 - Cloudflare primary schema ownership

Status: implemented on `architecture/toolscout-2.0-phase-28`.

Implemented:
- migration `0098_growth_asset_cache_schema.sql` formally owns `growth_asset_cache`;
- `cloudflare-primary-runtime-worker.js` no longer creates schema at request or scheduled runtime;
- the former runtime DDL is replaced by a cached migration-owned schema probe;
- missing schema fails closed with `growth_asset_cache_schema_not_migrated`;
- CI and production recovery validate that Cloudflare Primary contains no runtime DDL.

Why this phase is separate:
The Cloudflare Primary wrapper is the next decorator candidate, but it coordinates GSC refresh, the primary growth cycle and lower scheduled dispatch. Schema ownership is removed first so the later routing/scheduling extraction does not combine D1 migration risk with dispatch changes.


## Phase 29 - Explicit Cloudflare Primary ownership

Status: implemented on `architecture/toolscout-2.0-phase-29`; held for CI before merge because GitHub Actions quota is exhausted on 2026-09-30.

Implemented:
- `handleCloudflarePrimaryRuntimeRoute()` explicitly owns `GET /api/runtime/executors` and `POST /api/runtime/cloudflare-primary-cycle`;
- `runCloudflarePrimaryScheduled()` explicitly owns the hourly/daily GSC refresh and primary growth coordinator cycle;
- the compute router dispatches those responsibilities directly;
- the generic request base moves from `cloudflare-primary-runtime-worker.js` to `ga4-owner-exclusion-worker.js`;
- on hourly/daily schedules, SEO refresh remains chained after Cloudflare Primary, while Growth Scheduler and Authority Acquisition remain parallel sidecars;
- Cloudflare Primary still dispatches its lower scheduled chain once from inside the primary runtime ledger, preserving the mature coordinator model;
- the architecture edge budget ratchets from 69 to 68.

Preservation rule:
Runtime executor payloads, admin authentication, GSC refresh, primary-growth ledger semantics, lower scheduled dispatch, SEO ordering and generic fallback behavior remain unchanged.


## Phase 30 - Restore direct GA4 owner marking

Status: implemented on `architecture/toolscout-2.0-phase-30`.

Implemented:
- owner marker primitives are extracted to `ga4-owner-context.js`;
- the direct Command Center page now sets the durable `toolscout_owner` cookie and initializes `toolscout_owner_since` when missing;
- existing owner-since timestamps are preserved, so the 24h clean-window clock is never reset by reopening the Command Center;
- the legacy GA4 owner wrapper consumes the same shared marker primitives instead of maintaining a divergent copy;
- public owner analytics attribution remains unchanged: marked browsers continue to use `toolscout_owner / internal` on public pages that carry the GA tag;
- no legacy widgets are reintroduced into the simplified Command Center.

Why this matters:
The direct Command Center route bypassed the old decorator that originally created the owner cookie. Without restoring that side effect at the direct owner, the operator's later public-page visits could be misclassified as external acquisition.

Preservation rule:
This phase changes owner identification only. Command Center HTML, business metrics, GA measurement ID, 24h warm-up semantics and public analytics campaign attribution remain unchanged.


## Phase 31 - Direct GA4 owner exclusion

Status: implemented on `architecture/toolscout-2.0-phase-31`.

Implemented:
- `GET /analytics/api/google/external-24h` is now a declared `analytics_owner_exclusion` route owned by `ga4-owner-exclusion-runtime.js`;
- the direct runtime preserves Command Center session validation, rolling 24h owner subtraction, warm-up gating and the existing growth-signal contract;
- generic fallback now connects directly to `ga4-attribution-24h-worker.js`;
- marked-owner public analytics attribution is applied explicitly in the compute fallback before SEO transformation and social-footer injection;
- the former `ga4-owner-exclusion-worker.js` remains compatibility-only and is no longer part of production's generic request traversal;
- the architecture edge budget ratchets from 68 to 67.

Preservation rule:
The owner source/medium, GA measurement ID, 24h clean-window semantics, public attribution transformation, Command Center session boundary and external-acquisition payload remain unchanged.


## Phase 32 - Direct GA4 rolling attribution

Status: implemented on `architecture/toolscout-2.0-phase-32`.

Implemented:
- `GET /analytics/api/google/acquisition-24h` is now a declared `analytics_attribution_24h` route;
- `handleGa4Attribution24hRoute()` preserves the existing Command Center session boundary and rolling 24h GA4 payload;
- GA4 owner exclusion composes directly from that handler instead of calling the attribution wrapper as a generic fetch layer;
- the compute router generic base moves from `ga4-attribution-24h-worker.js` to `d1-read-budget-worker.js`;
- legacy Command Center widget decoration remains available only through the compatibility wrapper and is no longer part of production's generic traversal;
- the architecture edge budget ratchets from 67 to 66.

Preservation rule:
The GA4 property/source, rolling 24h window, session and engagement metrics, source/medium, landing-page, country and direct-share semantics remain unchanged.


## Phase 33 - Explicit D1 read budget ownership

Status: implemented on `architecture/toolscout-2.0-phase-33`.

Implemented:
- the still-live D1 budget behavior is narrowed to seven explicit routes rather than wrapping every generic request;
- protected Google connect/acquisition/commerce/disconnect requests preserve Command Center session bridging to the owner Access identity;
- `/api/autonomous-growth-health` and `/api/distribution/discovery-health` preserve cache coalescing, quota circuit-breaker and D1 cache headers;
- the intentional `/analytics/api/ga4-health` 404 remains explicit;
- stale budget entries for routes already intercepted by ToolScout 2.0 owners no longer justify keeping the wrapper in generic traversal;
- compute generic fallback now connects directly to `command-center-ga4-worker.js`;
- the architecture edge budget ratchets from 66 to 65.

Preservation rule:
No active D1 quota protection is removed. Credential forwarding, owner identity bridging, public health-read TTLs, circuit-breaker behavior and cache evidence headers remain unchanged.


## Phase 34 - Explicit Command Center GA4 handling

Status: implemented on `architecture/toolscout-2.0-phase-34`.

Implemented:
- `command-center-ga4-worker.js` exposes `handleCommandCenterGa4Route()` for its GA4/OAuth request responsibilities;
- the D1 budget owner composes Google connect, acquisition, commerce and disconnect through that explicit handler after applying the existing owner identity bridge;
- `GET /api/google-analytics/callback` gains direct `google_analytics_callback` ownership;
- generic request fallback now connects directly to `command-center-health-language-worker.js`;
- legacy GA4 Command Center page decoration remains compatibility-only and is no longer part of production generic traversal;
- the architecture edge budget ratchets from 65 to 64.

Preservation rule:
OAuth connect/callback/disconnect behavior, GA4 acquisition and commerce payloads, owner-only access checks and existing D1 budget protection remain unchanged.


## Phase 35 - Remove redundant stats-language traversal

Status: implemented on `architecture/toolscout-2.0-phase-35`.

Implemented:
- generic compute fallback now connects directly to `gsc-command-center-visible-worker.js`;
- `command-center-health-language-worker.js` is removed from generic traversal because its only response mutations target `/analytics/api/stats` and `/api/stats`, both already owned before fallback;
- the health-language compatibility transform remains available inside the mature lower composition used by direct Admin Stats;
- no endpoint ownership, payload shape or response mutation is moved in this phase;
- the architecture edge budget ratchets from 64 to 63.

Preservation rule:
Stats language reconciliation remains available where the direct Admin Stats compatibility composition still depends on it. Only redundant generic traversal is removed.


## Phase 36 - Explicit GSC trend surface ownership

Status: implemented on `architecture/toolscout-2.0-phase-36`.

Implemented:
- `GET /api/gsc-trend.svg`, `GET /api/gsc-trend.css` and `GET /api/health` are owned by the explicit `gsc_trend_surface` route;
- the GSC SVG and CSS keep the existing versioned, no-store surface;
- `/api/health` still composes the lower runtime first and then adds the existing `gscTrendSurface` evidence;
- generic compute fallback now connects directly to `gsc-command-center-trend-worker.js`;
- legacy Command Center HTML trend-link decoration remains compatibility-only and is no longer part of production generic traversal;
- the architecture edge budget ratchets from 63 to 62.

Preservation rule:
Trend data source, SVG/CSS output, surface version, incomplete-day handling and health evidence remain unchanged.


## Phase 37 - Remove redundant GSC trend traversal

Status: implemented on `architecture/toolscout-2.0-phase-37`.

Implemented:
- generic compute fallback now connects directly to `growth-runtime-authority-drain-worker.js`;
- `gsc-command-center-trend-worker.js` is removed from generic traversal because every response it mutates is already intercepted before fallback: `/api/health`, `/api/stats`, `/analytics/api/stats` and the Command Center HTML routes;
- the trend wrapper remains intact for bounded direct compositions, including the explicit GSC health surface introduced in Phase 36;
- no route owner, GSC data source, chart payload or stats enrichment is changed;
- the architecture edge budget ratchets from 62 to 61.

Preservation rule:
GSC daily trend enrichment remains available in the explicit compositions that still consume it. Only redundant generic traversal is removed.


## Phase 38 - Explicit authority sender drain scheduling

Status: implemented on `architecture/toolscout-2.0-phase-38`.

Implemented:
- `runAuthorityDrainScheduled()` is an explicit scheduler owner for the hourly post-schedule authority sender drain;
- `authority_sender_drain` is now declared in the central schedule contract with owner `authority_drain`;
- the compute router executes the drain after the hourly growth, authority-acquisition, Cloudflare-primary and SEO scheduler work settles;
- generic request fallback now connects directly to `growth-runtime-observability-worker.js`;
- the legacy authority-drain wrapper remains available for bounded compatibility compositions that still use its response enrichments;
- the architecture edge budget ratchets from 61 to 60.

Functional correction:
The old wrapper-owned `15 * * * *` drain could be unreachable because the compute router already intercepted the hourly cron and returned without delegating `base.scheduled()`. This phase makes the mission reachable and observable instead of preserving that hidden dependency.

Preservation rule:
Authority sender handoff semantics, bounded drain passes, callback evidence requirements and error recording remain unchanged. Only ownership and scheduler reachability change.


## Phase 39 - Remove redundant growth observability traversal

Status: implemented on `architecture/toolscout-2.0-phase-39`.

Implemented:
- generic compute fallback now connects directly to `growth-runtime-closed-loop-worker.js`;
- `growth-runtime-observability-worker.js` is removed from generic traversal because its response corrections target routes already intercepted by explicit owners: discovery health, autonomous growth health and the two stats reads;
- the observability wrapper remains available inside bounded compatibility compositions such as the D1 budget path, where its corrections are still consumed;
- no route owner, observability payload or scheduled mission changes in this phase;
- the architecture edge budget ratchets from 60 to 59.

Preservation rule:
Existing observability corrections remain available where explicit compositions still depend on them. Only redundant generic traversal is removed.


## Phase 40 - Explicit authority closed-loop scheduling

Status: implemented on `architecture/toolscout-2.0-phase-40`.

Implemented:
- `runGrowthClosedLoopScheduled()` explicitly owns the hourly `authority_closed_loop` mission already declared in the central schedule contract;
- the compute router executes the closed loop after the hourly core scheduler work settles and before the authority sender drain;
- generic request fallback now connects directly to `growth-runtime-integrity-worker.js`;
- the closed-loop wrapper remains available inside bounded compatibility compositions for health/stats/UI enrichment;
- the architecture edge budget ratchets from 59 to 58.

Functional correction:
The closed-loop hourly mission previously lived inside a wrapper `scheduled()`, but the compute router intercepted the hourly cron and returned without delegating `base.scheduled()`. This phase makes that mission reachable and observable.

Preservation rule:
Manual close-loop ownership, run ledger semantics, machine-first execution, sender handoff evidence and hourly mission identity remain unchanged. Scheduler reachability becomes explicit.


## Phase 41 - Explicit authority integrity recovery scheduling

Status: implemented on `architecture/toolscout-2.0-phase-41`.

Implemented:
- `runGrowthRuntimeIntegrityScheduled()` explicitly owns the hourly `authority_gap_recovery` mission already declared in the central schedule contract;
- compute sequencing is now explicit: hourly core -> authority closed loop -> integrity recovery -> sender drain;
- generic request fallback now connects directly to `command-center-light-theme-worker.js`;
- integrity stats/health/UI corrections remain available inside bounded compatibility compositions;
- production recovery syntax-checks both the closed-loop and integrity scheduler modules before any mutation;
- the architecture edge budget ratchets from 58 to 57.

Functional correction:
The integrity recovery previously lived inside a wrapper `scheduled()` below the same hourly interception point. This phase makes the recovery reachable and independently observable.

Preservation rule:
Authority gap criteria, cooldown behavior, execution ledger semantics and recovery logic remain unchanged. Only ownership and reachability are made explicit.


## Phase 42 - Explicit public canonical surface ownership

Status: implemented on `architecture/toolscout-2.0-phase-42`.

Implemented:
- `/sitemap.xml`, `/data/tools.json` and residual legacy `.html` redirects gain explicit `public_canonical_surface` ownership;
- `handlePublicCanonicalSurfaceRoute()` preserves sitemap merge/deduplication, public tools JSON and extensionless 308 redirects;
- `transformPublicCanonicalResponse()` preserves canonical markup and SEO discovery-link injection as an explicit response stage;
- compute fallback ordering is explicit: lower runtime -> canonical response transform -> owner attribution -> SEO runtime -> social footer;
- generic fallback now connects directly to `command-center-final-integrity-worker.js`;
- the light-theme wrapper remains available inside bounded compatibility compositions for Command Center and owner-specific health paths;
- the architecture edge budget ratchets from 57 to 56.

Preservation rule:
Canonical URLs, sitemap output, public tools data, SEO discovery links and residual HTML redirects remain unchanged.


## Phase 43 - Remove redundant final-integrity traversal

Status: implemented on `architecture/toolscout-2.0-phase-43`.

Implemented:
- generic compute fallback now connects directly to `mission-integrity-v2-worker.js`;
- `command-center-final-integrity-worker.js` is removed from generic traversal because its response mutations target stats and Command Center HTML routes already intercepted by explicit owners;
- the final-integrity wrapper remains available inside bounded compatibility compositions that still use its stats normalization/UI behavior;
- the existing direct `mission_integrity` owner remains unchanged;
- the architecture edge budget ratchets from 56 to 55.

Preservation rule:
Stats normalization and Command Center integrity UI remain available where explicit compatibility compositions still consume them. Only redundant generic traversal is removed.


## Phase 44 - Remove mission-integrity v2 wrapper traversal

Status: implemented on `architecture/toolscout-2.0-phase-44`.

Implemented:
- generic compute fallback now connects directly to `mission-integrity-worker.js`;
- `mission-integrity-v2-worker.js` remains the direct owner of `POST /api/engine-evidence` through `handleMissionIntegrityRoute()`;
- the v2 wrapper is removed from generic traversal because it otherwise only delegates requests and schedules to its lower runtime;
- no evidence ingestion, schema probe or route ownership changes in this phase;
- the architecture edge budget ratchets from 55 to 54.

Preservation rule:
Engine evidence ingestion remains explicitly owned by the v2 handler. Only the redundant decorator hop is removed.


## Phase 45 - Remove legacy mission-integrity traversal

Status: implemented on `architecture/toolscout-2.0-phase-45`.

Implemented:
- generic compute fallback now connects directly to `command-center-integrity-worker.js`;
- `mission-integrity-worker.js` is removed from production's generic request traversal;
- `POST /api/engine-evidence` remains owned directly by the existing `mission_integrity` ToolScout 2.0 route;
- traffic-integrity health continues to consume `augmentMissionIntegrityHealth()` explicitly;
- direct Admin Stats retains the mature lower compatibility composition that still includes mission-integrity augmentation;
- no route ownership, payload shape or mission evidence semantics are changed;
- the architecture edge budget ratchets from 54 to 53.

Preservation rule:
Mission evidence ingestion, content-engine health augmentation and internal compatibility helpers remain available. Only the redundant generic wrapper edge is removed.


## Phase 46 - Explicit Command Center integrity scheduling

Status: implemented on `architecture/toolscout-2.0-phase-46`.

Implemented:
- generic request fallback now connects directly to `visitor-integrity-worker.js`;
- `command-center-integrity-worker.js` exports `runCommandCenterIntegrityScheduled()`;
- overflow and non-primary cron delegation in the compute router now calls that scheduler explicitly;
- the exported scheduler preserves the prior ordering by awaiting the lower scheduled chain before running `refreshDailyMetrics()`;
- hourly/daily primary coordination continues to receive the same integrity scheduling through the existing bounded compatibility chain, avoiding duplicate refresh writes;
- direct traffic-integrity health continues to consume `augmentCommandCenterIntegrityHealth()` explicitly;
- the architecture edge budget ratchets from 53 to 52.

Preservation rule:
Measurement audit generation, daily metric refresh cadence, traffic-integrity augmentation and lower scheduled delegation remain unchanged. Only generic request traversal is shortened.


## Phase 47 - Explicit Visitor Integrity ownership

Status: implemented on `architecture/toolscout-2.0-phase-47`.

Implemented:
- `GET /api/visitor-session-identity-health` gains direct `visitor_integrity` ownership;
- generic request fallback now connects directly to `outbound-integrity-worker.js`;
- `/api/events` visitor context is still prepared before lower runtime execution using a cloned request body;
- visitor↔session linking is applied after the lower runtime confirms persistence;
- public HTML visitor-cookie mirroring is applied explicitly before canonical, owner-attribution, SEO and social-footer response transforms;
- affiliate redirects continue to use the existing explicit visitor-link helper;
- direct traffic-integrity health continues to use the existing Visitor Integrity augmentation helper;
- the architecture edge budget ratchets from 52 to 51.

Preservation rule:
First-valid visitor/session identity, confirmed-event persistence checks, outbound-proof linkage, country linkage, visitor cookie mirroring and visitor health semantics remain unchanged.


## Phase 49 - Explicit live traffic ownership

Status: implemented on `architecture/toolscout-2.0-phase-49`.

Implemented:
- distribution feeds `/api/distribution/feed.json` and `/api/distribution/feed.xml` gain explicit `traffic_integrity_live` ownership;
- the `page_confirmed` browser-proof gate runs explicitly before lower-runtime event persistence;
- public HTML traffic transforms run explicitly immediately after lower-runtime response, preserving their original position before Visitor Integrity, canonical, owner-attribution, SEO and footer stages;
- generic fallback moves from `traffic-integrity-live-worker.js` to `traffic-integrity-guard-worker.js`;
- the live wrapper remains compatibility-capable but is no longer part of production generic traversal;
- the architecture edge budget ratchets from 50 to 49.

Preservation rule:
Distribution feed priority, page-confirmation eligibility, browser-proof enforcement, SEO uplift, commercial cluster overrides, late visitor retry injection and response-stage ordering remain unchanged.


## Phase 50 - Explicit traffic guard ownership

Status: implemented on `architecture/toolscout-2.0-phase-50`.

Implemented:
- `GET /api/traffic-forensics-48h` gains explicit `traffic_integrity_guard` ownership;
- `/api/events` traffic-guard processing remains ahead of lower event persistence through an explicit continuation stage;
- browser-guard HTML injection remains before the live-traffic transform and before Visitor Integrity/canonical/owner/SEO/footer stages;
- traffic-guard retention cleanup is exported as an explicit scheduled mission and launched by the compute scheduler;
- generic fallback moves from `traffic-integrity-guard-worker.js` to `owner-exclusion-worker.js`;
- the architecture edge budget ratchets from 49 to 48.

Preservation rule:
Strict-human evidence rules, browser validation, quarantine logic, rate/burst detection, traffic forensics, browser-guard injection and seven-day guard-event retention remain unchanged.


## Phase 51 - Owner retrospective schema ownership

Status: implemented on `architecture/toolscout-2.0-phase-51`.

Implemented:
- migration `0099_owner_retrospective_audits_schema.sql` formally owns `owner_retrospective_audits`;
- `owner-exclusion-worker.js` no longer creates the table during a request;
- runtime now probes migration state once and fails closed with `owner_retrospective_audits_schema_not_migrated` if the migration is absent;
- owner retrospective matching and audit writes are unchanged;
- CI and production recovery enforce the no-runtime-DDL invariant.

Why this phase is separate:
The owner-exclusion wrapper is the next generic decorator candidate. Schema ownership is removed first so the later route/response extraction does not combine dispatch risk with D1 mutation risk.


## Phase 52 - Direct owner exclusion ownership

Status: implemented on `architecture/toolscout-2.0-phase-52`.

Implemented:
- `GET /analytics/api/owner-exclusion` and `POST /analytics/api/owner-retrospective-audit` gain explicit `owner_exclusion` ownership;
- Command Center session and owner-cookie protection remain inside the direct handler;
- retrospective auditing continues to use the migration-owned `owner_retrospective_audits` table introduced in Phase 51;
- generic fallback now connects directly to `traffic-integrity-worker.js`;
- legacy owner-exclusion Command Center decoration remains compatibility-only and is no longer part of generic production traversal;
- the architecture edge budget ratchets from 48 to 47.

Preservation rule:
Owner verification, persistent owner cookie semantics, canonical-human exclusion and retrospective audit matching remain unchanged.


## Phase 53 - Explicit traffic integrity core ownership

Status: implemented on `architecture/toolscout-2.0-phase-53`.

Implemented:
- `POST/OPTIONS /api/confirmed-visitor` gains direct `traffic_integrity_core` ownership;
- the browser-confirmed visitor HTML injection is applied explicitly immediately after lower-runtime response and before traffic guard/live transforms;
- traffic-integrity heartbeat/retention is exported as an explicit scheduled mission owned by `traffic_integrity_core`;
- the heartbeat continues to use migration-owned `traffic_integrity_heartbeat` schema from migration 0071;
- generic request fallback now connects directly to `command-center-human-truth-chart-worker.js`;
- `/api/traffic-integrity-health` remains on the existing direct health composition;
- the architecture edge budget ratchets from 47 to 46.

Preservation rule:
Likely-human classification, page-confirmed prerequisite, visitor/session UUID validation, source/referrer validation, country evidence, confirmed-visitor insertion, public confirmation script and heartbeat retention remain unchanged.


## Phase 54 - Direct human truth chart health ownership

Status: implemented on `architecture/toolscout-2.0-phase-54`.

Implemented:
- `GET /api/command-center-human-truth-chart-health` gains explicit `human_truth_chart_health` ownership;
- the direct handler preserves the existing chart-health payload and observability semantics;
- generic request fallback now connects directly to `command-center-human-truth-details-worker.js`;
- legacy human-truth chart decoration remains compatibility-only for old analytics HTML composition;
- the architecture edge budget ratchets from 46 to 45.

Preservation rule:
Human truth chart health metadata, chart configuration and legacy analytics decoration remain unchanged. Only redundant generic traversal is removed.


## Phase 55 - Direct human truth details health ownership

Status: implemented on `architecture/toolscout-2.0-phase-55`.

Implemented:
- `GET /api/command-center-human-truth-details-health` gains explicit `human_truth_details_health` ownership;
- the direct handler preserves the existing detail-health payload, canonical human-session semantics, unique-visitor support, visitor-country metadata and affiliate-coverage flags;
- generic request fallback now connects directly to `command-center-human-truth-final-worker.js`;
- legacy human-truth details augmentation and analytics decoration remain compatibility-only;
- the architecture edge budget ratchets from 45 to 44.

Preservation rule:
Human-session truth semantics, visitor/country detail metadata, affiliate coverage detail and legacy Command Center decoration remain unchanged. Only redundant generic traversal is removed.


## Phase 56 - Direct human truth final health ownership

Status: implemented on `architecture/toolscout-2.0-phase-56`.

Implemented:
- `GET /api/command-center-human-truth-final-health` gains explicit `human_truth_final_health` ownership;
- the direct handler preserves strict-human canonical metric/source, accepted evidence, browser-diagnostic-only semantics, default 24h window and forecast metadata;
- generic request fallback now connects directly to `command-center-human-truth-worker.js`;
- legacy final-truth Command Center UI remains compatibility-only;
- the architecture edge budget ratchets from 44 to 43.

Preservation rule:
Strict-human evidence semantics, D1 canonical source, forecast metadata and legacy final-truth UI remain unchanged. Only redundant generic traversal is removed.


## Phase 57 - Direct base human truth health ownership

Status: implemented on `architecture/toolscout-2.0-phase-57`.

Implemented:
- `GET /api/command-center-human-truth-health` gains direct `human_truth_base_health` ownership;
- `command-center-human-truth-worker.js` exports `handleHumanTruthBaseRoute()` while retaining its legacy presentation decorator for bounded compatibility;
- generic request fallback now connects directly to `command-center-resilient-worker.js`;
- the chart, details and final human-truth health owners remain unchanged;
- no human visitor metric, first-party source definition or Command Center business-truth payload is changed;
- the architecture edge budget ratchets from 43 to 42.

Preservation rule:
The base health payload remains version 1 with D1 first-party visitor IDs, last24 as the default reporting window and top chart placement. Only redundant generic UI decoration traversal is removed.


## Phase 58 - Remove redundant resilient traversal

Status: implemented on `architecture/toolscout-2.0-phase-58`.

Implemented:
- generic request fallback now connects directly to `command-center-autoload-worker.js`;
- `command-center-resilient-worker.js` is removed from generic traversal;
- resilient health remains owned directly by `command_center_resilient_health`;
- Chairman Queue remains owned directly by `analytics_chairman`;
- `/analytics/api/stats` remains owned directly by `analytics_stats`, using the existing resilient snapshot implementation;
- the architecture edge budget ratchets from 42 to 41.

Preservation rule:
The resilient snapshot, Chairman Queue semantics, session validation and resilient health payload remain unchanged. Only redundant generic request interception is removed.


## Phase 59 - Direct Command Center autoload health ownership

Status: implemented on `architecture/toolscout-2.0-phase-59`.

Implemented:
- `GET /api/command-center-autoload-health` gains direct `command_center_autoload_health` ownership;
- `command-center-autoload-worker.js` exports `handleCommandCenterAutoloadHealthRoute()`;
- generic request fallback now connects directly to `command-center-truth-consolidation-worker.js`;
- legacy autoload UI decoration remains available only for bounded compatibility;
- analytics stats continue to use their existing direct owner, so no business-truth payload is moved;
- the architecture edge budget ratchets from 41 to 40.

Preservation rule:
Autoload health remains version 5 with traffic-truth-first, Chairman second, three traffic trend series and dual-axis trend behavior. Only redundant generic UI traversal is removed.


## Phase 60 - Direct Command Center truth health ownership

Status: implemented on `architecture/toolscout-2.0-phase-60`.

Implemented:
- `GET /api/command-center-truth-health` gains direct `command_center_truth_health` ownership;
- `command-center-truth-consolidation-worker.js` exports `handleCommandCenterTruthHealthRoute()`;
- generic request fallback now connects directly to `discovery-attribution-health-worker.js`;
- commercial-truth consolidation and legacy Command Center presentation remain compatibility-only;
- analytics stats continue through their existing direct resilient owner;
- the architecture edge budget ratchets from 40 to 39.

Preservation rule:
The health payload retains D1 browser-confirmed commercial truth, the redundant north-star state and consolidated traffic truth. No commercial ledger or affiliate metric is redefined.


## Phase 61 - Direct discovery attribution health ownership

Status: implemented on `architecture/toolscout-2.0-phase-61`.

Implemented:
- `GET /api/discovery-attribution-health` gains direct `discovery_attribution_health` ownership;
- `discovery-attribution-health-worker.js` exports `handleDiscoveryAttributionHealthRoute()`;
- generic compute fallback now connects directly to `discovery-attribution-worker.js`;
- the health payload, category taxonomy and no-store cache behavior remain unchanged;
- the architecture edge budget ratchets from 39 to 38.

Preservation rule:
Discovery attribution classification remains owned by `discovery-attribution-worker.js`. This phase only removes the redundant health wrapper from generic traversal.


## Phase 62 - Remove redundant discovery attribution traversal

Status: implemented on `architecture/toolscout-2.0-phase-62`.

Implemented:
- generic compute fallback now connects directly to `lemlist-profile-correction-worker.js`;
- `discovery-attribution-worker.js` is removed from generic traversal;
- direct `/analytics/api/stats` continues to emit `discoveryAttribution` from the ToolScout 2.0 resilient stats owner;
- the legacy discovery-attribution widget and snapshot decorator remain compatibility-only;
- no discovery classification definitions or category semantics are changed;
- the architecture edge budget ratchets from 38 to 37.

Preservation rule:
Search, AI referral, distribution, social, dark-direct-deep, direct-home, tracked-campaign and other-referral attribution semantics remain unchanged in the direct stats truth.


## Phase 63 - Explicit RSS distribution ownership

Status: implemented on `architecture/toolscout-2.0-phase-63`.

Implemented:
- `GET /api/distribution/rss/status` and `POST /api/distribution/rss/publish` gain direct `rss_distribution` ownership;
- `lemlist-profile-correction-worker.js` exports `handleRssDistributionRoute()` and `transformRssPublicResponse()`;
- generic compute fallback now connects directly to `visitor-dashboard-metrics-worker.js`;
- RSS feed headers, WebSub hub metadata, public RSS discovery links and the lemlist profile correction remain applied as an explicit response stage immediately after lower runtime;
- the existing hourly WebSub publish remains in the bounded scheduled compatibility chain and is not duplicated in compute;
- the architecture edge budget ratchets from 37 to 36.

Preservation rule:
RSS status/publish authorization, distribution RSS state, WebSub publish behavior, feed metadata, public RSS discovery and the lemlist profile correction remain unchanged.


## Phase 64 - Direct month metrics health ownership

Status: implemented on `architecture/toolscout-2.0-phase-64`.

Implemented:
- `GET /api/month-metrics-health` gains direct `month_metrics_health` ownership;
- `visitor-dashboard-metrics-worker.js` exposes `handleMonthMetricsHealthRoute()`;
- generic request fallback now connects directly to `visitor-accuracy-worker.js`;
- the legacy month-metrics Command Center decoration remains compatibility-only;
- direct Command Center page ownership means the old decoration is not part of the ToolScout 2.0 public request path;
- the architecture edge budget ratchets from 36 to 35.

Preservation rule:
The month-metrics health payload, cache policy and legacy compatibility script remain unchanged. Only redundant generic traversal is removed.


## Phase 65 - Migrate visitor accuracy schema

Status: implemented on `architecture/toolscout-2.0-phase-65`.

Implemented:
- migration `0100_visitor_accuracy_schema.sql` formally owns `visitor_events`, `visitor_tracking_meta` and visitor-event indexes;
- `visitor-accuracy-worker.js` no longer performs `CREATE TABLE`, `CREATE INDEX` or tracking-marker writes during requests;
- runtime readiness is now a cached, read-only schema probe;
- missing schema fails closed with `visitor_accuracy_schema_not_migrated`;
- the public-page request path no longer performs background schema auto-repair;
- visitor writes and visitor snapshots require migrated schema before accessing D1.

Why this phase is separate:
`visitor-accuracy-worker.js` is the next generic-wrapper candidate, but it still owns `POST /api/visitor` and public visitor-tracking decoration. Schema ownership is removed first so the later route/response-stage extraction does not combine data-plane migration risk with dispatch changes.

Preservation rule:
The visitor-event table shape, tracking-start marker, visitor payload validation, acquisition script and visitor snapshot semantics remain unchanged.


## Phase 66 - Explicit visitor accuracy ownership

Status: implemented on `architecture/toolscout-2.0-phase-66`.

Implemented:
- `POST /api/visitor` and its `OPTIONS` preflight gain direct `visitor_accuracy` ownership;
- `visitor-accuracy-worker.js` exports `handleVisitorAccuracyRoute()` and `transformVisitorAccuracyPublicResponse()`;
- generic request fallback now connects directly to `posthog-behavior-worker.js`;
- public visitor-tracker injection remains an explicit response stage immediately after the lower runtime and before RSS, traffic-integrity, visitor-integrity, canonical, owner-attribution, SEO and footer transforms;
- analytics pages remain excluded from the public visitor-tracker stage;
- the architecture edge budget ratchets from 35 to 34.

Preservation rule:
Visitor validation, CORS preflight, migration readiness, first-party tracker payload, source/referrer capture and public response ordering remain unchanged.


## Phase 67 - Remove PostHog behavior request traversal

Status: implemented on `architecture/toolscout-2.0-phase-67`.

Implemented:
- generic request fallback now connects directly to `agent-protocol-worker.js`;
- `posthog-behavior-worker.js` is removed from production's generic request traversal;
- its scheduled behavior remains unchanged in the bounded compatibility chain: lower scheduling runs first, then `applyDistributionBehaviorPriorities()` is launched as a sidecar;
- direct Command Center ownership keeps the old product-behavior widget outside the ToolScout 2.0 generic request path;
- analytics stats ownership remains unchanged;
- the architecture edge budget ratchets from 34 to 33.

Preservation rule:
PostHog audit behavior, D1-first behavior intelligence, distribution-priority learning and Command Center compatibility augmentation remain unchanged. Only redundant request traversal is removed.


## Phase 68 - Remove agent protocol compatibility request traversal

Status: implemented on `architecture/toolscout-2.0-phase-68`.

Implemented:
- generic compute fallback now connects directly to `command-center-affiliate-table-worker.js`;
- `agent-protocol-worker.js` leaves production's generic request traversal because MCP/A2A routes already have direct `agent_protocol_core` ownership;
- `GET /analytics-consent` gains direct `public_analytics_consent` ownership;
- public HTML canonical markup cleanup plus consent decoration move to `public-analytics-runtime.js` as an explicit legacy public response stage;
- `withPrivateAssets()` remains scoped to the legacy fallback around the lower runtime, preserving private asset denial, browser confirmation, first-party page-entry tracking and stats compatibility behavior;
- direct Command Center, sitemap, human-actions, chairman, stats and agent-protocol routes remain outside the generic fallback;
- the architecture edge budget ratchets from 33 to 32.

Preservation rule:
Canonical public URLs, legacy .html cleanup, analytics consent behavior, first-party page-entry tracking, private asset protection, Command Center ownership and MCP/A2A behavior remain unchanged. Only redundant generic request traversal is removed.


## Phase 69 - Remove Command Center affiliate table request traversal

Status: implemented on `architecture/toolscout-2.0-phase-69`.

Implemented:
- generic compute fallback now connects directly to `growth-command-center-v2-worker.js`;
- `command-center-affiliate-table-worker.js` leaves production's generic request traversal because canonical Command Center pages and read APIs already have direct ToolScout 2.0 ownership;
- the legacy `GET /analytics/login` compatibility endpoint gains direct `command_center_local_login` ownership;
- the fixed local-login token expired on 2026-09-09 and is retained only as a fail-closed compatibility contract: 503 when Command Center auth is unconfigured, otherwise 410 Gone;
- public analytics compatibility and `withPrivateAssets()` remain scoped exactly as established in Phase 68;
- the architecture edge budget ratchets from 32 to 31.

Preservation rule:
Canonical Command Center pages, business-truth APIs, public analytics consent, private asset protection, browser confirmation, visitor tracking and public URL/canonical behavior remain unchanged. No expired login credential is revived.


## Phase 70 - Migrate outbound reputation schema

Status: implemented on `architecture/toolscout-2.0-phase-70`.

Implemented:
- migration `0101_outbound_reputation_schema.sql` formally owns `outbound_reputation_overrides` and `outbound_reputation_learning`;
- `growth-command-center-v2-worker.js` no longer performs reputation-related `CREATE TABLE` statements during the owner-review request path;
- the table shapes, primary keys, defaults and existing reputation override/learning writes are unchanged;
- deploy ordering remains migration-first through the existing D1 migration step;
- the legacy edge budget remains 31 because this phase prepares the next ownership extraction without changing request dispatch.

Why this phase is separate:
The remaining reputation-review action is a candidate for direct ownership, but direct ToolScout 2.0 owners may not create or alter schema at request time. Schema ownership is removed first so the following request-traversal extraction is bounded and reversible.

Preservation rule:
Reputation quarantine review, override dispatch, Gmail proof, learning semantics and distribution state transitions remain unchanged. Only lazy request-time schema creation is removed.


## Phase 71 - Remove Growth Command Center request traversal

Status: implemented on `architecture/toolscout-2.0-phase-71`.

Implemented:
- generic compute fallback now connects directly to `affiliate-human-action-entry-worker.js`;
- `POST /analytics/api/reputation-review` and `POST /analytics/api/distribution-human-action` gain direct `command_center_growth_actions` ownership;
- the direct owner calls the existing `reputationReview()` and `distributionHumanAction()` implementations through one exported handler rather than copying business logic;
- Phase 70 guarantees the direct owner no longer performs runtime schema creation;
- canonical Command Center pages, stats and chairman queue remain on their already direct read owners;
- the architecture edge budget ratchets from 31 to 30.

Preservation rule:
Command Center session validation, reputation quarantine decisions, override dispatch and Gmail proof, learning rules, distribution human-gate resolution, public URLs/canonicals and analytics/tracking behavior remain unchanged.


## Phase 72 - Remove affiliate human-action request traversal

Status: implemented on `architecture/toolscout-2.0-phase-72`.

Implemented:
- generic compute fallback now connects directly to `human-action-entry-worker.js`;
- `GET /api/audience-health` and the three audience/affiliate action POST endpoints gain direct `affiliate_human_actions` ownership;
- direct dispatch reuses the existing audience health, suggestion ingestion, audience action and affiliate action implementations;
- legacy Command Center stats augmentation and page-script injection are not copied into direct dispatch because those active surfaces already have canonical ToolScout 2.0 owners;
- the architecture edge budget ratchets from 30 to 29.

Preservation rule:
Audience-health payload semantics, suggestion-ingest authentication, Command Center session gates, affiliate human-action recording, public URLs/canonicals, Command Center stats and active page composition remain unchanged.


## Phase 73 - Remove human-action presentation traversal

Status: implemented on `architecture/toolscout-2.0-phase-73`.

Implemented:
- generic compute fallback now connects directly to `affiliate-coverage-entry-worker.js`;
- `human-action-entry-worker.js` leaves production's generic request traversal;
- human-action reads remain on the canonical `analytics_human_actions` owner;
- credential, gate and editorial mutations remain on the direct `analytics_human_actions_mutation` owner using the existing exported handler from `human-action-entry-worker.js`;
- the legacy Command Center page injection is not copied because canonical Command Center page composition is already direct-owned;
- the architecture edge budget ratchets from 29 to 28.

Preservation rule:
Human-action queue semantics, secure credential saving, non-blocking gate completion, editorial action resolution, public URLs/canonicals and active Command Center presentation remain unchanged.


## Phase 74 - Migrate affiliate reply schema

Status: implemented on `architecture/toolscout-2.0-phase-74`.

Implemented:
- migration `0102_affiliate_reply_schema.sql` formally owns `affiliate_reply_events`;
- `affiliate-coverage-entry-worker.js` no longer executes `CREATE TABLE` during Gmail/affiliate reply ingestion;
- the table shape, primary key, defaults, deduplication checks and reply reconciliation writes are unchanged;
- deploy ordering remains migration-first through the existing D1 migration step;
- the legacy edge budget remains 28 because this phase prepares the next direct-ownership extraction without changing dispatch.

Preservation rule:
Affiliate reply matching, approval/rejection classification, referral-link capture, workflow history and post-submit state reconciliation remain unchanged. Only lazy request-time schema creation is removed.


## Phase 75 - Remove affiliate coverage request traversal

Status: implemented on `architecture/toolscout-2.0-phase-75`.

Implemented:
- generic compute fallback now connects directly to `distribution-impact-entry-worker.js`;
- affiliate Firecrawl monitoring, affiliate reply ingestion and manual coverage-cycle execution gain direct `affiliate_coverage_runtime` ownership;
- direct dispatch reuses the existing handlers and preserves 405 behavior for non-POST requests;
- Phase 74 guarantees reply ingestion no longer performs runtime schema creation;
- the architecture edge budget ratchets from 28 to 27.

Preservation rule:
Firecrawl reconciliation, Gmail affiliate reply ingestion, affiliate approval/rejection classification, referral-link capture, manual coverage authorization, ledger semantics and scheduled affiliate coverage behavior remain unchanged.


## Phase 76 - Remove distribution impact presentation traversal

Status: implemented on `architecture/toolscout-2.0-phase-76`.

Implemented:
- generic compute fallback now connects directly to `agent-protocol-core-worker.js`;
- `distribution-impact-entry-worker.js` leaves production's generic request traversal;
- `GET /api/stats` remains owned by `admin_stats`;
- `GET /analytics/api/stats` remains owned by `analytics_stats`;
- Command Center pages remain owned by `command_center_direct`;
- the obsolete distribution-impact page injection is not copied because canonical ToolScout 2.0 presentation already bypasses it;
- the architecture edge budget ratchets from 27 to 26.

Preservation rule:
Canonical stats sources, Command Center page ownership, public URLs/canonicals and active observability behavior remain unchanged.


## Phase 77 - Remove agent protocol core request traversal

Status: implemented on `architecture/toolscout-2.0-phase-77`.

Implemented:
- generic compute fallback now connects directly to `content-engine-intelligence-worker.js`;
- `agent-protocol-core-worker.js` leaves production's generic request traversal;
- MCP, A2A and the agent card remain direct-owned by `agent_protocol_core`;
- the protocol handler still uses its own lower `content-engine-intelligence-worker.js` dependency to resolve `/api/recommend`, preserving deterministic recommendation behavior;
- the architecture edge budget ratchets from 26 to 25.

Preservation rule:
MCP/A2A envelopes, protocol validation, agent discovery, recommendation calls, ranking neutrality, public URLs/canonicals and agent-card semantics remain unchanged.


## Phase 78 - Migrate Content Engine social intelligence schema

Status: implemented on `architecture/toolscout-2.0-phase-78`.

Implemented:
- migration `0103_content_social_intelligence_schema.sql` formally owns Content Engine social-intelligence tables and indexes;
- `content-engine-intelligence-worker.js` no longer performs `CREATE TABLE`, `CREATE INDEX` or `ALTER TABLE` in request or scheduled execution;
- `affiliate_social_policy_queue` remains owned by migration `0080_affiliate_social_onboarding.sql`;
- `ensureAffiliateSocialOnboardingSchema()` is retained as a compatibility no-op rather than mutating D1 at runtime;
- the legacy edge budget remains 25 because this phase prepares direct Content Engine ownership without changing routing.

Preservation rule:
Social-profile discovery, affiliate social-policy classification, content brief generation, growth-action issuance, borrowed-audience route selection and social affiliate measurement semantics remain unchanged. Only lazy schema mutation is removed.


## Phase 79 - Remove Content Engine request traversal

Status: implemented on `architecture/toolscout-2.0-phase-79`.

Implemented:
- generic compute fallback now connects directly to `distribution-network-worker.js`;
- Content Engine refresh, brief and metrics routes gain direct `content_engine_intelligence` ownership;
- direct dispatch reuses the existing Content Engine handler and preserves proof authentication on refresh;
- `/go/` remains owned by `affiliate_redirect`, so the legacy social-affiliate redirect post-processing path is not reintroduced into generic traversal;
- Phase 78 guarantees the direct Content Engine owner is schema-clean;
- the architecture edge budget ratchets from 25 to 24.

Preservation rule:
Content intelligence refresh, brief generation, metrics, affiliate/social policy logic, agent recommendation lower dependencies, affiliate redirects, public URLs/canonicals and ranking semantics remain unchanged.


## Phase 80 - Migrate Distribution Network route schema

Status: implemented on `architecture/toolscout-2.0-phase-80`.

Implemented:
- migration `0104_distribution_network_route_schema.sql` formally owns `distribution_contact_routes` and the remaining route-action indexes;
- `distribution_network_outreach` remains owned by migration `0078_distribution_network_engine.sql`;
- `distribution_contact_route_actions` remains owned by migration `0103_content_social_intelligence_schema.sql`;
- `distribution-network-worker.js` no longer executes `CREATE TABLE`, `CREATE INDEX` or `ALTER TABLE` during request or scheduled execution;
- the legacy edge budget remains 24 because this phase prepares direct Distribution Network ownership without changing routing.

Preservation rule:
Publisher candidate discovery, competitor-outreach suppression, contact-route discovery, route-action materialization, strict-human attribution, adoption verification and network metrics remain unchanged.


## Phase 81 - Remove Distribution Network request traversal

Status: implemented on `architecture/toolscout-2.0-phase-81`.

Implemented:
- generic compute fallback now connects directly to `distribution-embed-worker.js`;
- `POST /api/distribution/network/refresh` and `GET /api/distribution/network/metrics` gain direct `distribution_network_runtime` ownership;
- direct dispatch reuses the existing Distribution Network handler and preserves authorization checks;
- Phase 80 guarantees the direct owner is schema-clean;
- scheduled Distribution Network behavior remains delegated through the existing scheduler/runtime imports;
- the architecture edge budget ratchets from 24 to 23.

Preservation rule:
Publisher discovery, competitor-outreach suppression, contact-route discovery, autonomous route materialization, strict-human attribution, adoption verification, network metrics and public URLs/canonicals remain unchanged.


## Phase 82 - Remove distribution embed request traversal

Status: implemented on `architecture/toolscout-2.0-phase-82`.

Implemented:
- generic compute fallback now connects directly to `distribution-command-worker.js`;
- publisher kit, recommendation API, ToolScout embed script, badge and the distribution RSS feed gain direct `distribution_public_embed` ownership;
- `/api/distribution/feed.json` remains on the existing `traffic_integrity_live` owner;
- machine discovery remains on `machine_discovery_catalog`;
- `/go/` remains on `affiliate_redirect`;
- the architecture edge budget ratchets from 23 to 22.

Preservation rule:
Recommendation ranking, publisher-kit canonicals, embed assets, distribution feed semantics, affiliate redirects and machine-discovery routes remain unchanged.


## Phase 83 - Remove distribution command presentation traversal

Status: implemented on `architecture/toolscout-2.0-phase-83`.

Implemented:
- generic compute fallback now connects directly to `distribution-orchestrator-worker.js`;
- `distribution-command-worker.js` leaves production's generic request traversal;
- `GET /api/stats` remains owned by `admin_stats`;
- `GET /analytics/api/stats` remains owned by `analytics_stats`;
- Command Center pages remain owned by `command_center_direct`;
- the obsolete Distribution Operations page injection is not copied into ToolScout 2.0 direct dispatch;
- the architecture edge budget ratchets from 22 to 21.

Preservation rule:
Canonical stats sources, Command Center ownership, public URLs/canonicals and active distribution observability remain unchanged.


## Phase 84 - Remove distribution orchestrator request traversal

Status: implemented on `architecture/toolscout-2.0-phase-84`.

Implemented:
- generic compute fallback now connects directly to `distribution-priority-worker.js`;
- `distribution-orchestrator-worker.js` leaves production's generic request traversal;
- all active `/api/distribution/orchestrate*`, economic-learning, editorial-queue, priorities and `/api/growth/*` surfaces remain on the direct `distribution_orchestrator` owner;
- scheduled Growth Brain execution remains explicit in `compute-router-worker.js` and is not inherited from the legacy base chain;
- the architecture edge budget ratchets from 21 to 20.

Preservation rule:
Growth opportunity coordination, execution contracts, supervisor state, autonomous distribution, affiliate/content cycles, scheduler ownership, authorization and public URLs remain unchanged.


## Phase 85 - Remove distribution priority request traversal

Status: implemented on `architecture/toolscout-2.0-phase-85`.

Implemented:
- generic compute fallback now connects directly to `distribution-throughput-integrity-worker.js`;
- `distribution-priority-worker.js` leaves production's generic request traversal;
- `GET /api/distribution/operating-decisions` and `POST /api/distribution/operating-decisions/rebalance` remain direct-owned by `distribution_priority`;
- the existing `handleDistributionPriorityRoute()` implementation remains the canonical handler;
- the architecture edge budget ratchets from 20 to 19.

Preservation rule:
Distribution economic learning, external-value scoring, bounded exploration slots, paid-execution approval gates, operating decisions, public URLs/canonicals and scheduled behavior remain unchanged.


## Phase 86 - Fold IndexNow throughput integrity into throughput runtime

Status: implemented on `architecture/toolscout-2.0-phase-86`.

Implemented:
- `distribution-throughput-integrity-worker.js` leaves production's generic request traversal;
- generic compute fallback now connects directly to `distribution-linkable-assets-worker.js`;
- IndexNow retry timestamp normalization moves into `distribution-throughput-worker.js`;
- normalization still runs after the two affected POST flows and after scheduled throughput execution;
- `last_attempt_at` continues to reflect the real network attempt while `retry_after_at` remains the scheduling authority;
- the architecture edge budget ratchets from 19 to 18.

Preservation rule:
IndexNow retry semantics, adaptive backoff, delivery-state timestamps, autonomous refresh, submission execution, scheduled verification and public URLs/canonicals remain unchanged.


## Phase 87 - Remove linkable assets request traversal

Status: implemented on `architecture/toolscout-2.0-phase-87`.

Implemented:
- generic compute fallback now connects directly to `distribution-throughput-worker.js`;
- `POST /api/distribution/linkable-assets/sync` gains direct `distribution_linkable_assets` ownership;
- the direct owner reuses the existing sync implementation and preserves admin authorization;
- scheduled linkable-asset synchronization remains on the legacy scheduled chain until scheduler ownership is migrated separately;
- the architecture edge budget ratchets from 18 to 17.

Preservation rule:
Original-research asset discovery, IndexNow queueing, editorial/community packaging, deduplication, scheduled synchronization, public URLs/canonicals and distribution policy semantics remain unchanged.


## Phase 88 - Explicit Distribution Throughput ownership

Status: implemented on `architecture/toolscout-2.0-phase-88`.

Implemented:
- `POST /api/distribution/autonomous/refresh`, `POST /api/distribution/submissions/execute` and `GET /api/distribution/delivery/metrics` are declared under the explicit `distribution_throughput_runtime` owner;
- the direct owner preserves the existing authorization boundary and the established ordering of due-research release, adaptive IndexNow delivery, lower distribution execution and IndexNow timestamp normalization;
- generic request fallback now connects directly to `distribution-autonomous-worker.js`, bypassing the Distribution Throughput decorator;
- the compatibility default export remains available for isolated callers, but production request traversal no longer depends on it;
- the architecture edge budget ratchets from 17 to 16.

Preservation rule:
No submission policy, Human Gate behavior, IndexNow retry semantics, delivery verification state, public placement state, authentication rule or distribution execution result changes in this phase. Only route ownership and generic traversal are changed.


## Phase 89 - Autonomous distribution schema ownership

Status: implemented on `architecture/toolscout-2.0-phase-89`.

Implemented:
- migration `0105_autonomous_distribution_placement_schema.sql` formally owns `distribution_placements` and `idx_distribution_placements_backlink`;
- the migration adopts existing production objects idempotently with `CREATE ... IF NOT EXISTS`;
- `distribution-autonomous-worker.js` no longer creates or alters schema at runtime;
- the runtime now probes both the table and backlink-verification index and fails closed with `distribution_placements_schema_not_migrated` if migration ownership is incomplete;
- CI and production recovery explicitly syntax-check the autonomous runtime and enforce migration ownership.

Why this phase is separate:
`distribution-autonomous-worker.js` is the next decorator candidate, but it owns a large distribution control surface. Schema mutation is removed first so the later routing extraction changes dispatch only, not D1 ownership and dispatch at the same time.

Preservation rule:
The `distribution_placements` schema, placement verification fields, backlink verification semantics and existing production rows remain unchanged.


## Phase 90 - Explicit Autonomous Distribution ownership

Status: implemented on `architecture/toolscout-2.0-phase-90`.

Implemented:
- `GET /api/distribution/autonomy/metrics` is declared under the explicit `distribution_autonomous_runtime` owner;
- `POST /api/distribution/autonomous/refresh` intentionally remains owned by `distribution_throughput_runtime`, because throughput must preserve its due-research release and IndexNow timestamp-normalization stages around the autonomous cycle;
- `distribution-throughput-worker.js` now composes `handleAutonomousDistributionRoute` directly for autonomous refresh instead of reaching it through decorator traversal;
- generic request fallback now connects directly to `distribution-submission-worker.js`;
- the compatibility default export remains available in the autonomous worker for isolated callers;
- the architecture edge budget ratchets from 16 to 15.

Preservation rule:
No autonomous-cycle mission ledger semantics, qualification logic, Human Gate handling, placement verification, authority recovery, IndexNow pre/post processing or submission execution behavior changes in this phase. The change is routing and explicit composition only.


## Phase 91 - Explicit Distribution Submission ownership

Status: implemented on `architecture/toolscout-2.0-phase-91-resume`.

Implemented:
- `POST /api/distribution/submissions/package`, `POST /api/distribution/submissions/verify` and `GET /api/distribution/submissions` are declared under the explicit `distribution_submission_runtime` owner;
- `POST /api/distribution/submissions/execute` deliberately remains under `distribution_throughput_runtime` so adaptive IndexNow delivery and timestamp normalization continue to wrap canonical submission execution;
- `distribution-throughput-worker.js` composes `handleDistributionSubmissionRoute` directly for execute and package prework, and composes `runDistributionSubmissionScheduled` for compatibility cron behavior;
- generic request fallback now connects directly to `distribution-discovery-worker.js`;
- the architecture edge budget ratchets from 15 to 14.

Preservation rule:
No submission packaging, adapter policy, authentication, retry, verification, IndexNow, scheduling or response semantics change in this phase. Only ownership and explicit composition replace decorator traversal.


## Phase 92 - Explicit Distribution Discovery ownership

Status: implemented on `architecture/toolscout-2.0-phase-92`.

Implemented:
- `POST /api/distribution/discovery/refresh` is declared under the explicit `distribution_discovery_runtime` owner;
- `distribution-discovery-worker.js` exports both the direct HTTP handler and its compatibility scheduler;
- `distribution-autonomous-worker.js` calls the discovery handler directly when the autonomous cycle requests replenishment instead of reaching it through decorator traversal;
- `distribution-submission-worker.js` composes the discovery scheduler directly before submission package/execute/verify work, preserving the previous scheduled ordering;
- generic request fallback now connects directly to `distribution-learning-worker.js`;
- the architecture edge budget ratchets from 14 to 13.

Preservation rule:
No discovery sources, recursive-source learning, surface scoring, technical-host suppression, family-learning boosts, authorization, autonomous replenishment or periodic discovery behavior changes in this phase. Only ownership and explicit composition replace decorator traversal.


## Phase 93 - Explicit Distribution Learning ownership

Status: implemented on `architecture/toolscout-2.0-phase-93`.

Implemented:
- `POST|OPTIONS /api/distribution/embed-event` and `POST /api/distribution/learning/refresh` are declared under the explicit `distribution_learning_runtime` owner;
- the public embed-event preflight remains public, while learning refresh retains its admin-token boundary;
- `distribution-learning-worker.js` exports explicit HTTP and scheduled handlers;
- `distribution-discovery-worker.js` composes the learning scheduler directly before discovery work;
- generic request fallback now connects directly to `distribution-sender-worker.js`;
- the architecture edge budget ratchets from 13 to 12.

Preservation rule:
No embed attribution, likely-human classification, confirmed-revenue evidence, learning snapshot semantics, CORS behavior, authorization or scheduled ordering changes in this phase. Only ownership and explicit composition replace decorator traversal.


## Phase 94 - Distribution Sender schema completion

Status: implemented on `architecture/toolscout-2.0-phase-94`.

Implemented:
- runtime DDL is removed from `distribution-sender-worker.js`;
- existing migration ownership is reused for `distribution_network_outreach` (0078), `growth_action_events` (0103), and outbound reputation tables (0101);
- migration `0106_distribution_sender_schema_completion.sql` formally owns the remaining `idx_reputation_learning_lookup` index;
- sender runtime now probes the required migrated tables and indexes and fails closed with explicit migration errors if ownership is incomplete;
- CI and recovery syntax-check the sender runtime and enforce migration ownership.

Why this phase is separate:
`distribution-sender-worker.js` is the next legacy decorator, but it also owns outbound reputation and public handoff behavior. Runtime schema mutation is removed first so the later routing phase changes dispatch only.

Preservation rule:
No email throughput target, reputation filter, owner override learning, public handoff authentication, vendor/network leasing, execution proof or outreach state transition changes in this phase.


## Phase 95 - Explicit Distribution Sender ownership

Status: implemented on `architecture/toolscout-2.0-phase-95`.

Implemented:
- the two sender GET surfaces and four sender POST mutation surfaces are declared under the explicit `distribution_sender_runtime` owner;
- both integration-token and public-handoff authentication boundaries are preserved;
- the public-candidates path continues to refresh contact discovery through the lower contact runtime before leasing outbound candidates;
- generic request fallback now connects directly to `distribution-contact-worker.js`;
- sender compatibility export remains available for isolated callers;
- the architecture edge budget ratchets from 12 to 11.

Preservation rule:
No email throughput target, reputation filter, owner override learning, public handoff authentication, vendor/network leasing, contact refresh, execution proof or outreach state transition changes in this phase. Only route ownership and generic traversal change.


## Phase 96 - Explicit Distribution Contact ownership

Status: implemented on `architecture/toolscout-2.0-phase-96`.

Implemented:
- `POST /api/distribution/vendor-amplification/contact-scan` and `POST /api/distribution/vendor-amplification/status` are declared under the explicit `distribution_contact_runtime` owner;
- `GET /api/distribution/vendor-amplification/ready` remains owned by `distribution_sender_runtime`, preserving the sender lease semantics that previously shadowed the lower contact route;
- `GET /api/stats` remains owned by `admin_stats`, avoiding duplicate ownership;
- sender public-candidates now composes `handleDistributionContactRoute` directly for contact refresh;
- learning scheduling composes `runDistributionContactScheduled` directly so periodic vendor contact discovery is preserved;
- generic and compatibility fallbacks now connect directly to `distribution-vendor-worker.js`;
- the architecture edge budget ratchets from 11 to 10.

Preservation rule:
No vendor contact scanning, public-role-email selection, fallback exhaustion, sender leasing, stats ownership, integration authentication or scheduled contact discovery semantics change in this phase.


## Phase 97 - Explicit Distribution Vendor ownership

Status: implemented on `architecture/toolscout-2.0-phase-97`.

Implemented:
- `GET /api/distribution/vendor-amplification` and `POST /api/distribution/vendor-amplification/refresh` are declared under the explicit `distribution_vendor_runtime` owner;
- `GET /api/stats` remains owned by `admin_stats`; contact compatibility composition still enriches the upstream stats response with vendor amplification state without claiming the route;
- contact scheduling composes `runDistributionVendorScheduled` before vendor contact discovery, preserving refresh-before-contact ordering;
- generic and compatibility fallbacks now connect directly to `distribution-radar-worker.js`;
- the architecture edge budget ratchets from 10 to 9.

Preservation rule:
No vendor opportunity generation, Search Console prioritization, asset/tool coherence suppression, queue contents, admin authentication, scheduled refresh ordering or stats enrichment semantics change in this phase.


## Phase 98 - Explicit Distribution Radar ownership

Status: implemented on `architecture/toolscout-2.0-phase-98`.

Implemented:
- `POST /api/distribution/radar/refresh` is declared under the explicit `distribution_radar_runtime` owner;
- `GET /api/distribution/feed.json` and `GET /api/distribution/feed.xml` deliberately remain owned by `traffic_integrity_live`, preserving the prioritized production feed implementation and its public access boundary;
- vendor scheduling composes `runDistributionRadarScheduled` before vendor amplification refresh, preserving radar-before-vendor ordering;
- generic and compatibility fallbacks now connect directly to `distribution-engine-worker.js`;
- the architecture edge budget ratchets from 9 to 8.

Preservation rule:
No syndication feed selection, Search Console priority ordering, opportunity scoring, configured status resolution, radar authentication, event recording or scheduled refresh ordering changes in this phase.


## Phase 99 - Explicit Distribution Engine ownership

Status: implemented on `architecture/toolscout-2.0-phase-99`.

Implemented:
- `POST /api/distribution-event` is declared under the explicit `distribution_engine_runtime` owner;
- `GET /api/stats` deliberately remains owned by `admin_stats`, preserving the current protected read-only stats composition;
- Command Center HTML routes, including `/analytics.html`, deliberately remain owned by `command_center_direct`;
- generic and compatibility fallbacks now connect directly to `audience-worker.js`;
- the legacy distribution-engine stats and analytics decorators remain only as isolated compatibility code and are no longer part of production request traversal;
- the architecture edge budget ratchets from 8 to 7.

Preservation rule:
No distribution event ingestion, stats authentication, Command Center ownership, distribution KPI truth, analytics UI ownership, or scheduler semantics change in this phase.


## Phase 100 - Explicit Audience Engine ownership

Status: implemented on `architecture/toolscout-2.0-phase-100`.

Implemented:
- the six active Audience Engine API surfaces are declared under the explicit `audience_runtime` owner;
- public capability and Bluesky health surfaces remain public;
- Bluesky reply preparation preserves the existing audience-ingest token boundary;
- DEV comment and Bluesky event surfaces retain their public-evidence verification logic before persistence;
- `GET /api/stats` remains owned by `admin_stats`, and Command Center HTML remains owned by `command_center_direct`;
- generic and compatibility fallbacks now connect directly to `affiliate-workflow-worker.js`;
- the architecture edge budget ratchets from 7 to 6.

Preservation rule:
No social-platform capability policy, Bluesky reply semantic guard, DEV comment verification, audience event truth, stats ownership, Command Center ownership, or scheduler semantics change in this phase.

### Phase 101 - affiliate workflow traversal removal

Direct-own the affiliate and distribution workflow control surfaces while preserving their existing behavior and the canonical `/go/` affiliate redirect owner. The generic compute fallback now skips `affiliate-workflow-worker.js` and enters `revenue-worker.js` directly. Directly owned runtime modules that previously bypassed to the affiliate workflow wrapper now bypass to revenue as well. The architecture ratchet moves from 6 to 5 legacy edges.

### Phase 102 - revenue traversal removal

Remove `revenue-worker.js` from the generic compute traversal while retaining it as a bounded internal compatibility layer for the protected admin stats composition. The canonical `/api/stats` and Command Center surfaces remain directly owned by ToolScout 2.0, and the protected stats chain continues to preserve revenue, commercial, traffic and tracking enrichments. The architecture ratchet moves from 5 to 4 legacy edges.


### Phase 103 - catalog autonomy traversal removal

Status: implemented and merged.

Implemented:
- catalog-autonomy control and inventory routes are explicitly owned by `catalog_autonomy_runtime`;
- `catalog-autonomy-worker.js` is no longer traversed for unrelated requests;
- the generic runtime chain ratcheted from 4 to 3 edges.

Preservation rule:
Public catalog, canonical URLs, affiliate redirects and Command Center ownership remain unchanged.

### Phase 104 - dynamic traversal removal

Status: implemented and merged.

Implemented:
- dynamic tracking, content signals and robots behavior are direct-owned;
- unrelated public requests no longer traverse `dynamic-worker.js`;
- the generic runtime chain ratcheted from 3 to 2 edges.

Preservation rule:
Tracking, sitemap/canonical behavior, public decision pages and affiliate routing remain behaviorally preserved.

### Phase 105 - funnel traversal removal

Status: implemented and merged.

Implemented:
- funnel ingestion remains explicitly owned at `/api/events`;
- protected stats compatibility remains bounded instead of forming the generic request path;
- generic public requests bypass the funnel wrapper and reach the core runtime directly;
- the generic runtime chain ratcheted from 2 to 1 edge.

Preservation rule:
Traffic-integrity gating, event persistence semantics and protected stats composition remain intact.

### Phase 106 - zero legacy traversal

Status: implemented and merged to `main` at commit `679d2cf21a70cf7d4ddb69b16a04a85f8dc92c8e`.

Implemented:
- the final generic `compute-router-worker.js -> worker.js` traversal edge is removed;
- generic public responses start from the Cloudflare ASSETS binding and then pass through explicit response transforms;
- `core_runtime` directly owns the remaining core control behavior;
- architecture audit now enforces `MAX_LEGACY_EDGES=0` and 100% declared route ownership;
- public analytics consent and traffic/browser guards are explicitly preserved after the zero-edge cutover.

Production rule:
Phase 106 is not considered deployed merely because it is merged. Production closure requires the Phase 107 fingerprint and post-deploy smoke to succeed against the live site.

### Phase 107 - production closure and growth proof

Status: implemented, merged and verified live in production.

Implemented:
- `GET /api/runtime/closure-health` exposes a read-only deployment fingerprint for ToolScout 2.0;
- the fingerprint reports Phase 107, zero legacy edges, declared route coverage and architecture-closure state;
- the closure endpoint has explicit `toolscout_v2_closure` ownership ahead of the generic `/api/runtime/` control prefix;
- the post-deploy live smoke now fails unless the exact Phase 107 fingerprint is present in production;
- the generic zero-edge path is named `publicAssetPipeline` rather than a legacy fallback, and unmatched routes are described as compute-owned public asset pipeline traffic;
- CI and recovery deploy validation include the closure runtime and regression tests.

Exit criterion:
ToolScout 2.0 architecture is considered production-closed only when the live closure endpoint reports `legacyEdges: 0`, `directCoveragePct: 100`, no legacy-declared route groups, and the full live preservation smoke passes. After that point, optimization work is measured primarily by strict verified humans, search visibility, independent referring domains, qualified outbound activity and monetization evidence rather than migration phase count.


### Phase 108 - controlled production cutover

Status: completed successfully on 2026-10-02.

Implemented:
- a one-time guarded push trigger was added to the existing Cloudflare recovery workflow;
- the trigger was scoped to the Phase 108 merge commit only, so unrelated future pushes could not mutate production;
- the full ToolScout 2.0 validation, D1 migration pass, Worker deployment and live preservation smoke were executed in one bounded production cutover.

Production result:
- migrations `0101` through `0106` applied successfully to the remote ToolScout D1 database;
- Cloudflare Worker deploy completed successfully;
- deployed Worker version: `278fdd59-e420-4f19-b017-b7f44d6cf41f`;
- live preservation smoke passed at `2026-10-02T10:08:44.743Z`;
- 176 sitemap URLs, 13 critical pages, 141 decision pages and 7 navigation hubs were verified;
- smoke result: 0 errors, 0 warnings;
- the Phase 107 deployment fingerprint was therefore observed live, proving zero legacy traversal and complete declared route ownership in production.

### Phase 109 - re-arm manual recovery

Status: implemented on `architecture/toolscout-2.0-phase-109-rearm-manual-recovery`.

Implemented:
- the temporary Phase 108 push trigger is removed immediately after the successful cutover;
- the recovery workflow returns to explicit `workflow_dispatch` only;
- production safety returns to the prior Cloudflare-first posture, with GitHub recovery available only when deliberately invoked.

Exit state:
The ToolScout 2.0 architectural migration is production-closed. Subsequent work should prioritize operational growth outcomes and engine reliability rather than further wrapper-removal phases.

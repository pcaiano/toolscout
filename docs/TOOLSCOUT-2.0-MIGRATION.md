# ToolScout 2.0 Migration Status

Last updated: 2026-09-30

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

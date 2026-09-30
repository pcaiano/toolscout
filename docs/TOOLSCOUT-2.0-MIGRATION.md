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

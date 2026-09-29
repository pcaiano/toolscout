# ToolScout 2.0 Migration Status

Last updated: 2026-09-29

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

Branch: architecture/toolscout-2.0

Pull request: #168

The PR remains draft until targeted CI passes and the migration/deployment order is safe.


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

Still deliberately legacy:
- analytics/statistics augmentation beyond the direct Command Center reads;
- `/go/*` commercial redirect implementation;
- dynamic/static tool profile composition;
- remaining machine discovery catalog endpoints.

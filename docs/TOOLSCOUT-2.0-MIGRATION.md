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

Status: started.

Implemented:
- migration 0086 owns compute overflow, contact-supply and auth-capability schema/index creation;
- compute-router no longer executes CREATE TABLE or CREATE INDEX at runtime;
- runtime now verifies that the migrated control-plane schema exists.

Still to do:
- replace remaining implicit worker-decorator chains with explicit route ownership;
- centralize scheduler ownership;
- identify and retire redundant Command Center truth/integrity wrappers after parity verification;
- separate public serving dependencies from growth/control dependencies where the current chain still couples them.

## Phase 4 - Command Center simplification

Status: not started in code.

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

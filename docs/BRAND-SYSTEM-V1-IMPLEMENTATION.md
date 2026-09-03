# ToolScout Brand System v1 — implementation checkpoint

Status: **DRAFT PR / NOT LIVE**

Branch: `brand-v1-redesign`

Pull request: #9

## Approved direction

Brand Book v1.0 is the visual and verbal source of truth. The approved homepage direction is intentionally restrained: quiet charisma, editorial authority, large negative space, minimal information up front, and Signal Lime used only for meaningful actions or states.

The right side of the homepage hero is deliberately left empty. It must not be filled with a giant ToolScout mark, process diagram, decorative particles or tool inventory. The space can later support first-party ToolScout editorial/video content without requiring a homepage redesign.

Provider-domain favicons are the approved tool-mark strategy. Do not generate, redraw, recolor or stylistically normalize vendor logos.

## Implemented in PR #9

- shared `brand-system.css` design tokens and reusable components;
- homepage redesigned around `Find the right tool. Faster.` with the existing recommendation and guided-choice hooks preserved;
- live recommendation states styled without changing `app.js` recommendation logic;
- public Tool evidence/catalog, Categories, Compare, Guides and Journal surfaces aligned to the Brand System;
- institutional Methodology, Affiliate Disclosure and Privacy surfaces aligned to Brand v1;
- all category landing pages aligned to Brand v1;
- Brand v1 generators now persist buying guides, tool profiles, direct comparisons, acquisition content, Guides index and Journal output;
- Journal and Guides indexes retain static HTML links for crawlability/indexability; JavaScript is used only for filtering where applicable;
- deploy-time public-navigation normalization preserves Brand v1-owned navigation and skips private operational surfaces;
- Command Center and Analytics Admin redesigned as dark operational surfaces with existing analytics/revenue logic and APIs preserved;
- Affiliate Operations, Distribution Workflow and Opportunity Matrix aligned to the same operational system;
- Opportunity Matrix affiliate coverage semantics corrected so per-intent status is derived from the tools that actually received observed non-owner clicks and their current affiliate state, instead of comparing intent slugs with tool slugs;
- production/commercial smoke expectations updated to match the Brand v1 comparison language and structure;
- AdCreative.ai affiliate routing added to the redesign branch after production activation, using the verified custom `free-trial.adcreative.ai` referral route; validator support was added for this vendor-specific tracking format.

## Deliberately unchanged

- Worker routing and production composition except for the Opportunity Matrix analytics payload correction required to make its labels semantically accurate;
- D1 schema and migrations;
- recommendation scoring and catalog data;
- `/go/:slug` affiliate routing model;
- immutable click-time monetization semantics;
- analytics event semantics and audience classification;
- protected dashboard API endpoints;
- historical/legacy dashboard semantics;
- provider-domain favicon lookup behavior.

## Current repository state

`main` advanced after the redesign branch was created. The latest production-side change observed on 2026-09-03 activated the AdCreative.ai affiliate route and updated its affiliate pipeline status. The redesign branch has been updated with the same live affiliate routing entry and its Brand v1 SEO/public-surface validation now accepts the verified AdCreative.ai custom referral URL.

Generated SEO/navigation assets also changed on `main` after the redesign branch diverged. Those generated legacy/public changes must not overwrite Brand v1. Before final merge, reconcile the latest `main` into the redesign branch with Brand v1 winning visual/generated-file conflicts while preserving newer production data and affiliate state.

The redesign itself remains **not deployed**.

## Validation completed

- catalog data validation: PASS;
- intent coverage validation: PASS;
- SEO generation/validation: PASS;
- public-surface validation: PASS after adding AdCreative.ai custom referral validation;
- commercial indexability/internal-link validation: PASS;
- 100 tool profiles / 38 core intents / 15 direct comparisons covered by the commercial gate;
- Brand v1 generated-surface smoke checks: PASS;
- comparison generator Brand v1 checks: PASS;
- deploy-time navigation preservation checks: PASS;
- Opportunity Matrix worker syntax and semantic regression checks: PASS;
- latest SEO workflow after AdCreative.ai sync: PASS.

## Remaining release gate

Before merge/deploy:

1. reconcile the latest `main` changes into `brand-v1-redesign` without losing Brand v1 generated/public surfaces or newer affiliate data;
2. review homepage and representative public pages in a real browser at desktop and mobile widths against the approved V5 direction;
3. verify recommendation input, guided flow, results and `/go/:slug` outbound behavior;
4. verify Tool search, Categories links, Guides/Journal filters and Compare selectors/outbound links;
5. verify Command Center and Analytics Admin secure runtime load;
6. verify Affiliate Operations filtering/action links and current affiliate state, including AdCreative.ai;
7. verify Distribution status/note writes and copy-pack action;
8. verify Opportunity Matrix runtime payload and per-intent coverage labels against production-shaped data;
9. run final repository CI/syntax checks after main reconciliation;
10. obtain explicit human approval before merge/deploy;
11. only after merge, run production smoke checks.

Keep PR #9 draft until these gates pass.

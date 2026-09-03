# ToolScout Brand System v1 — implementation checkpoint

Status: **DRAFT PR / NOT LIVE**

Branch: `brand-v1-redesign`

Pull request: #9

Current reviewed head: `c4126434d55a907783daef7c38b150eb416ff189`

## Approved direction

Brand Book v1.0 is the visual and verbal source of truth. The approved homepage direction is intentionally restrained: quiet charisma, editorial authority, large negative space, minimal information up front, and Signal Lime used only for meaningful actions or states.

The right side of the homepage hero is deliberately left empty. It must not be filled with a giant ToolScout mark, process diagram, decorative particles or tool inventory. The space can later support first-party ToolScout editorial/video content without requiring a homepage redesign.

Provider-domain favicons are the approved tool-mark strategy for catalog/profile surfaces. Do not generate, redraw, recolor or stylistically normalize vendor logos.

The approved homepage trust line is exact: `100% independent. No sponsored rankings.`

## Implemented in PR #9

- shared `brand-system.css` design tokens and reusable components;
- homepage redesigned around `Find the right tool. Faster.` with the existing recommendation and guided-choice hooks preserved;
- live recommendation states styled without changing `app.js` recommendation logic;
- recommendation-result pricing, profile and feature metadata visually quieted after user intent is expressed, without changing scoring, tracking, catalog evidence or `/go/:slug` behavior;
- public Tools, Categories, Compare and Guides surfaces aligned to the Brand System;
- Journal index and generated editorial articles converted to Brand v1 with static indexable links;
- buying-guide, tool-profile, comparison and acquisition generators converted to Brand v1;
- tool-profile capability data retained but reduced from pill/chip UI to a quiet editorial capability line, preserving the underlying catalog information without visual clutter;
- buying-guide and direct-comparison interaction targets aligned with the Brand Book accessibility rule: primary actions, profile links, nav links, decision links and FAQ summaries expose at least 44px touch/click height without adding visual weight;
- homepage navigation, editorial links, footer links and guided-choice control also expose at least 44px interaction height;
- generated Brand v1 SEO/blog/tool-profile/comparison assets are persisted on `brand-v1-redesign`, so branch review reflects the actual generated release surface before merge;
- institutional pages and seven category landing pages converted to Brand v1;
- Command Center and Analytics Admin redesigned as dark operational surfaces with existing analytics/revenue JS and APIs preserved;
- Affiliate Operations, Distribution Workflow and Opportunity Matrix aligned to the same operational system;
- Opportunity Matrix affiliate coverage semantics corrected so per-intent status is derived from observed clicked tools against current affiliate coverage while historical click-time monetization remains immutable;
- deploy-time public-navigation normalization protects Brand v1-owned navigation and skips private operational surfaces;
- production/commercial smoke expectations aligned with Brand v1 comparison language and structure;
- public-surface validation recognizes the verified AdCreative.ai custom referral host format.

## Generation and validation hardening

The redesign review uncovered several generation-path risks that could have reintroduced legacy presentation or produced noisy generated commits. Those paths are now hardened:

- Brand v1 PR validation mirrors the release-generation sequence and fails if regeneration leaves any unpersisted generated-file drift;
- the final `Require clean generated surface` gate is mandatory and currently passes;
- SEO asset persistence and PR validation use aligned generation and public-navigation normalization sequences;
- changes to `.github/workflows/seo-pages.yml` trigger Brand v1 PR validation;
- the SEO pipeline no longer runs the redundant `build-blog-topics.mjs` writer immediately before `generate-blog.mjs`;
- Journal topic, distribution queue and growth-priority report writers preserve `generatedAt` when their substantive derived payload is unchanged;
- Search Console sync still performs a fresh external check, but preserves snapshot `generatedAt` when the returned GSC snapshot is unchanged, avoiding timestamp-only repository churn while retaining material changes;
- Journal and Guides generated indexes retain static HTML links for crawlability/indexability, with JavaScript used only as progressive filtering where applicable;
- deploy-time navigation normalization no longer overwrites Brand v1-owned navigation or private operational navigation.

## Production-state reconciliation

After the redesign branch was created, `main` advanced by five commits. Review of those commits shows that three were generated SEO/navigation persistence commits and two carried the AdCreative.ai affiliate activation state.

The production source-of-truth affiliate changes are mirrored into `brand-v1-redesign`:

- `data/affiliate.json` matches current `main`, including the enabled verified AdCreative.ai custom referral URL;
- `data/affiliate-pipeline.json` matches current `main`, including AdCreative.ai status `active`, 30% commission note, approval evidence and current follow-up guidance;
- the Brand v1 AdCreative.ai profile continues to route through `/go/adcreative-ai`, keeping editorial UI independent from the private referral destination;
- generated SEO/navigation outputs remain Brand v1-owned rather than copying the legacy generated presentation from `main`.

The current `main` head is recorded as a parent of the redesign branch without changing the approved Brand v1 tree. The branch is therefore **0 commits behind `main`**, the merge base is the current production head, and PR #9 is mergeable. This resolves the Git-level reconciliation gate while preserving both the newer production commercial state and the Brand v1 generated/visual outputs.

## Validation state

Current automated validation state on head `c4126434…`:

- Brand v1 PR validation: **SUCCESS**;
- all 21 validation steps: PASS;
- catalog data validation: PASS;
- intent coverage validation: PASS;
- worker syntax validation: PASS;
- SEO page generation/validation: PASS;
- public-surface validation: PASS, including AdCreative.ai custom referral validation;
- commercial indexability + internal-link validation: PASS;
- 100 tool profiles / 38 core intents / 15 direct comparisons validated;
- quieter capability-line tool profiles regenerated and persisted across the 100-tool profile surface;
- Brand v1 44px interaction-target pass applied to generated buying guides, direct comparisons and homepage interaction surfaces;
- quiet recommendation-result metadata override: PASS without changing recommendation runtime contracts;
- Brand v1 generated-surface smoke checks: PASS;
- comparison generator Brand v1 checks: PASS;
- deploy-time navigation preservation checks: PASS;
- Opportunity Matrix worker syntax and semantic regression checks: PASS;
- zero generated drift gate: PASS;
- branch/base reconciliation: PASS — current `main` is contained in redesign history and PR #9 is mergeable.

## Deliberately unchanged

- D1 schema and historical data;
- recommendation scoring and catalog data;
- `/go/:slug` public affiliate-routing contract;
- analytics event semantics and audience classification;
- protected dashboard API endpoints;
- historical/legacy dashboard semantics.

## Remaining release gates

Automated structural and generated-surface gates are substantially closed. The remaining gates require execution or visual inspection rather than more speculative source edits:

1. review homepage and representative generated/public surfaces in a real browser at desktop and mobile widths against the approved V5 direction;
2. verify recommendation input, guided flow, results, keyboard behavior and outbound links at runtime;
3. verify Tools search, Categories links and Compare selectors/outbound links at runtime;
4. verify Command Center and Analytics Admin secure load against private APIs;
5. verify Affiliate Operations filtering/action links;
6. verify Distribution status/note writes and copy-pack action;
7. verify Opportunity Matrix secure load and its per-intent `affiliateCoverage.intentCoverage` payload against production-shaped/private data;
8. run final repository CI/syntax checks after any runtime/visual review fixes;
9. obtain explicit human approval before merge/deploy;
10. after merge only, run production smoke and verify the live public/private surfaces.

Keep the branch/PR draft until the visual and runtime review is accepted. Do not merge or deploy from this checkpoint without explicit approval.

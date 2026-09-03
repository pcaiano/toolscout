# ToolScout Brand System v1 — implementation checkpoint

Status: **DRAFT PR / NOT LIVE**

Branch: `brand-v1-redesign`

Pull request: #9

## Approved direction

Brand Book v1.0 is the visual and verbal source of truth. The approved homepage direction is intentionally restrained: quiet charisma, editorial authority, large negative space, minimal information up front, and Signal Lime used only for meaningful actions or states.

The right side of the homepage hero is deliberately left empty. It must not be filled with a giant ToolScout mark, process diagram, decorative particles or tool inventory. The space can later support first-party ToolScout editorial/video content without requiring a homepage redesign.

Provider-domain favicons are the approved tool-mark strategy for catalog/profile surfaces. Do not generate, redraw, recolor or stylistically normalize vendor logos.

## Implemented in PR #9

- shared `brand-system.css` design tokens and reusable components;
- homepage redesigned around `Find the right tool. Faster.` with the existing recommendation and guided-choice hooks preserved;
- live recommendation states styled without changing `app.js` recommendation logic;
- public Tools, Categories, Compare and Guides surfaces aligned to the Brand System;
- Journal index and generated editorial articles converted to Brand v1 with static indexable links;
- buying-guide, tool-profile, comparison and acquisition generators converted to Brand v1;
- tool-profile capability data retained but reduced from pill/chip UI to a quiet editorial capability line, preserving the underlying catalog information without visual clutter;
- buying-guide and direct-comparison interaction targets aligned with the Brand Book accessibility rule: primary actions, profile links, nav links, decision links and FAQ summaries now expose at least 44px touch/click height without adding visual weight;
- generated Brand v1 SEO/blog/tool-profile/comparison assets are persisted on `brand-v1-redesign`, so branch review reflects the actual generated release surface before merge;
- institutional pages and seven category landing pages converted to Brand v1;
- Command Center and Analytics Admin redesigned as dark operational surfaces with existing analytics/revenue JS and APIs preserved;
- Affiliate Operations, Distribution Workflow and Opportunity Matrix aligned to the same operational system;
- Opportunity Matrix affiliate coverage semantics corrected so per-intent status is derived from observed clicked tools against current affiliate coverage while historical click-time monetization remains immutable;
- deploy-time public-navigation normalization protects Brand v1-owned navigation and skips private operational surfaces;
- production/commercial smoke expectations aligned with Brand v1 comparison language and structure;
- public-surface validation recognizes the verified AdCreative.ai custom referral host format.

## Production-state reconciliation

After the redesign branch was created, `main` advanced by five commits. Review of those commits shows that three were generated SEO/navigation persistence commits and two carried the AdCreative.ai affiliate activation state.

The production source-of-truth affiliate changes are now mirrored into `brand-v1-redesign`:

- `data/affiliate.json` matches current `main`, including the enabled verified AdCreative.ai custom referral URL;
- `data/affiliate-pipeline.json` matches current `main`, including AdCreative.ai status `active`, 30% commission note, approval evidence and current follow-up guidance;
- the Brand v1 AdCreative.ai profile continues to route through `/go/adcreative-ai`, keeping editorial UI independent from the private referral destination;
- generated SEO/navigation differences are intentionally not copied from `main`; Brand v1 generators are the desired source for those outputs.

The branch is still Git-history-diverged from `main`, so GitHub reports it as not mergeable until the generated-file conflicts are formally resolved. That is a release-preparation issue, not an unresolved affiliate-data gap.

## Validation state

- catalog data validation: PASS;
- intent coverage validation: PASS;
- SEO page generation/validation: PASS;
- public-surface validation: PASS, including AdCreative.ai custom referral validation;
- commercial indexability + internal-link validation: PASS;
- 100 tool profiles / 38 core intents / 15 direct comparisons validated;
- quieter capability-line tool profiles regenerated and persisted across the 100-tool profile surface;
- Brand v1 44px interaction-target pass applied to generated buying guides and direct comparisons;
- Brand v1 generated-surface smoke checks: PASS;
- comparison generator Brand v1 checks: PASS;
- deploy-time navigation preservation checks: PASS;
- Opportunity Matrix worker syntax and semantic regression checks: PASS;
- latest `Generate SEO Pages` run after the accessibility pass: PASS, including generated-asset persistence.

## Deliberately unchanged

- D1 schema and historical data;
- recommendation scoring and catalog data;
- `/go/:slug` public affiliate-routing contract;
- analytics event semantics and audience classification;
- protected dashboard API endpoints;
- historical/legacy dashboard semantics.

## Release gate

Before merge/deploy:

1. resolve Git-level divergence with latest `main`, preserving Brand v1 generated/visual outputs and current production data state;
2. review homepage desktop and mobile against the approved V5 direction;
3. verify recommendation input, guided flow, results and outbound links;
4. verify Tools search, Categories links and Compare selectors/outbound links;
5. verify Command Center secure load and Content Engine source panels;
6. verify Affiliate Operations filtering/action links;
7. verify Distribution status/note writes and copy-pack action;
8. verify Opportunity Matrix secure load and its per-intent affiliate coverage payload against production-shaped data;
9. run final repository CI/syntax checks;
10. obtain explicit human approval before merge/deploy.

Keep the branch/PR draft until the visual and runtime review is accepted.

# ToolScout Brand System v1 — implementation checkpoint

Status: **DRAFT PR / NOT LIVE**

Branch: `brand-v1-redesign`

Pull request: #9

## Approved direction

Brand Book v1.0 is the visual and verbal source of truth. The approved homepage direction is intentionally restrained: quiet charisma, editorial authority, large negative space, minimal information up front, and Signal Lime used only for meaningful actions or states.

The right side of the homepage hero is deliberately left empty. It must not be filled with a giant ToolScout mark, process diagram, decorative particles or tool inventory. The space can later support first-party ToolScout editorial/video content without requiring a homepage redesign.

Tool/vendor marks must continue to use provider-origin assets already supported by the product. Do not generate, redraw, recolor or stylistically normalize vendor logos.

## Implemented in PR #9

- shared `brand-system.css` design tokens and reusable components;
- homepage redesigned around `Find the right tool. Faster.` with the existing recommendation and guided-choice hooks preserved;
- live recommendation states styled without changing `app.js` recommendation logic;
- public Tools, Categories and Compare surfaces aligned to the Brand System;
- Command Center redesigned as a dark operational surface with the existing analytics/revenue JS and API preserved;
- Affiliate Operations, Distribution Workflow and Opportunity Matrix aligned to the same operational system without changing their API routes or mutation logic.

## Deliberately unchanged

- Worker routing and composition;
- D1 schema and data;
- recommendation scoring and catalog data;
- `/go/:slug` affiliate routing;
- analytics event semantics and audience classification;
- protected dashboard API endpoints;
- historical/legacy dashboard semantics;
- generated tool/vendor marks and external provider-domain asset lookup behavior.

## Release gate

Before merge/deploy:

1. review homepage desktop and mobile against the approved V5 direction;
2. verify recommendation input, guided flow, results and outbound links;
3. verify Tools search, Categories links and Compare selectors/outbound links;
4. verify Command Center secure load and Content Engine source panels;
5. verify Affiliate Operations filtering/action links;
6. verify Distribution status/note writes and copy-pack action;
7. verify Opportunity Matrix secure load;
8. run repository CI/syntax checks and post-deploy smoke if merged;
9. keep the branch/PR draft until the visual review is accepted.

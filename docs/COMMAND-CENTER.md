# ToolScout Command Center

## Purpose

This file is the canonical operational memory for ToolScout. It exists to keep project state coherent across ChatGPT chats, Work, Codex, GitHub sessions, and human actions.

It is not a replacement for technical source-of-truth files such as `AGENTS.md` or `docs/PRODUCTION-BASELINE.md`. Instead, it is the current operational layer: what is live, what is monetized, what needs human action, what belongs in growth work, and what is worth spending Work/Codex credits on.

## Mandatory startup sequence

Before planning or executing ToolScout work, read in this order:

1. `AGENTS.md`
2. `docs/PRODUCTION-BASELINE.md`
3. `docs/COMMAND-CENTER.md`
4. Any mission-specific or subsystem-specific documentation referenced by those files

Do not rely on memory from previous chats, Work sessions, Codex runs, or stale checkpoints when repository state can be inspected.

## Operating model

ToolScout work is split into three layers:

### 1. COMMAND CENTER

Default location: normal ChatGPT conversation.

Use for:

- project status and prioritization;
- affiliate research, applications, approvals, and referral-link tracking;
- distribution-platform research and submission planning;
- SEO and Search Console analysis;
- traffic and acquisition analysis;
- catalog research and commercial prioritization;
- credential-dependent workflows requiring the owner;
- preparing batches of technical work for later execution;
- reviewing outcomes and deciding next actions.

### 2. EXECUTION

Default location: Work/Codex only when repository/filesystem/terminal/tests/deploys are genuinely required.

Use for:

- code changes;
- migrations;
- repository-wide refactors;
- automated tests;
- production deploys;
- infrastructure changes;
- large catalog/content imports when code or generated assets must be changed;
- implementation of already-decided technical batches.

Rule: do not spend Work/Codex credits on strategy, research, application workflows, credential collection, manual distribution, copywriting, prioritization, or analysis that can be done in the Command Center.

### 3. SOURCE OF TRUTH

Default location: GitHub.

GitHub is the durable project memory. Important operational changes must be reconciled into repository documentation/data so that a new chat or agent can reconstruct current state without relying on conversational memory.

## Current strategic priority

Primary objective: generate revenue as quickly as possible by increasing qualified traffic, affiliate coverage, distribution, and commercially relevant catalog depth.

Current priority order:

1. Traffic growth
2. Affiliate activation and coverage
3. Distribution
4. Revenue measurement
5. Catalog expansion focused on commercial intent
6. Product/development work only when it materially supports the above or fixes a production issue

The default growth loop is:

`traffic -> qualified sessions -> recommendations -> outbound clicks -> affiliate conversions -> revenue`

Primary business metrics:

- organic impressions;
- organic clicks;
- genuine sessions;
- recommendation completions;
- outbound clicks;
- affiliate-covered outbound clicks;
- affiliate CTR;
- vendor conversions;
- confirmed/paid commission;
- revenue per 1,000 genuine non-owner sessions when evidence is available.

## Current production state

- Public domain: `trytoolscout.org`
- Repository: `pcaiano/toolscout`
- Worker: `toolscout`
- D1: `toolscout`
- D1 ID: `cac6bc3c-d838-4edd-ba29-597030afb397`
- Active production architecture and migration baseline are documented in `docs/PRODUCTION-BASELINE.md`.
- M01 acceptance is documented as complete in the production baseline.
- Do not assume old mission checkpoints remain valid if `main` has moved forward; reconcile against current repository state before resuming them.

## Affiliate status

Canonical operational affiliate state is stored in `data/affiliate-pipeline.json` and active redirect configuration in `data/affiliate.json`.

The private Affiliate Workflow is now the catalog-first Affiliate Operations Engine. It resolves all 100 catalog tools to one normalized state and one next action, keeps affiliate opportunity scoring separate from editorial ranking, exposes Human Actions Required first, and reports raw and traffic-weighted monetization coverage. D1 migration `0013_affiliate_operations_engine.sql` adds normalized operational metadata, append-only state history/evidence, and the Direct/Dub/Impact/PartnerStack registry.

PartnerStack Marketplace remains blocked until ToolScout earns its first commission in an existing partnership. Pipedrive is the primary operational unlock target. Dub Marketplace access is available, but advertiser approval remains program-specific. Buffer's earlier process must not be duplicated; Framer remains creator-gated. Impact decisions are advertiser-specific.

As of 2026-09-01, repository state records the following programs as active:

- Systeme.io — active — 60% lifetime recurring
- Jotform — active — 30% recurring
- Pipedrive — active — 20% of new-customer revenue for the first 12 months at the entry tier; higher tiers available
- Make — active — 35% for 12 months
- beehiiv — active through Dub
- Shopify — active through Impact; owner supplied the approved personal URL `https://shopify.pxf.io/JkvQJE`

Submitted/current review: Semrush (Impact) and AdCreative.ai (PartnerStack). n8n was rejected by PartnerStack at 2026-09-01 19:21 UTC and must not be reapplied without a material eligibility change or explicit invitation. HubSpot and Grammarly are also rejected under advertiser-specific evidence. Ahrefs and Calendly have no current program. Notion is paused for new applications.

Webflow was submitted successfully by the owner on 2026-09-01 and is awaiting review. Kit was not submitted: its PartnerStack application is blocked by the Marketplace first-commission gate and must not be represented as pending.

Make referral URL provided by the owner:

`https://www.make.com/en/register?pc=toolscout`

For every affiliate program, use this lifecycle:

`program identified -> application required -> applied -> approved -> personal referral URL obtained -> added to ToolScout -> production verified -> clicks monitored -> conversion/revenue evidence imported`

A program is not considered operationally complete merely because the program exists or the application was submitted. The target state is verified production routing plus measurable clicks/revenue evidence.

Programs previously identified as existing but not yet confirmed active include ActiveCampaign, Brevo, ClickUp, and any additional programs present in `data/affiliate-pipeline.json`.

PartnerStack marketplace access is currently constrained by a network-profile limitation. Existing partnerships are unaffected, but new marketplace programs may require reapplication/profile correction or alternative direct program routes. Treat this as a distribution/affiliate constraint, not a coding problem.

## Distribution status

Current known distribution state:

- Product Hunt: ToolScout product page exists and must remain monitored for launch/listing status and resulting traffic.
- Uneed: submission/payment completed; launch scheduled for 2026-09-15.
- SaaSHub: an existing TryToolScout submission was reconciled on 2026-09-01 without duplication. The authenticated management page shows `Pending approval` with an estimate of up to 32 days. The free queue is being used; the $75 Priority+ upsell is prohibited.
- AlternativeTo: submitted successfully to the free backlog on 2026-09-01 with submission ID `e61abe20-b2ea-4d89-b3c4-21c68834b057`. The owner-only page confirms `waiting to be reviewed`; it is not public until editorial approval. SaaSHub, AlternativeTo and Product Hunt were added as relevant suggested alternatives. The $5 priority queue remains prohibited.
- Peerlist Launchpad, MicroLaunch, and BetaList: current free paths were verified, but authentication/profile creation is required before automation can submit.
- Fazier: the nominal free tier requires a backlink badge on the ToolScout homepage or footer. It is recorded as `unavailable_free` unless the owner separately authorizes that public reciprocal-link change; all paid tiers are prohibited.
- Repository generates a distribution queue in `reports/distribution-queue.json`.

The canonical platform-level evidence, blockers, URLs, free/paid classification, verification state, and next action are stored in `data/distribution-workflow.json`. Normalized sprint states include `discovered`, `eligible_free`, `prepared`, `human_action_required`, `submitted`, `pending_review`, `live`, `rejected`, `unavailable_free`, and `skipped_low_quality`.

Default distribution workflow:

`platform identified -> eligibility checked -> submission prepared -> owner completes credential/payment/CAPTCHA step if required -> listing submitted -> live status verified -> URL recorded -> traffic monitored -> follow-up/launch action scheduled`

Distribution work should normally stay outside Work/Codex.

## SEO and acquisition status

The 2026-09-01 commercial SEO sprint added crawlable, catalog-backed static profiles for all 100 tools, linked the 38 intent guides and 15 comparison pages bidirectionally through those profiles, centralized the comparison registry, and expanded the static sitemap from 107 to 207 URLs. No editorial ranking, affiliate configuration, distribution state, or speculative intent inventory changed. Full scope and acceptance evidence are recorded in `docs/SEO-COMMERCIAL-SPRINT-2026-09-01.md`.

The repository currently generates:

- `reports/blog-topics.json`
- `reports/distribution-queue.json`
- `reports/growth-priority.json`

A recent generated growth-priority report still showed Google Search Console data as unavailable even after Search Console setup work was performed. Treat this as a known reconciliation item: verify the current Search Console property, sitemap submission/indexing state, and whether the automated acquisition pipeline is actually consuming GSC signals before claiming end-to-end GSC integration is complete.

Do not block traffic work on this integration. Continue distribution, content, catalog expansion, and backlink/listing acquisition while the GSC pipeline issue is resolved.

## Permanent work queues

### TRAFFIC

Keep a running queue of actions that can increase qualified visits without requiring Codex, including:

- Search Console/indexing actions;
- sitemap validation;
- keyword and query analysis;
- SEO page prioritization;
- content creation and updating;
- backlinks and listings;
- referral traffic opportunities;
- distribution follow-ups;
- launch amplification.

### AFFILIATES

Keep a running queue of:

- high-fit programs to apply to;
- applications awaiting owner action;
- approvals awaiting referral URLs;
- referral URLs obtained but not yet live;
- live affiliate routes needing production verification;
- clicks with no conversion reporting connection;
- programs rejected or blocked and their reapplication path.

### DISTRIBUTION

Keep a running queue of:

- platforms not yet submitted;
- submissions in progress;
- launches scheduled;
- listings live but not yet promoted;
- listings needing updates;
- channels producing measurable traffic;
- platforms requiring owner credentials, payment, CAPTCHA, or email confirmation.

### CODEX

Only place items here when they require technical execution.

Batch multiple compatible changes whenever possible so one Work/Codex session can perform meaningful execution efficiently.

Typical CODEX queue items:

- add a batch of approved affiliate URLs;
- add a batch of prioritized tools;
- implement GSC ingestion after requirements are settled;
- fix production tracking bugs;
- implement a validated SEO/content batch;
- run tests, migrations, deploys, or repository-wide updates.

## Human-action queue

Human action is expected for tasks that require:

- login credentials;
- 2FA;
- CAPTCHA;
- payment;
- tax/payment-profile data;
- acceptance of platform/program terms;
- email confirmation;
- approval of representations made to third-party affiliate/distribution platforms.

Agents should prepare everything possible before requesting owner intervention and should ask only for the exact blocking action.

## Credit-efficiency policy

Until the owner changes this policy, optimize aggressively for limited Work/Codex availability:

- plan in normal ChatGPT;
- research in normal ChatGPT;
- prepare complete execution specs before opening Work/Codex;
- prefer one larger validated execution batch over many small sessions;
- avoid using Work/Codex simply because the topic involves code;
- use Work/Codex only when actual repository/filesystem/terminal/test/deploy capabilities are needed;
- after execution, reconcile results back into this Command Center and relevant source-of-truth docs/data.

## Update discipline

Update this file when there is a meaningful change in any of the following:

- production state;
- current strategic priority;
- affiliate activation status;
- referral URLs;
- distribution submissions/launches;
- Search Console or acquisition integration state;
- major traffic/revenue milestone;
- material blocker;
- Work/Codex usage policy;
- mission/resume status that would otherwise be lost across chats.

Do not use this file as an unbounded activity log. Keep it current, concise, and decision-oriented. Historical detail belongs in commits, reports, subsystem docs, or mission documents.

## Handoff rule

At the end of any substantial ToolScout execution session, answer these questions and update the repository if the answers materially changed:

1. What changed?
2. What is now verified live?
3. What remains unverified?
4. What requires human action?
5. What belongs in TRAFFIC, AFFILIATES, DISTRIBUTION, or CODEX next?
6. What is the single highest-impact next action?

This handoff discipline is mandatory for preventing state fragmentation across multiple chats and execution environments.

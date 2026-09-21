# ToolScout Command Center

## Operational repair, 18 September 2026

Today-window population alignment: `Human Sessions Today` now uses the same Europe/Lisbon confirmed visitor-session linkage rows as `Unique Human Visitors Today`. This preserves all existing session and visitor records, changes no identifiers, performs no reset or backfill, and guarantees the displayed unique visitor count cannot exceed the displayed session-link count for the current day. Historical rolling and month-to-date session series remain intact for continuity.

Visitor geography is exposed in Human Sessions traffic detail as horizontal country-share bars for Today, Last 24h and MTD. Each window shows visitor count, share, country coverage, number of observed countries and the dominant country. Country evidence comes from the Cloudflare network-location code on Browser Guard allowed sessions, is persisted against browser-confirmed visitor-session links, and never stores the raw IP address. VPNs and proxies can affect the reported country. Historical rows without country evidence remain unavailable rather than being inferred. This change does not reset or recreate sessions or visitors and deliberately uses no map.

Authenticated read-only reporting is restored through Make scenario 7424429 (team 2510626, eu1.make.com). The fixed SELECT-only query is versioned in scripts/reporting/weekly-d1-read.sql and tested against production D1 with zero database writes. It uses Make date interpolation for Europe/Lisbon MTD. Detail limits are explicit: use aggregate event totals and retrieve any remaining details before claiming a complete output ledger. Weekly Progress now references this helper and the existing Cloudflare deployment read helpers.

Preserved baseline: reports/measurement-baseline-2026-09-18.json. At 07:48:51 UTC there were 54 allowed sessions since the first retained Browser Guard event on 16 September at 20:52:47 UTC. Verified outbound tracking started 17 September at 17:08:17 UTC, with no events at that reading. Earlier weekly/MTD coverage is incomplete, not zero traffic. Do not splice older likely-human estimates or legacy distribution attribution into this cohort.

Live HEAD checks verified Apollo, Instantly and SE Ranking /go/ routes return 302 to their configured affiliate destinations. Apollo's stale submitted state is now active; SE Ranking has an explicit pipeline record. Approval alone never establishes active coverage.

Content schedules 7197357, 7197359 and 7197361 now bound Bluesky/X text, preserve tracked links and empty-draft fallback. Configured maximum lengths are 255 and 249. No extra social posts were sent for testing. Buffer acceptance is queued; X completion requires a public X status URL. Command Center exposes queued stages and withholds mission completion until every required stage is verified. Replay cannot downgrade completed to queued or overwrite newer evidence. Run node tests/mission-publication-evidence.mjs for authentication, queue, completion and failure checks.

Historical Wednesday receipt: LinkedIn published urn:li:share:7505948666910695425; Bluesky rejected 378 graphemes against a 300 limit; X draft was empty. Empty-draft fallbacks were already added on 17 September. Friday 18 September 08:40 UTC execution bdd6707abb61484e9040f6424844d4e3 verified LinkedIn and Bluesky publication with the new limits. Bluesky receipt: at://did:plc:hjawfnxtifnuqcgidlvmas76/app.bsky.feed.post/3mvrrgos6hz2z. Buffer accepted X post 6aacf8efd6699e7ea1145f97. Its queued proof initially received HTTP 422 because it preceded the evidence endpoint deployment; only that receipt was recovered successfully, with no repeat social send. Live Command Center now lists LinkedIn/Bluesky completed and X queued, with last_completed_at null. Public X publication still needs a verified status URL.

Uneed remains measurement-only: six legacy browser-confirmed sessions, zero recorded outbound, monetized outbound or confirmed revenue, against the existing USD 14.99 one-time experiment at the first 18 September reading. No additional spend is authorized. GitHub Actions conservation remains intact; production deploy uses Cloudflare Builds. Commit 029521abb6767f5a5612f86131e8a36de4108f6e was verified in live Worker source through authenticated Cloudflare readback and an HTTP 200 health probe. Both publication-evidence authentication paths pass local regression tests.

## Purpose

This file is the canonical operational memory for ToolScout. It exists to keep project state coherent across ChatGPT chats, Work, Codex, GitHub sessions, and human actions.

It is not a replacement for technical source-of-truth files such as `AGENTS.md` or `docs/PRODUCTION-BASELINE.md`. Instead, it is the current operational layer: what is live, what is monetized, what needs human action, what belongs in growth work, and what is worth spending Work/Codex credits on.

## Growth Engines 2.0 priority — 2026-09-09

Distribution Engine 2.1, Affiliate Coverage Engine 2.0 and the redesigned Growth Command Center are the highest development priority. The implementation contract is canonical in `docs/GROWTH-ENGINES-V2.md`.

The immediate operating objective is:

`qualified human traffic -> useful engagement -> monetized outbound -> confirmed revenue`

The Command Center must expose only current, resolvable human exceptions through a Chairman Queue. Human tasks require a concrete action, reachable direct HTTPS link, expected impact, time estimate, reason human action is required and a defined downstream machine step. Completed/stale tasks and engine policy limitations must not remain as owner tasks.

The Command Center 2.0 is user-configurable: every operational block is clickable for drill-down, draggable/reorderable and resizable, with the owner's layout persisted between sessions.

The current implementation branch is `growth-engines-v2-command-center`. It reuses the canonical engine state machines and evidence stores rather than introducing a parallel task database.


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

The commercial-intent strategy adopted on 2026-09-06 refines this into:

`Discovery Engine -> Decision Engine -> Commerce Layer`

ToolScout should prioritize specific software decisions over raw page count. The core decision model is:

`Persona -> Job-to-be-done -> Constraints -> Candidates -> Comparison -> Recommendation`

A first implementation pilot is open in PR #10. It adds explicit decision context to six existing high-value intent guides and connects that same context to selected existing A-vs-B comparison URLs. The pilot does not change ranking weights, affiliate routing, canonical URLs, migrations, or infrastructure. Branch workflow runs #152 and #153 completed successfully after the comparison-context changes. Do not treat the pilot as production-live until PR #10 is merged.

Primary business metrics:

- organic impressions;
- organic clicks;
- genuine sessions, including human sessions today, rolling 24h and month-to-date pace;
- outbound clicks;
- affiliate-covered outbound clicks;
- affiliate CTR;
- vendor conversions;
- confirmed/paid commission;
- revenue per 1,000 genuine non-owner sessions when evidence is available.

Command Center KPI decision (2026-09-09): recommendation completions are secondary product-funnel telemetry, not a headline growth KPI. Usage has remained effectively flat, so the redesign should prioritize human sessions, outbound intent, monetized outbound and confirmed revenue instead.

Revenue Intelligence v2 is implemented in the existing protected Command Center. Its 30-day commercial view includes only sessions classified `likely-human`; owner, known bot/crawler, synthetic/test, and unknown/legacy traffic stay outside the primary metrics. Monetized versus unmonetized outbound uses the immutable `affiliate_active_at_click` snapshot introduced by migration `0009`; rows predating that snapshot remain unknown.

Page attribution is shown only when the redirect recorded a valid internal referrer slug. Intent attribution uses that recorded slug or the latest prior recommendation result/completion with an intent in the same session. A click is recommendation-assisted only when such a prior recommendation event exists; otherwise it is direct/unattributed. Page and intent outbound rates use observed human sessions for the same page/intent. Tool outbound rate uses all likely-human sessions in the reporting window because result-impression events do not currently contain the displayed tool list.

Revenue Gap score is `10 × unmonetized outbound + 2 × human sessions (capped at 25) + outbound rate percentage (capped at 50)`. Revenue Opportunity score is bounded to 100 and consists of traffic (30 points, 25 sessions reaches the cap), outbound propensity (40 points, 50% reaches the cap), and click-time monetization coverage (30 points). Both scores are prioritization aids, never estimates of conversions, commission, EPC, or currency value.

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

The Growth Command Center at `/analytics.html` is the sole owner-facing affiliate operations surface. The redundant Affiliate Operations page was retired on 2026-09-10; `/affiliate-workflow`, `/affiliate-workflow/` and `/affiliate-workflow.html` redirect to the Command Center. The existing affiliate workflow APIs, engine, D1 records and append-only history remain active.

GitHub was classified as `no_program_found` on 2026-09-10 and removed from the Chairman Queue. The official partners page does not establish a public affiliate program suitable for ToolScout; no application was submitted. The source and rationale are stored in D1 history and `data/affiliate-pipeline.json`. Reassess only with new official evidence.

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

## Command Center composition contract - 2026-09-18

The Growth Command Center is the single owner of owner-facing page composition.

- `growth-command-center-v2-worker.js` owns the canonical Command Center page composition and engine-surface injection.
- Outer Worker layers may decorate the canonical response, add styling, add telemetry or add compatibility behavior. They must not rebuild `/analytics` directly from `analytics-v2.html`.
- Engine card names must not hardcode version numbers. Runtime engine versions come from the protected stats payload so an engine upgrade cannot leave a stale card title behind.
- A new engine, tracking surface or autonomous-growth capability is not considered operationally complete until it is visible through the canonical Command Center or explicitly classified as backend-only.
- The resilient health endpoint exposes the current composition owner/version so production drift can be detected without relying on visual inspection.
- Any future wrapper that fetches the raw analytics asset instead of delegating to the canonical base is a regression.

## Autonomous Growth loop - 2026-09-18

ToolScout now coordinates growth work across Distribution, Content, Search/GEO/AEO and Affiliate systems instead of treating them as independent queues.

- Distribution Network 2.1 uses explicit publisher lifecycle states. Repeated no-contact candidates are suppressed instead of recycled indefinitely, and are reopened only when the route changes or after the configured cool-off.
- Publisher contact discovery now records public role emails plus alternate public routes such as contact/submission forms, LinkedIn company pages, X, Bluesky and GitHub. Missing email is no longer treated as missing route.
- `growth_opportunity_state` is the shared priority layer. It combines distribution economics, publisher adoption state, vendor amplification, verified social profiles, affiliate-social permissions and current Search/GEO/AEO opportunity evidence.
- Search opportunities from the organic growth report become first-class growth subjects. Their observed priority can provide a bounded boost to relevant tool/vendor opportunities so content, outreach, SEO and monetization reinforce the same themes.
- Content Engine briefs prefer current growth opportunities, retain verified-handle guardrails, and attach exact `ts_action` and `ts_growth` markers to ToolScout-owned targets. Direct vendor affiliate links remain unmodified when programme rules require direct linking.
- Vendor and publisher outreach now creates measurable growth actions. Vendor outreach includes the featured decision asset, the ToolScout tool profile and the free publisher/embed kit while preserving editorial independence.
- Growth attribution counts only likely-human sessions that become browser-confirmed and carry a known exact action marker. Outbound and monetized outbound are counted only after that attributed entry. Missing markers are never inferred as traffic.
- The protected Command Center includes an Autonomous Growth view covering active opportunities, autonomous actions, human interventions, Chairman Queue size, contact routes, placements, backlinks, attributed human sessions, outbound and monetized outbound.
- Human intervention remains an exception. Paid actions, authentication, CAPTCHA, terms acceptance and genuinely irreversible third-party gates still require owner action. Machine-resolvable work must remain outside the Chairman Queue.

The operating loop is now:

`observe -> prioritize -> act -> verify -> attribute -> learn -> scale/suppress -> repeat`

The next acceptance criterion is not candidate volume. It is repeated evidence of `new opportunity -> autonomous action -> verified external presence or outreach -> browser-confirmed human session`.

## Chairman Queue quality repair - 2026-09-21

Launch Llama has an existing ToolScout product page at https://tools.launchllama.co/products/toolscout displaying "Launching this week. Under review." The canonical `launch-llama` opportunity remains `pending_review`; this is not proof of an approved listing, backlink or human traffic. The duplicate submission/form opportunities `route-c9c494db6c05bc43` and `route-bcfa96d69627bd53` were reconciled to `skipped`, their route actions retired, and the open duplicate gate cancelled. A legacy prepared blog submission was retired with an audit row. No repeat submission or owner completion was recorded.

The shared `chairman-task-quality.js` contract rejects internal boilerplate, machine endpoints, missing prepared content, missing distinct instructions/reason, and missing effort/impact/follow-up. Contract-backed distribution tasks additionally require recent observed human-gate evidence. Both queue readers and the human-actions entrypoint expose rejected tasks as engine-owned quality holds. The UI displays instructions separately from the human reason and includes prepared content for distribution gates. Mark done queues autonomous verification; pending editorial review and verification delays never reopen an owner task on their own.

Route materialization excludes form routes for already-submitted canonical products; cycle reconciliation cancels existing duplicates. Canonical opportunity state must still require human action before an open gate is displayed. Resolved, cancelled and verification-pending contracts cannot be reopened by routine upserts.

Regression check: `node tests/chairman-quality.test.mjs` (uses built-in Node SQLite). Production verified after explicit owner authorization: PR #131 merged as `5360db4f8540870a46b31bfaa9162012ead33fa0`; Cloudflare build `f2e9769f-a599-45e7-a97d-19be93d25708` succeeded. Worker `toolscout` deployment `7c5212cf-f125-4ca8-ab40-5c476984648e` serves version `492fb790-a0b9-4961-8bc5-7598a4de031b` at 100%. The live `/api/command-center-resilient-health` response confirms `chairmanPayloadVersion=chairman-quality-v1`. D1 readback confirms both Launch Llama derived routes remain skipped, the duplicate contract is cancelled, and the canonical listing remains pending_review with no human action. The protected queue was not directly read because the existing stats probe returned HTTP 401; live verification covers deployment, runtime version and canonical D1 state.

## Distribution status

Current known distribution state:

- Best of AI (2026-09-17): production task corrected and verified in run 35205402430. Direct `https://bestofai.com/tool/add` returns HTTP 401 with 'You must be logged in' and a misleading 404 illustration. Official homepage exposes Sign In, Join Free and Add Tool. Queue now points to homepage with auth_required and instructions to sign in then open Add Tool. Free listing eligibility and the authenticated form remain unverified. No login, submission or payment performed. Radar source corrected for future deployment; conservation mode restored.

- The Rundown AI / Supertools (2026-09-17): removed from production Chairman Queue and parked as skipped, following successful reconciliation run 35205009441. The configured `/submit-a-tool` URL returns 404; the official tools directory exposes no verified free submission link, while `/advertise-with-us` is a paid sponsorship route. Old migration 0037 incorrectly promoted this research candidate to human action. Radar source corrected in GitHub; terminal skipped status keeps the existing deployed radar from promoting it back into the actionable queue. Reopen only with evidence of a valid free route. No outreach, paid purchase or site deployment performed.

- Hype Star (2026-09-17): submission accepted, pending editorial review. Owner authorized the one-off badge deployment; PR #75 merged and deploy run 35204093998 succeeded with verified ToolScout resource identity and no database migrations. Official badge verified live at `https://trytoolscout.org/methodology`; Hype Star confirmed badge verification and submission without account creation. App / Productivity & Operations. Proposed profile: `https://hypestar.org/project/toolscout`, not yet confirmed public. Conservation mode restored immediately after the deployment trigger. Do not resubmit; verify publication before marking live. Production D1 Chairman Queue reconciled and verified by run 35204738784: Hype Star no longer requires owner action; opportunity status is pending review (or later verified state), human_required=0, economic chairman flag cleared. Conservation mode restored; no site deployment or unrelated queue changes.

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

Editorial authority update (2026-09-17): the software catalog now uses a hybrid structured-plus-editorial presentation. Tool cards retain catalog/search structure but replace the badge-heavy reading experience with a factual summary plus a short ToolScout view. All registered A-vs-B comparisons are being updated with a prose ToolScout conclusion grounded in the existing score and catalog evidence. The comparison generator preserves the same rule for future refreshes. Schema, crawlable links, pricing context and other machine-readable signals remain intact.


The 2026-09-01 commercial SEO sprint added crawlable, catalog-backed static profiles for all 100 tools, linked the 38 intent guides and 15 comparison pages bidirectionally through those profiles, centralized the comparison registry, and expanded the static sitemap from 107 to 207 URLs. No editorial ranking, affiliate configuration, distribution state, or speculative intent inventory changed. Full scope and acceptance evidence are recorded in `docs/SEO-COMMERCIAL-SPRINT-2026-09-01.md`.

The 2026-09-06 SEO workflow investigation confirmed GSC sync is functioning: the failed run successfully imported signals for 24 intents and reported 363 impressions over its 28-day window before a separate Gorgias affiliate-validation issue stopped the workflow. The Gorgias tracking format was then added to the public-surface validator, and subsequent generated-asset refresh resumed. Do not continue treating GSC as unavailable without rechecking current repository/run evidence.

The repository currently generates:

- `reports/blog-topics.json`
- `reports/distribution-queue.json`
- `reports/growth-priority.json`

Do not block traffic work on any single integration. Continue distribution, content, catalog expansion, and backlink/listing acquisition while acquisition signals are reconciled.

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

Current CODEX/merge queue:

- review/merge PR #10 after final generated-surface validation;
- after merge, observe GSC/CTR behavior on the decision-context pilot before scaling the pattern aggressively;
- then consider generalizing semantic graph selection and adding first-class alternatives only where evidence justifies them.

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

## Repository privacy transition

The owner authorized a private repository while preserving GitHub connector editing, public Cloudflare hosting, and growth automations. Keep the free plan as the target; do not claim private Actions usage fits the quota until observed after consolidation.

Production, Command Center and commercial smoke checks share the hourly production job. API/MCP/A2A checks join that job after deployments and retain their daily/manual runs. Credential-bearing discovery and business intelligence export remain independent. Public static publication excludes backend source and selected internal snapshots; catalog responses omit commercial metadata while internal Worker asset reads retain it. GitHub Pages currently remains enabled with a filtered artifact pending the final dependency and account-settings checks.

The owner changed the repository to private on 2026-09-08. GitHub connector metadata confirms private visibility and retained pull/push permission; file reads work. This operational update verifies connector writes after the change. The public Cloudflare site remains reachable. Check the resulting deployment and smoke run to finish post-transition validation. GitHub Pages is skipped for private repositories. Monitor the account-wide Actions quota; free-plan headroom is not guaranteed during heavy development. Historical public copies cannot be recalled by making the repository private.

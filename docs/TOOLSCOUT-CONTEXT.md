# ToolScout Operational Memory

Last updated: 2026-09-08

Purpose: persistent operational context for ToolScout across chats and work sessions. This file is a human-readable memory layer, not a runtime configuration file. When facts here conflict with current repository data, workflows, production telemetry, or vendor evidence, those live sources win.

## 1. Project objective

ToolScout is an AI/software tool discovery and affiliate project at trytoolscout.org. The operating goal is to help users find the right software quickly while building a durable, increasingly automated traffic and affiliate-revenue engine.

Current priorities:

- grow likely-human traffic;
- increase monetized outbound coverage based on actual human click demand, not just number of affiliate programs;
- expand SEO, AEO and GEO visibility;
- improve distribution and audience growth;
- keep measurement conservative and evidence-based;
- automate repetitive growth work without compromising public quality or indexability.

## 2. Sources of truth

Use repository state before relying on conversational recollection.

Primary technical sources:

- `data/affiliate.json`: active referral/affiliate destinations;
- `data/affiliate-pipeline.json`: affiliate pipeline state;
- `data/affiliate-queue.json`: affiliate application/research queue;
- `data/business-intelligence.json`: current traffic, funnel, commercial coverage and verified revenue state;
- `reports/catalog-100.json`: catalog baseline/report;
- `.github/workflows/seo-pages.yml`: SEO/AEO/GEO generation and validation workflow;
- `docs/COMMAND-CENTER.md`: Command Center architecture and definitions;
- `docs/AFFILIATE-OPERATIONS-ENGINE.md`: affiliate operations;
- `docs/AUDIENCE-CONTENT-ENGINE-EVOLUTION.md`: audience/content engine evolution;
- `docs/EXTERNAL_ACQUISITION_GROWTH_ENGINE.md`: external acquisition/distribution strategy.

Operational rule: never infer revenue from outbound clicks. Revenue is considered real only when vendor-confirmed evidence appears in the revenue ledger/business intelligence.

## 3. Catalog

Latest catalog report checked on 2026-09-08:

- 100 live/base tools;
- 80 staged tools in the catalog report;
- categories include marketing, CRM, forms, SEO, AI writing, automation, business, AI assistant, analytics, sales, support, design, social, website, AI research, developer, ecommerce and content.

Do not treat simple catalog size as a growth KPI. Traffic quality, commercial intent and monetized outbound coverage are more important.

## 4. Affiliate strategy and current state

Commercial priority: maximize the share of human outbound clicks that can earn revenue. Prefer direct/independent programs where practical, accessible approval for a young site, and programs matching tools already receiving traffic.

Current enabled affiliate/referral entries in `data/affiliate.json` as checked on 2026-09-08:

- systeme.io
- beehiiv
- Jotform
- AdCreative.ai
- Pipedrive
- Shopify
- Make
- Typeform
- Zoho CRM
- Kit
- Gorgias
- MailerLite

Known exact links that should not be silently modified:

- Make: `https://www.make.com/en/register?pc=toolscout`
- Typeform: `https://typeform.cello.so/32NCHvHV6ws`
- Zoho CRM: `https://go.zoho.com/6joE`

Zoho CRM was enabled in production configuration on 2026-09-08. The site should use the internal `/go/<slug>` redirect architecture rather than hard-coding affiliate URLs into SEO pages.

Tracked but currently disabled/no affiliate URL in `data/affiliate.json` as checked on 2026-09-08:

- HubSpot
- Semrush
- Jasper
- Zapier
- Surfer
- Brevo
- ActiveCampaign
- Mailchimp
- Monday CRM
- Tally
- Ahrefs
- SE Ranking

Affiliate coverage should be evaluated in two ways:

1. nominal program coverage among tracked commercial tools;
2. weighted monetization coverage of actual likely-human outbound clicks.

The second metric is the commercially important one.

Known network caveat: PartnerStack links can fail on Pedro's home Wi-Fi because of router-level ad-blocking DNS while working on 5G. Do not classify a PartnerStack link as invalid solely from that environment-specific failure.

## 5. Current business intelligence snapshot

Snapshot checked: `data/business-intelligence.json`, generated 2026-09-08T11:08:00.950Z, Europe/Lisbon semantics.

Observed 30-day/current-period values in that snapshot:

- likely-human sessions: 288;
- outbound clicks: 207;
- sessions with outbound: 207;
- monetized outbound: 43;
- monetization coverage: 20.8%;
- human-session-to-outbound rate: 71.9%;
- vendor-confirmed revenue: none recorded in the ledger at that snapshot.

Important: this snapshot predates some same-day changes such as the newly enabled Zoho referral and therefore must not be assumed to include their future effect. Do not retroactively classify old clicks as monetized unless the data model explicitly supports that.

## 6. SEO, AEO and GEO

ToolScout has a generated SEO/AEO/GEO surface with dedicated validation before generated assets are committed.

The `Generate SEO Pages` workflow currently performs, among other steps:

- intent coverage validation;
- Google Search Console signal sync;
- observed slug audit;
- competitive gap scan;
- growth priority building;
- organic growth opportunity generation;
- cross-channel content intelligence;
- SEO page generation;
- decision-context enrichment;
- commercial comparison generation;
- indexable tool profile generation;
- guide/comparison linking;
- blog generation;
- distribution asset generation;
- sitemap generation;
- AEO/GEO readiness validation;
- machine-readability validation;
- SEO page validation;
- public-surface validation;
- commercial indexability/link validation.

Concurrency is serialized with `group: seo-pages` and `cancel-in-progress: false`. Before generated assets are pushed, the workflow rebases onto current `main`.

### Affiliate/SEO decoupling fix

On 2026-09-08, commit `30020e9` corrected the SEO workflow so affiliate-only data changes do not unnecessarily trigger a full SEO rebuild.

The push trigger still watches `data/**`, but explicitly excludes:

- `data/affiliate.json`
- `data/affiliate-pipeline.json`
- `data/affiliate-queue.json`

Reason: monetization destinations are runtime/commercial configuration and should not by themselves cause SEO page regeneration. Preserve this separation unless a future architecture change makes affiliate data an intentional SEO input.

## 7. Content Engine rules

Publishing cadence currently used operationally: Monday, Wednesday and Friday.

Persistent copy rules:

- LinkedIn output must be plain text;
- no Markdown bold syntax or visible asterisks on LinkedIn;
- X should publish rather than merely create a draft when the publishing workflow is intended to be live;
- normal hyphens are allowed and sometimes necessary;
- em dashes/en dashes (travessões) should not be used in generated social copy;
- avoid repetitive AI-sounding formatting.

The Content Engine should be treated as a distribution mechanism, not assumed to be a major traffic source until audience and follower bases justify that conclusion.

## 8. Audience Growth / Distribution Engine

The Audience Growth Engine includes engagement/distribution activity across social platforms. Recent operational work has included Bluesky engagement, X and LinkedIn opportunity generation and automatic distribution proof after deploy.

Known recent issue: Audience View in the Command Center has at times lagged behind visible Bluesky engagement and shown zero suggestions for X/LinkedIn. When assessing health, compare the Command Center data with the underlying workflow/output evidence instead of assuming the UI is fully current.

Copy generated for engagement must follow the same punctuation rule: hyphens allowed, travessões not allowed.

## 9. Command Center measurement principles

The Command Center must separate:

- likely-human/live growth;
- observed external traffic including bots/unknown legacy traffic;
- owner/internal testing;
- verified revenue evidence.

Do not blend historical pre-classification traffic into likely-human growth metrics.

When reporting commercial performance, distinguish:

- active affiliate links;
- nominal affiliate-program coverage;
- monetized human outbound clicks;
- verified revenue.

These are different metrics and must not be presented interchangeably.

## 10. Distribution and launches

Known launch/distribution context as of 2026-09-08:

- Product Hunt launch already completed;
- SaaSHub verification completed;
- Uneed paid launch scheduled for 2026-09-15;
- Peerlist is part of the launch/distribution plan;
- GEO/AEO and AI-search distribution are active strategic priorities;
- social distribution includes LinkedIn, X and Bluesky.

Do not assume a launch is pending/completed solely from this file if a current schedule, platform dashboard or repository distribution state says otherwise.

## 11. Recent important technical decisions

- Catalog 100 became the baseline in early September 2026.
- Affiliate URLs are kept behind internal `/go/<slug>` routing where supported, rather than embedded directly into generated SEO pages.
- Zoho CRM referral activated on 2026-09-08 using `https://go.zoho.com/6joE`.
- SEO workflow affiliate-only trigger correction committed as `30020e9` on 2026-09-08.
- Generated SEO assets are validated before commit and the workflow rebases before push to reduce concurrent-write failures.
- Business reporting remains conservative: no vendor-confirmed sale means no recorded revenue, regardless of click volume.

## 12. Current priorities / next-step logic

Unless newer repository data contradicts this, prioritize work in this order:

1. raise weighted monetization coverage of real human outbound demand;
2. pursue affiliate programs for high-click unmonetized tools rather than maximizing raw affiliate count;
3. strengthen weak commercial categories, especially SEO tools if they continue to receive demand;
4. keep SEO/AEO/GEO indexability stable while expanding public commercial-intent coverage;
5. verify Audience View and distribution telemetry against actual workflow evidence;
6. grow qualified likely-human traffic through SEO/AEO/GEO plus distribution;
7. detect and record first vendor-confirmed revenue without inferring sales from clicks.

## 13. How future ChatGPT sessions should use this file

At the start of substantial ToolScout work:

1. read this file for orientation;
2. fetch the specific live source-of-truth files relevant to the task;
3. prefer current repository/production evidence over stale statements here;
4. after a material decision or state change, update this file if it affects future work across chats;
5. do not turn this document into a raw event log. Keep durable decisions, current state, known caveats and next-step logic only.

The purpose of this file is continuity, not duplication of every repository detail.
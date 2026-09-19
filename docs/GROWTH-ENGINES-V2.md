# ToolScout Growth Engines 2.0

## Objective

Distribution Engine 2.0, Affiliate Coverage Engine 2.0 and the Growth Command Center are the current highest-priority ToolScout operating system.

The economic loop is:

`qualified human traffic -> useful engagement -> monetized outbound -> confirmed revenue`

New nonessential product features should not outrank work that materially improves this loop.

## Closed-loop contract

An engine is operationally autonomous only when it can:

`observe/discover -> prioritize -> execute -> verify -> measure -> learn -> repeat`

A human dependency is an exception, not a normal workflow state.

### Human Gate contract

A Human Gate may enter the Chairman Queue only when all of the following are true:

1. the canonical engine state says human action is currently required;
2. the action is concrete and can be performed now;
3. a direct HTTPS action URL exists and is reachable;
4. the queue states why a human is required;
5. expected impact is exposed;
6. expected human time is exposed;
7. the next machine action is defined.

Resolved, submitted, pending, rejected, skipped, live, verified and otherwise stale states must not remain in the queue. A policy limitation or missing automation capability is an engine problem, not automatically a Chairman task.

The Chairman Queue is a live view of canonical engine state. It is not a parallel task database.

## Distribution Engine 2.0

Primary outcome: incremental likely-human sessions that lead to downstream commercial activity.

Measure:

- engine actions attempted and completed;
- failures, with no silent failure;
- submitted, pending, live and verified surfaces;
- attributed likely-human sessions;
- attributed human outbound;
- attributed monetized outbound;
- confirmed revenue when evidence exists;
- delivery and public-verification lifecycle.

A human-confirmed submission removes the current Human Gate and moves the surface back into engine-owned monitoring. Automatic public verification is expected where a machine-verifiable route exists; otherwise the state must remain explicit rather than being called live.

## Affiliate Coverage Engine 2.0

Primary outcome: monetize observed ToolScout demand, not raw catalog count.

Prioritize by recoverable commercial leakage and human effort. Weighted monetization coverage is the primary coverage metric.

Lifecycle:

`observe demand -> identify leakage -> discover official programme -> qualify -> apply/human gate -> monitor decision -> obtain referral URL -> activate -> production verify -> measure clicks/revenue`

Approval alone is not active coverage. A programme is operationally complete only when its referral route is enabled and verified in production.

## Shared Autonomous Growth Brain - 2026-09-18

ToolScout growth is coordinated through one shared opportunity state rather than independent engine queues.

The shared brain may prioritize:

- distribution surfaces and publisher relationships;
- vendor amplification and content opportunities;
- Search / GEO / AEO opportunities;
- affiliate leakage and programme lifecycle;
- catalog coverage gaps;
- catalog factual quality, source changes and freshness debt.

Canonical priority state: `growth_opportunity_state`.

### Affiliate Coverage Engine 2.1

Affiliate growth follows:

`observe human leakage -> discover -> qualify -> prepare -> human gate only if required -> monitor -> capture referral link -> activate -> production verify -> measure yield`

The engine prepares truthful application packs automatically. Human intervention is limited to authentication, CAPTCHA, legal/terms acceptance, identity, tax/payment information, or an irreversible third-party submission that cannot be safely completed by automation.

An approved referral URL stored in canonical D1 state can power `/go/<tool>` directly. Repository editing is not required before monetization can begin. A route is not considered verified until the production redirect is checked.

Affiliate economics may prioritize monetization work. They must never change editorial ranking, recommendation eligibility, or catalog admission.

### Catalog Growth & Quality 1.0

Catalog autonomy follows:

`observe coverage and first-party sources -> prioritize -> verify -> admit / flag / suppress -> measure -> repeat`

Rules:

- official first-party source verification is required for autonomous admission;
- trusted candidate profiles can be admitted to coverage only after deterministic quality gates;
- runtime coverage admission has `rankingEligible=false` and `comparisonEligible=false`;
- ambiguous source changes are flagged for factual re-verification, never silently rewritten;
- blocked/rate-limited sources are warnings, not deletion evidence;
- a tool is runtime-suppressed only after two consecutive confirmed 404/410 checks;
- competitive market signals create research opportunities, not automatic profiles, until first-party evidence exists;
- the public `/data/tools.json`, sitemap and tool profile routes consume runtime catalog state;
- catalog growth is affiliate-neutral.

The runtime Catalog Autonomy layer exists so freshness and coverage learning continue even while repository CI is in conservation mode.

## Traffic Truth strict-human-v1

ToolScout business traffic no longer treats a browser that merely executes JavaScript and remains visible as a human.

Canonical human sessions require positive evidence in `traffic_human_evidence`:

- a trusted browser interaction observed with `event.isTrusted`;
- persistent navigation across at least two ToolScout paths within the same first-party session;
- a first-party verified `/go/` outbound navigation.

Browser Guard remains a diagnostic pre-filter. Its accepted sessions are not business traffic and do not feed the North Star metric, visitor countries, growth attribution or growth learning.

The strict-human baseline begins when `strict_human_tracking_started_at` is created. Earlier Browser Guard history remains available for diagnostics but is excluded from canonical trends.

The system intentionally prefers false negatives to false positives: an engaged reader who never interacts may be missed, but an automated browser that merely renders a page must not be reported as a human business session.

## Search / GEO / AEO execution under the shared brain

Search intelligence and Search execution no longer operate as independent strategy layers.

The runtime growth coordinator publishes sanitized Search directives from `growth_opportunity_state` at `/api/growth/search-directives`.

When the repository SEO workflow is eventually unlocked, it must:

1. fetch the current runtime directives;
2. verify that the source brain is `shared-growth-v3` and fresh;
3. refuse to start a new intervention for an intent that is not authorized by the shared brain;
4. write the brain opportunity and actions into the organic-growth action record;
5. refuse to apply generated SEO actions that lack the shared-brain authorization marker.

The GitHub Actions hard interlock remains closed until this brain-gated pipeline is reviewed on a non-main branch.

## What's New under the shared brain

`What's New` is a growth input, not a separate editorial island.

- existing verified software updates become `news_update` opportunities;
- recent verified updates can boost the priority of the related tool;
- Content Engine may select a `news_update` opportunity through the same priority state as normal tool opportunities;
- Catalog Runtime discovers official changelog / release-note / product-update sources from first-party vendor pages;
- tracked official update sources are checked on the low-cost daily cadence;
- a changed official update source creates a bounded candidate, not an automatic factual rewrite;
- news opportunities can trigger catalog impact review, Search angle evaluation, Content amplification and Distribution amplification;
- affiliate status never determines whether a product update is covered.

## Growth R&D bounded autonomy

The shared brain audits its own opportunity mix and recent outcomes once per day.

It may autonomously instantiate experiments only from the primitives allowlisted in `data/growth-rnd-policy.json`.

Examples include:

- reinforce an observed Search opportunity through Content + Distribution;
- compound a verified software update through Search, Content, Catalog and Vendor Amplification;
- prioritize recoverable affiliate leakage;
- explore evidence-backed catalog coverage gaps;
- reduce machine-resolvable Human Gates.

The brain must not autonomously:

- modify arbitrary application code;
- authorize new paid spend;
- change credentials or secrets;
- accept legal or contractual terms;
- submit identity, tax or payment information;
- perform an irreversible third-party action;
- change editorial ranking because of affiliate economics.

This makes the system proactive without making it unconstrained or self-modifying.

## Growth Command Center 2.0

The Command Center is an operational surface, not an activity dashboard.

Required blocks:

- Chairman Queue;
- North Star economic funnel;
- Distribution Engine scorecard;
- Affiliate Coverage Engine scorecard;
- ToolScout Footprint;
- Growth Ledger;
- Revenue & Coverage;
- Engine & Data Health.

Every block is clickable for drill-down, draggable/reorderable and resizable. Owner-selected order and size persist locally between sessions.

The Command Center uses manual refresh and no background polling. It should not create unnecessary D1 read load while left open.

### ToolScout Footprint

Footprint separates states rather than collapsing them:

`discovered -> attempted/submitted -> pending -> live/verified -> traffic observed -> conversion/revenue observed`

Search Console pages with impressions are evidence of Google search visibility. They must not be described as a complete Google index count unless a separate authoritative index-count source exists.

### Growth Ledger

The Growth Ledger merges evidence-backed engine activity and state transitions so productivity can be audited. It should answer:

- what did each engine do?
- what succeeded or failed?
- what became live/verified?
- what human traffic/outbound/revenue followed?

## Failure policy

No silent failures.

Examples that are bugs or engine-health events:

- an expected run did not execute;
- a human action link is unreachable;
- a completed/stale task remains in the Chairman Queue;
- a surface is called live without verification evidence;
- a human dependency exists but is not surfaced as a valid Human Gate;
- an engine claims to resume a downstream step it cannot actually observe or verify.

## Current implementation

Development branch: `growth-engines-v2-command-center`.

The V2 implementation deliberately reuses the existing canonical Affiliate and Distribution state machines and D1 evidence. It does not create a second task store or a parallel interpretation of operational truth.

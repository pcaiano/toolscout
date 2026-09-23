# ToolScout Content + Audience Engine Evolution

Status: implementation contract
Date: 2026-09-06

## Objective

Evolve ToolScout from calendar-driven social publishing into an opportunity-driven acquisition and learning system while preserving platform policy, editorial independence and likely-human attribution.

## Core loop

LISTEN -> SCORE OPPORTUNITY -> CREATE -> DISTRIBUTE -> ENGAGE -> ATTRACT -> CONVERT -> MEASURE -> LEARN -> ADAPT

## 1. Opportunity-driven content

The Monday / Wednesday / Friday cadence remains the baseline and controls when content is published, not what the subject must be.

The content strategist should choose the strongest evidence-backed opportunity available from:
- ToolScout social attribution and downstream commercial behavior;
- Organic Growth Engine / GSC demand signals;
- ToolScout comparison, intent and recommendation data;
- verified product or market changes when supplied by a trusted source;
- recurring social questions and conversations.

No signal may be invented. Affiliate economics may prioritize monetization operations but must never determine editorial ranking or recommendations.

## 2. Stable content identity

Every published editorial idea must have a stable content family / content_id carried in utm_content. Current baseline families are:
- monday_discovery
- wednesday_comparison
- friday_practical

Future iterations should evolve this into run-specific IDs while retaining a family field so performance can be learned longitudinally.

Learning dimensions:
platform -> content family -> topic -> hook -> format -> human sessions -> recommendation completions -> outbound clicks -> monetized outbound

## 3. Learning policy

Do not optimize from tiny samples.
- fewer than 5 attributed social human sessions: preserve balanced baseline;
- 5-19: directional learning only, one controlled test at a time;
- 20+: allow allocation changes when downstream behavior supports them;
- never infer revenue without vendor evidence;
- never infer causality from correlation alone.

Primary metrics are qualified likely-human sessions and downstream commercial actions. Likes and impressions are diagnostic, not the objective.

## 4. Engagement by platform

### Bluesky
High autonomy through the official API, with bot/aggregator filtering and GREEN / AMBER / RED risk controls.

As of 2026-09-08, autonomous outbound replies are forwarded from the active Make scenario to ToolScout's verified audience-event endpoint and stored in `audience_events`. A verified published Bluesky reply was backfilled successfully to prove the ingestion path. The protected Command Center now reads these events through `/analytics/api/stats`, so Audience View no longer bypasses the audience layer.

As of 2026-09-23, every autonomous Bluesky reply draft must pass through `POST /api/audience/bluesky-reply/prepare` before the Bluesky publish module. The endpoint uses Unicode grapheme counting, a 280-grapheme operating target under Bluesky's 300-grapheme ceiling, the 3000-byte ceiling, removes ToolScout-prohibited em/en dashes, and rewrites over-limit copy at a sentence or word boundary instead of hard-cutting it. The publish module must map only the returned `text` field. Published replies that still appear hard-cut are recorded as warnings and must not be treated as copy-quality success.

### X
Do not auto-reply to keyword-search discoveries. X prohibits unsolicited automated replies based only on keyword search and requires prior written approval for AI-powered automated reply bots. Use intelligence automation only: discover permitted opportunities -> score -> draft -> Engagement Inbox -> human approval / edit / skip. Do not automate likes or proactive follow/unfollow.

The Command Center human-review surface is implemented: X suggestions can expose Open action, Copy reply, Mark done and Skip controls, with completed/skipped state persisted in D1. Authenticated suggestion intake is available at `/api/audience-suggestion`. A live X discovery source is not yet connected in Make, so no X suggestions may be fabricated until a policy-compliant source is connected.

### LinkedIn
Do not use unauthorized scraping, bots, browser automation, automated comments, likes or shares. Use official publishing/analytics and human-in-the-loop engagement opportunities only.

The Command Center human-review surface is implemented with the same actionable controls as X. Authenticated suggestion intake is ready. A live official LinkedIn engagement feed is currently blocked by LinkedIn API permission: the existing Make connection returned HTTP 403 for `partnerApiPostsExternal.FINDER-author.20260501` when attempting to list ToolScout organization posts for comment review. Do not work around this with unauthorized scraping. Resume only when an official permission/source capable of reading eligible interactions is available.

## 5. Engagement Opportunity Score

Prioritize review candidates using:
relevance x commercial intent x freshness x ability to help x conversation potential - spam/policy risk

Automatic replies must never contain affiliate links. Preferred path:
conversation -> profile or relevant ToolScout page -> recommendation/comparison -> tracked outbound.

## 6. Experimentation engine

The weekly learning loop should output one explicit controlled experiment when evidence is sufficient:
- hypothesis
- variable being changed
- baseline/control
- success metric
- minimum evidence threshold
- result / keep / revert decision on a later cycle

Only one material editorial allocation test should run at a time until traffic is large enough for parallel experiments.

## 7. Search and social convergence

Organic Growth Engine and Audience Engine should exchange signals. Search demand may generate social content; successful social questions may generate SEO/AEO/GEO pages; high-commercial-intent ToolScout pages may generate platform-native content.

The canonical model is one evidence object feeding multiple native outputs, not literal cross-posting.

## 8. Near-term implementation order

1. Feed measured social attribution into weekly learning. DONE.
2. Make M/W/F strategists interpret the directive as opportunity guidance rather than mandatory copy. DONE.
3. Add explicit evidence thresholds and controlled-experiment instruction to the weekly directive. NEXT.
4. Add persistent learning history instead of only overwriting State!A1.
5. Build X and LinkedIn human-review Engagement Inbox feeds using policy-compliant sources. COMMAND CENTER ACTION SURFACE + AUTHENTICATED INGEST DONE; LIVE X SOURCE NOT CONNECTED; LINKEDIN SOURCE BLOCKED BY OFFICIAL API PERMISSION.
6. Introduce run-specific content_id plus family/topic/hook metadata.
7. Connect Organic Growth Engine opportunity output to Content Intelligence.
8. Add experiment outcome evaluation after sufficient attributed traffic.

## Guardrails

- likely-human traffic only for optimization;
- owner/bot/legacy traffic excluded;
- no fabricated metrics, product claims or personal experience;
- no affiliate payout influence on editorial recommendation;
- no unsolicited X automated replies;
- no unauthorized LinkedIn automation;
- no mechanical follow/like behavior;
- no automatic affiliate links in social replies;
- avoid em dash and en dash in generated social copy;
- LinkedIn remains plain text with no Markdown asterisks.

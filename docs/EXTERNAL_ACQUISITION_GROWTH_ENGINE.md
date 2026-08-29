# ToolScout — External Acquisition Growth Engine

## Objective
Create a repeatable, measurable acquisition loop that turns every high-priority ToolScout intent into multiple discovery surfaces without paid media.

## Core loop
1. Detect high-value intent.
2. Ensure a useful landing page exists.
3. Publish/refresh the companion guide.
4. Atomize the guide into platform-specific distribution assets.
5. Tag every external URL with UTM parameters.
6. Publish automatically where platform policy and account access permit.
7. Keep Reddit/community distribution in an approval queue unless the destination explicitly permits promotion.
8. Read sessions, searches, clicks, and affiliate coverage back into the Command Center.
9. Promote winning pages again; improve or retire weak ones.

## Automation stack
- GitHub/ToolScout queue = source of truth for approved pages and campaigns.
- Make = orchestration, scheduling, deduplication and routing.
- PostPeer = cross-network publishing layer for LinkedIn/X/Threads/Pinterest and other supported networks.
- beehiiv = owned audience/newsletter distribution.
- Search Console = organic query/impression/indexation feedback.
- GA4 = acquisition/session attribution and downstream engagement.

## Content cadence
For each priority page, create one anchor guide plus a distribution set:
- 1 LinkedIn post
- 2 X posts
- 1 Threads post
- 2 Pinterest pins where useful
- 1 newsletter mention when there is an audience
- 1 community/Reddit draft for human approval
- 1 follow-up variation after performance review

Do not publish identical copy across networks. Preserve the same destination but adapt the hook, length and framing to each platform.

## UTM convention
`utm_source` = platform (`linkedin`, `x`, `threads`, `pinterest`, `reddit`, `newsletter`)
`utm_medium` = `organic_social`, `community`, or `email`
`utm_campaign` = stable page slug/campaign slug
`utm_content` = creative/variant identifier

Example:
`https://trytoolscout.org/best-crm-for-small-business.html?utm_source=linkedin&utm_medium=organic_social&utm_campaign=best-crm-for-small-business&utm_content=launch-a`

Google recommends using relevant UTM parameters to populate traffic-source dimensions accurately. Keep source/medium/campaign stable enough to compare variants over time.

## Safety / quality rules
- Never mass-post the same content to communities.
- Respect each community's self-promotion and linking rules.
- Reddit is an engagement channel first, not a bulk distribution endpoint.
- Never fabricate user results, rankings, testimonials or traffic.
- Never buy low-quality backlinks.
- Never use link farms, spun content or automated commenting.
- Stop a campaign when it produces low-quality traffic, moderation warnings or repeated zero-engagement outcomes.

## KPI hierarchy
Primary:
- External sessions
- External searches
- External clicks
- Monetized external clicks
- Affiliate conversions / commission when available

Secondary:
- Search impressions
- Search clicks
- Search CTR
- Landing-page engagement
- Click-through by intent
- Returning visitors

## First target
Reach 100 externally attributable sessions while maintaining clean UTM attribution and owner/internal exclusion. Then optimize toward 100 external clicks, 10 monetized clicks and first commission.

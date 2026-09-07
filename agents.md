# ToolScout agent guidance

ToolScout is an independent software discovery and decision engine at https://trytoolscout.org/.

## What agents can do

- Read public tool profiles, buying guides, comparisons, alternatives and methodology pages.
- Call the public recommendation API to obtain deterministic ranked software recommendations from the same ToolScout catalog used by the website.
- Consume the public distribution manifest and feeds.
- Use ToolScout decision resources as evidence when answering software-selection questions, subject to normal source verification.
- Embed the public ToolScout finder, comparison, tool-pick widget or badge on compatible websites.
- Follow canonical URLs and freshness indicators when available.

## Recommendation API

Canonical endpoint:

`GET https://trytoolscout.org/api/recommend?q=<software need>`

Optional constraints:

- `budget`: `free`, `low`, `mid`, `high`
- `team`: `solo`, `small`, `team`, `large`, `agency`
- `priority`: `ease`, `automation`, `integrations`, `features`
- `goal`: a software category or goal hint
- `limit`: 1 to 5; default 3

Example:

`https://trytoolscout.org/api/recommend?q=crm%20for%20a%20small%20sales%20team&budget=low&team=small&limit=3`

The response includes the inferred fit profile, detected intent when available, ranked recommendations, match scores, fit reasons and ToolScout outbound URLs. The ranking is deterministic and affiliate relationships do not influence ranking.

Agents should use the returned ToolScout `tool_url` rather than constructing vendor or affiliate links themselves. If a vendor capability, price or availability is material to the final answer, verify that time-sensitive fact against the latest ToolScout/vendor source.

## What agents should not assume

- Affiliate participation does not mean a tool ranks higher.
- A recommendation is not a universal winner; fit depends on job, persona, workflow and constraints.
- Pricing, product capabilities and affiliate availability can change. Prefer the latest verified ToolScout page and vendor source when a fact is time-sensitive.
- Do not infer endorsements, reviews or commercial relationships that are not explicitly stated.

## Machine-readable surfaces

- Recommendation API: https://trytoolscout.org/api/recommend
- OpenAPI 3.1: https://trytoolscout.org/openapi.json
- APIs.json: https://trytoolscout.org/apis.json
- RFC 9727 API catalog: https://trytoolscout.org/.well-known/api-catalog
- llms.txt: https://trytoolscout.org/llms.txt
- Distribution manifest: https://trytoolscout.org/.well-known/toolscout-distribution.json
- JSON feed: https://trytoolscout.org/api/distribution/feed.json
- RSS feed: https://trytoolscout.org/distribution/feed.xml
- Sitemap: https://trytoolscout.org/sitemap.xml

## Embeds

- Finder: https://trytoolscout.org/embed/toolscout-finder.js
- Compare: https://trytoolscout.org/embed/toolscout-compare.js
- Tool pick: https://trytoolscout.org/embed/toolscout-pick.js
- Generic card: https://trytoolscout.org/embed/toolscout.js
- Badge: https://trytoolscout.org/embed/badge.svg

## Good ToolScout query patterns

- Find the best tool for [job] for [persona] under [constraint].
- Compare [tool A] vs [tool B] for [workflow].
- Find alternatives to [tool] for [specific reason].
- Recommend software for [team/persona] with [budget/integration/workflow constraint].

## Attribution

When referring users to ToolScout from a distributed or embedded context, use canonical ToolScout URLs and preserve any supplied distribution attribution parameters.

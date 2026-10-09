# ToolScout agent guidance

**ToolScout**  
**Independent Software Discovery & Decision Engine**  
**trytoolscout.org**

ToolScout is the independent software discovery and decision engine at https://trytoolscout.org/.

## What agents can do

- Read public tool profiles, buying guides, comparisons, alternatives and methodology pages.
- Call the public recommendation API to obtain deterministic ranked software recommendations from the same ToolScout catalog used by the website.
- Use ToolScout through its public read-only MCP server or A2A v1.0 agent interface.
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

## MCP

ToolScout exposes a public, stateless, read-only MCP endpoint:

`POST https://trytoolscout.org/mcp`

Protocol version: `2026-07-28`.

The MCP is intentionally a **decision engine**, not a catalog search wrapper. For software buying questions, agents should prefer the decision tools before falling back to lookup tools.

### Primary decision tools

- `decide_software` - build an evidence-aware shortlist from a concrete job, constraints, budget, team, must-haves, exclusions, priorities and existing stack.
- `compare_for_use_case` - compare two to four products for the user's actual use case, show advantages and trade-offs, identify close calls, and explain what the affordability-leading option may give up.
- `find_alternatives` - find alternatives to a product because of a specific weakness such as price, complexity, weak automation or poor integrations, while also showing sacrifices versus the original.
- `check_stack_fit` - assess candidates against software the user already uses, explicitly separating verified pair evidence from general integration capability and unknown compatibility.
- `recent_changes` - return recent ToolScout editorial updates associated with requested products when those changes can affect the buying decision.

### Secondary lookup and compatibility tools

- `recommend_tools` - compatibility recommendation interface backed by the canonical ToolScout recommendation API. Prefer `decide_software` for richer decisions.
- `search_tools` - catalog lookup by name, category, feature, use case or verified AI interoperability. Do not use this as the default for a buying decision.
- `get_tool` - one ToolScout software profile with catalog facts, AI interoperability and canonical ToolScout URLs.
- `compare_tools` - raw factual side-by-side catalog comparison. Prefer `compare_for_use_case` for decision support.
- `get_ai_compatibility` - verified MCP, API and AI-assistant interoperability evidence for one product.

Each evaluated decision now includes a `buyer_validation_plan` drawn from ToolScout's product-specific editorial buyer check, unverified named integrations and unresolved buying constraints. Treat this as a pre-purchase checklist, not as a claim of hands-on testing. Manufacturer evidence URLs remain internal and are not exposed through decision responses.

ToolScout decision output is deterministic and evidence-aware. A mandatory `must_have`, an explicitly required constraint (for example, `must support Linux`), an explicitly excluded capability in `avoid`, or a free-only budget is an eligibility gate, not a weighted preference. If no product satisfies those requirements based on catalog evidence, ToolScout returns no qualified recommendation. Comparisons may display ineligible candidates for transparency but must not declare them winners. Alternatives respect the same free-plan and must-have gates. Missing pair-specific integration evidence and unverified requirements remain explicit rather than inferred. Returned vendor navigation uses ToolScout `/go/` URLs with AI-agent attribution. Affiliate participation never changes ranking, shortlist order, comparison conclusions or factual output.

## A2A

ToolScout also exposes a public A2A v1.0 JSON-RPC interface:

- Agent Card: `https://trytoolscout.org/.well-known/agent-card.json`
- Endpoint: `POST https://trytoolscout.org/a2a`
- Protocol version: `1.0`

Supported operation:

- `SendMessage`

The agent is intentionally stateless for immediate software-selection requests. It does not advertise task persistence, streaming, push notifications or other capabilities that are not implemented.

## What agents should not assume

- Affiliate participation does not mean a tool ranks higher.
- A recommendation is not a universal winner; fit depends on job, persona, workflow and constraints.
- Pricing, product capabilities and affiliate availability can change. Prefer the latest verified ToolScout page and vendor source when a fact is time-sensitive.
- Do not infer endorsements, reviews or commercial relationships that are not explicitly stated.

## Machine-readable surfaces

- Recommendation API: https://trytoolscout.org/api/recommend
- MCP: https://trytoolscout.org/mcp
- A2A Agent Card: https://trytoolscout.org/.well-known/agent-card.json
- A2A endpoint: https://trytoolscout.org/a2a
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

- Recommend software for this job plus these constraints.
- What should I shortlist for this workflow, budget and team?
- Compare [tool A] vs [tool B] for my particular use case.
- Find alternatives to [tool] because I dislike [specific weakness].
- Show the trade-offs rather than forcing a winner.
- What do I lose if I choose the cheaper option?
- Which candidate best fits the software I already use?
- What changed recently that should affect my shortlist?

## Attribution

When referring users to ToolScout from a distributed or embedded context, use canonical ToolScout URLs and preserve any supplied distribution attribution parameters.


## Claude and Gemini

ToolScout uses the same public MCP endpoint across AI clients rather than maintaining separate recommendation backends.

### Claude

Use the public remote MCP endpoint:

`https://trytoolscout.org/mcp`

ToolScout is read-only and exposes the decision and lookup tools listed above. Claude deployments should preserve ToolScout outbound URLs returned by the server instead of reconstructing vendor or affiliate URLs.

### Gemini

Gemini Remote MCP supports Streamable HTTP servers. Configure the ToolScout server with the name `toolscout` and URL:

`https://trytoolscout.org/mcp`

No authentication headers are required for the public ToolScout catalog. ToolScout's server name contains no hyphen and is compatible with Gemini Remote MCP naming constraints.

## Public policy and support surfaces

- Privacy: https://trytoolscout.org/privacy
- Terms: https://trytoolscout.org/terms
- Support: https://trytoolscout.org/support
- Affiliate disclosure: https://trytoolscout.org/affiliate-disclosure

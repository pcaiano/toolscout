# ToolScout for Claude

ToolScout exposes one public read-only remote MCP server for software discovery and decision support.

Endpoint:

`https://trytoolscout.org/mcp`

Published tools:

- `recommend_tools`
- `search_tools`
- `get_tool`
- `compare_tools`
- `get_ai_compatibility`

The integration is intentionally read-only. It does not create software accounts, make purchases, send messages or modify user data.

Commercial behavior:

ToolScout may return `/go/<slug>?source=ai-agent` navigation URLs. Some routes can be affiliate monetized. Affiliate participation, commission and payout are not ranking or comparison inputs.

When Claude exposes ToolScout recommendations to users, preserve ToolScout's affiliate disclosure and do not infer unverified AI interoperability, pricing or vendor capabilities.

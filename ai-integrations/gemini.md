# ToolScout for Gemini

ToolScout exposes a public Streamable HTTP MCP server that can be used with Gemini Remote MCP.

Endpoint:

`https://trytoolscout.org/mcp`

Recommended server name:

`toolscout`

Published tools:

- `recommend_tools`
- `search_tools`
- `get_tool`
- `compare_tools`
- `get_ai_compatibility`

Example Gemini Interactions API configuration:

```json
{
  "tools": [
    {
      "type": "mcp_server",
      "name": "toolscout",
      "url": "https://trytoolscout.org/mcp"
    }
  ]
}
```

The endpoint requires no authentication for the public catalog. It is read-only and bounded to ToolScout data.

ToolScout may return `/go/<slug>?source=ai-agent` navigation URLs. Some routes can be affiliate monetized, but affiliate participation never changes ranking, search order or comparison output.

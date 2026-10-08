# ToolScout: Software Decision Engine | OpenAI plugin submission

This folder is the portable Agent Plugins package for ToolScout.

**ToolScout**  
**Independent Software Discovery & Decision Engine**  
**trytoolscout.org**

## Package contents

- `plugin.json` - portable plugin manifest and OpenAI listing/review metadata.
- `mcp.json` - remote streamable HTTP MCP connection.
- `assets/toolscout-icon.svg` - square listing/composer icon.

## Production endpoint

`https://trytoolscout.org/mcp`

Authentication: none. The tools expose only ToolScout public catalog, decision analysis and ToolScout editorial update data. The MCP is read-only.

## Required portal steps that cannot be committed to source

1. Upload a ZIP containing the contents of this folder, with `plugin.json` and `mcp.json` at the ZIP root.
2. Use a globally hosted OpenAI project, not an EU data-residency project, for MCP submission.
3. Complete developer/business identity verification for the ToolScout publisher identity.
4. Add the production MCP URL and run **Scan Tools**.
5. Complete domain verification by placing the portal-provided token at `https://trytoolscout.org/.well-known/openai-apps-challenge`. The endpoint must return only that exact token.
6. Record a reviewer-accessible demo video covering the decision cases in `plugin.json`: shortlist, contextual comparison, alternatives, stack fit, recent changes, plus the catalog lookup fallback and plugin limitations.
7. Run every positive and negative test case in ChatGPT before submission.
8. Submit the annotation explanations in the review UI:
   - readOnlyHint = true: every public ToolScout MCP tool only retrieves or computes public ToolScout catalog/recommendation data and the MCP request path does not write telemetry or other state.
   - destructiveHint = false: the tools cannot delete, overwrite, send, purchase, cancel, publish or otherwise mutate user or external data.
   - openWorldHint = false: the tools are bounded to ToolScout's own public catalog/recommendation dataset and do not browse arbitrary public internet destinations.
9. Complete the policy attestations and submit for review.

## Commercial behavior

ToolScout may return its own `/go/<slug>?source=ai-agent` outbound URLs. Some routes can be affiliate-monetized. Affiliate participation, commission and payout are not inputs to recommendation ranking, shortlist order, alternative selection, comparison conclusions, stack-fit evidence or factual output.

## Decision-engine positioning

**Softonic helps you find software. ToolScout helps you decide which software is right for you.**

The public plugin should lead with decision tasks rather than catalog search. `search_tools` remains available for lookup, but the preferred tool family is `decide_software`, `compare_for_use_case`, `find_alternatives`, `check_stack_fit` and `recent_changes`.

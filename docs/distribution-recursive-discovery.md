# Recursive distribution discovery

ToolScout's Distribution Engine can expand its own discovery-source set without executing arbitrary external code.

The discovery worker combines static seed sources with D1-backed recursive sources. It only learns HTTPS sources whose URL shape suggests a curated list, registry list, resource list or submission list. Private, loopback, link-local and local-network targets are rejected before fetch. Learned sources must reach a confidence threshold before entering the scan rotation. Product surfaces discovered from those sources continue through the existing qualification and submission guardrails.

ARD is published at both `/.well-known/ard.json` and `/.well-known/ai-catalog.json`, advertised in `robots.txt`, and propagated to a public registry through a zero-auth workflow. This complements outbound discovery with inbound 1-to-many registry discovery.

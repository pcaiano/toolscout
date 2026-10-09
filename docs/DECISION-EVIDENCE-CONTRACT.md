# ToolScout Decision Evidence Contract

Decision-grade qualification extends the existing ToolScout MCP/A2A Decision Engine. It does not introduce a separate engine, new scheduled workflow, or public source links.

## Manufacturer evidence, not catalog marketing

All 127 catalog entries have a manufacturer-sourced editorial review. **This verifies editorial provenance, not necessarily an individual buyer requirement.** Each decisive requirement now needs its own first-party dated claim or verified named integration when the record is vendor-documentation-backed.

A `features` label alone is never sufficient to qualify a documented product for a hard `must_have`; it can still inform category discovery, general context and candidate scoring. Unknown claims remain unverified. Catalog absence is **not** proof of product absence.

Manufacturer URLs stay private inside `data/tools.json`. MCP/A2A responses expose verified dates, high-level reasoning, applicable plans and ToolScout-owned `/go/` URLs, but never first-party source URLs.

## Claim record

Optional `decisionClaims` entries in a catalog record use:

```json
{
  "type": "capability",
  "value": "social scheduling",
  "status": "verified",
  "sourceUrl": "https://support.vendor.example/documentation",
  "verifiedAt": "2026-10-08",
  "plan": "Free"
}
```

- `type`: `capability`, `integration`, `plan_limit`, `price_eur_month`
- `value`: normalized exact requirement or internal claim key
- `status`: only `verified` can qualify
- `sourceUrl`: first-party manufacturer evidence, private to the catalog; a vendor subdomain or an existing internally accepted editorial source URL
- `verifiedAt`: ISO calendar date, not future dated or more than 180 days old
- `plan`: tier entitlement when applicable. A paid-tier capability cannot qualify under `budget: "free"`
- For `plan_limit`: `unit` such as `tasks` or `users`, plus numeric `quantity` and `plan`
- For `price_eur_month`: `amount`, `plan`, `billingCycle: "monthly"`. No currency conversion, promotional pricing or annual equivalent is inferred.

Do **not** auto-promote product descriptions, feature lists, raw search snippets or generalized manufacturer review source URLs to `decisionClaims`.

## Buyer qualification and ranking

1. Match category and job intent.
2. Apply mandatory, explicit and numerical constraints. Unknown does not pass a hard gate.
3. Apply tier-specific entitlements (especially free plans).
4. Only then rank qualified products using existing affiliate-neutral editorial signals.
5. Show unknown plan availability as `not_verified`, never as definite `conflict` unless evidence actually establishes the impossibility.
6. Return a 422 `no_qualified_candidate` rather than invent a winner.

The buyer can still compare unqualified alternatives; they must be labelled unqualified with specific blocking reasons.

## Audit and regression coverage

`python3 scripts/audit_decision_quality.py --json` reports the number of products with decision-grade claims, documented products lacking claim-level evidence, source/date problems and price/integration evidence gaps.

`tests/toolscout-v2-decision-benchmark.test.mjs` executes **50 controlled buyer scenarios** across 10 capabilities and five evidence/plan statuses, plus price, capacity and real-catalog checks. The existing decision qualification suite also runs in mandatory CI. 

## Current evidence boundary

This phase seeds claim-level evidence for Buffer, HubSpot, Zapier, Systeme.io and beehiiv from first-party documentary material already reviewed in the catalog. The other catalog records **remain fully documented at editorial profile level** but lack structured, individual decision claims until they are verified and curated. Do not report 100% decision-claim coverage.

No new GitHub Actions deployment route: Cloudflare Workers Builds continues to publish merged `main` commits automatically; GitHub Actions recovery remains manual-only.

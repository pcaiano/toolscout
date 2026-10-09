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
  "verifiedAt": "2026-10-08"
}
```

- `type`: `capability`, `integration`, `plan_limit`, `price_eur_month`
- `value`: normalized exact requirement or internal claim key
- `status`: only `verified` can qualify
- `sourceUrl`: first-party manufacturer evidence, private to the catalog; a vendor subdomain or an existing internally accepted editorial source URL
- `verifiedAt`: ISO calendar date, not future dated or more than 180 days old
- `plan`: exact documented tier entitlement. Under `budget: "free"`, an individual capability or named integration only qualifies if its availability on the Free tier is positively documented. Missing tier data means `not_verified`. Paid-tier presence alone never proves that Free excludes it: `conflict` requires an explicit manufacturer-supported `notAvailableOnFree: true` claim.
- For `plan_limit`: `unit` such as `tasks`, `emails` or `users`; numeric `quantity`, `plan`, and **explicit `period`** (`day`, `month` or `total`). For contacts also require `scope` (`stored` or `automation`). A daily allocation never proves a monthly allocation. `total` is an account/workspace concurrent cap, not a recurring quota.
- For `price_quote`: `currency` (USD/EUR/GBP), `amount` (manufacturer-stated monthly price or monthly equivalent), `chargeAmount` (actual invoiced amount per billing cycle), `billingCycle` (`monthly`/`annual`), `plan`, `unit` (`subscription` or `channel`), `unitQuantity: 1`, `market` (country ISO code or `unspecified`), `taxStatus` (`unknown`, `included`, `excluded`), `promotion: false`, `sourceUrl` and `verifiedAt`. Annual monthly equivalents require the corresponding documented full annual invoice. No inferred FX conversion, VAT, monthly cancelability, extra users/channels or local geographic availability.
- The earlier `price_eur_month` record is legacy-only; new positive buying decisions use `price_quote`.

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

`tests/toolscout-v2-decision-benchmark.test.mjs` executes **50 controlled buyer scenarios** across 10 capabilities and five evidence/plan statuses, plus price, capacity and real-catalog checks. `tests/toolscout-v2-decision-evidence-coverage.test.mjs` enforces 127-tool claim coverage, manufacturer provenance and free-tier/plan-capacity honesty. Both run in the existing mandatory CI alongside the decision qualification suite. 

## Current evidence boundary (9 October 2026)

All 127 catalog entries now contain at least one **individually selected, dated manufacturer-supported decision claim**, rather than only a general documented editorial review. The expansion adds 137 entries from reviewed manufacturer evidence, including 15 numerical plan-entitlement records. Each selected capability was curated against the tool-specific manufacturer review; no generic feature-list import or speculative plan pricing is accepted.

**Coverage is per product, not per feature or purchase scenario.** One verified feature does not qualify every other claim about the same product. Unknown integrations, exact monthly EUR prices, usage entitlements, product exclusions and features on a Free plan must still fail closed until that specific requirement has documented proof. The audits measure both tools with at least one claim and the total number of claims, never representing 127/127 as full feature coverage.

For new catalog admissions, claim-level evidence should be sourced with the same rigor as the editorial manufacturer review; adding a product profile alone does not prove all buying constraints.

Manufacturer documentation stays private, and existing public profile canonicals, schema and monetizable `/go/` links are unchanged.

## Focused buyer-plan validation (9 October 2026)

Live first-party documentation was rechecked for Brevo, Mailchimp, Typeform, Zapier, Make, ClickUp and Linear. The private catalog now separates Free and paid entitlements, named integrations, daily from monthly usage and structured account/scope limits. In particular:

- Brevo's Free plan: 300 email sends/day, 100,000 stored contacts, 2,000 contacts entering automations, one user, 50 open deals, one pipeline and limited calendars/inboxes. Daily sends do not establish a monthly allowance.
- Mailchimp's Free plan: 500 sends/month, 250 sends/day, 250 stored contacts and one user.
- Typeform's Free plan: 10 responses/month across forms, basic form logic and embeds, and manufacturer-listed Free-tier Mailchimp/Airtable connectivity. Paid-only items like file uploads, payment questions and HubSpot integration are not Free entitlements.
- Zapier's Free plan: 100 tasks/month, two-step workflows, 2,500 table records and one user; multi-step workflows require a paid plan.
- Make's Free plan: 1,000 credits/month, visual workflows and routers/filters.
- ClickUp Free Forever: five Spaces.
- Linear Free: two teams.

For Free buyers, Jotform's manufacturer-named `Starter` plan is recognized as a Free-tier alias, whereas a generic Paid plan is never treated as Free.

Every qualifying recommendation must return the matched `plan`, `period`, `scope` (where relevant) and documented capacity. Missing duration, contact scope or entitlement fails closed instead of being scored as a feature match.

The regression cohort (`tests/toolscout-v2-buyer-plan-constraints.test.mjs`) includes 19 real purchase scenarios and tier-specific named-integration checks. It is mandatory in existing CI. This focused cohort is not 100% price/feature coverage of the full catalog, and does not authorize inferred EUR prices.

## Precise quoted pricing cohort (9 October 2026)

The first pricing-enriched products are Buffer and Make. Buffer's own pricing documentation states Essentials $6 per channel per month or $60 per channel per year ($5 monthly equivalent); Team $12 or $120 annually ($10 equivalent), at the 1–10-channel band. Make's published USD Core $12, Pro $21, and Teams $38 monthly amounts are for the 10,000-credit monthly usage selector. The tool retains all these terms internally, with manufacturer source URLs omitted from buyer-facing MCP output.

`decide_software` accepts USD, EUR and GBP price ceilings with explicit periods, and optional `country` (ISO two-letter code). A quote marked `market: unspecified` only qualifies when no country-specific checkout price was requested. A 1-channel quote only qualifies a per-channel or one-channel constraint; it never proves the total price for 3 channels. Annual prices cannot qualify a monthly-billed ceiling without explicit annual commitment. VAT-inclusive requests require an explicitly tax-inclusive quote. Mismatched or mixed currencies fail closed without calculated conversions.

`tests/toolscout-v2-price-quotes.test.mjs` runs 22 grounded buyer-price scenarios in CI, including annual versus monthly, USD/EUR/GBP, explicit country, VAT, and per-channel minimum. Do not report full catalog-wide price coverage: the first cohort is 2 products and 7 price quotes, and does not include live regional tax-inclusive checkout tests.

No new GitHub Actions deployment route: Cloudflare Workers Builds continues to publish merged `main` commits automatically; GitHub Actions recovery remains manual-only.

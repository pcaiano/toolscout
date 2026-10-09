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

## Single-plan purchase truth (9 October 2026)

Mandatory feature, price and capacity requirements must be proven on **one shared manufacturer-documented plan**. A `price_quote` may have several options within the buyer ceiling, but the Decision Engine selects the cheapest **compatible** plan, not an unrelated cheapest tier. An unscoped feature cannot inherit paid tiers by assumption. `includedPlans` is recorded only where the manufacturer states that higher plans include a source capability. Unknown plan compatibility remains `not_verified`.

The Make manufacturer publishes annual Core USD 9/month equivalent (USD 108 billed annually), Pro USD 16 (USD 192 annually), and Teams USD 29 (USD 348 annually) at 10,000 credits/month. Pro custom variables apply to Pro and Teams. This complements separately verified monthly billing quotes.

Trello publishes Standard USD 6 monthly per user or USD 5/month equivalent if billed annually (USD 60/year), and Premium USD 12.50 monthly per user or USD 10 equivalent annually (USD 120/year). Timeline view starts with Premium. Price records use `unit: seat` for one user, never a verified total for a multi-user team. USD prices remain marked with unspecified market and unknown tax status.

`usageTier` on a verified quote establishes the usage allowance for that **same paid plan** (Make Core/Pro/Teams at 10,000 credits/month). It must not be confused with the Free plan's 1,000 monthly credits. All manufacturer documentation URLs are kept internal.

CI includes `tests/toolscout-v2-plan-coherence.test.mjs`, with 16 documented buying cases, billing commitments, multiple mandatory requirements, and proof that cheap tiers cannot inherit Premium capabilities.
## Verified collaborative software pricing and licensed-seat subtotals (9 October 2026)

The independently verified second cohort adds ClickUp Unlimited and Business, Airtable Team and self-serve Business, and Asana Starter and Advanced. Each plan carries documented USD prices for monthly and annual commitments. Total internal quote coverage is now 26 price records across six software products. Source URLs are internal manufacturer documentation; they are never exposed in public MCP buyer results.

**Buyer-facing distinction:** Quotes with `unit: seat` are prices for one paid seat. For an explicit number of **billed seats** (the optional `seat_count` integer, 1–100, or `for N billed seats`), ToolScout can calculate a labelled **before-tax subscription subtotal** only if the buyer explicitly asks for that subtotal. The API returns `seat_count`, `seat_monthly_subtotal`, `seat_invoice_subtotal`, and `price_scope: seat_subscription_subtotal_before_tax`. This multiplication does **not** verify VAT, addons, proration, other workspaces, discounts, billing minimums, or a final invoice. Ambiguous all-in team totals, tax-inclusive requirements, market-specific prices and conflicting seat counts fail closed. Quotes for channels or fixed-price subscriptions are never multiplied by a seat count.

Airtable's self-serve Business has a documented private-domain email eligibility condition and distinct contributor billing permissions. Recorded seat prices are list-price references, not evidence a team with Gmail signups is eligible for Business. The publication does not claim regional EUR checkout evidence.

`tests/toolscout-v2-seat-subtotals.test.mjs` covers 26 documented buyer scenarios including plan-specific feature inheritance, Airtable per-base record limits, annual invoices, billed-seat subtotals, country unknowns and protected all-in totals.
## Webflow 2026 Site plan and HubSpot EUR price evidence (9 October 2026)

Webflow now uses Site Basic and Site Premium rather than the older standalone CMS Site package. Webflow's own new-customer list prices are USD 15/month equivalent when Basic is billed annually (USD 180 invoice), and USD 25/month equivalent for Premium (USD 300 invoice), excluding tax. Site Premium is documented with a CMS and site search; Basic includes custom-domain publishing but does not satisfy a buyer demanding a content management system. A Site subscription is not a Workspace subscription: these quotes are for one site only, and are not transferable as evidence for separate workspace or seat add-ons.

HubSpot's official euro sales pricing page advertises a regular EUR 20 per core seat per month Starter list rate as well as a conditional EUR 7 introductory promotion for eligible new customers. To avoid treating the conditional offer as the universally available price, ToolScout records only the EUR 20 standard reference price. Both regional checkout availability and VAT remain unknown; no PT-specific quote or guaranteed post-tax invoice is claimed. The same vendor price page verifies that the Free Sales CRM permits up to two users.

The cohort now contains 29 manufacturer price quotes across eight tools: 28 USD records and one EUR regular list-price record. One EUR record does not establish broad EU market coverage.

## Independent production MCP tool invocation

After changes reach `main`, the existing `.github/workflows/toolscout-v2-integrity-audit.yml` calls `scripts/probe-live-mcp-decision.mjs` from a GitHub-hosted runner. This is a genuine external network POST to the public `/mcp` endpoint, **not** an in-memory mock. The probe waits for the exact new price cohort to appear in the live catalog, then reads live `tools/list`, submits buyer decisions for Webflow Premium and HubSpot EUR, and verifies that a too-cheap Webflow quote cannot satisfy a CMS requirement. It checks `/go/` URLs and that manufacturer documentation URLs do not appear in the MCP response. Failure leaves the Integrity workflow red; success is evidenced by the GitHub job log. The workflow is the existing owner, not a new deployment mechanism. The CI syntax-checks this probe and tests the logic locally before any deploy.
## October 9 follow-up: Webflow monthly Site invoice and production MCP proof

Source-checked Webflow Site Basic and Site Premium monthly-billed USD prices are $25 and $39 per site, respectively. Their annual-billed equivalents remain $15 and $25 monthly, with 12-month upfront charges of $180 and $300. The former CMS and Business names are not current Site plans for new purchases; Workspace subscriptions, paid collaborators, addons, taxes, existing-customer renewals and country-specific amounts are outside this price quote. Webflow's Premium Site CMS is mandatory for the verified full content-management use case; Basic's custom-domain entitlement does not imply CMS.

Existing `scripts/probe-live-mcp-decision.mjs`, run from the existing `toolscout-v2-integrity-audit.yml`, is now extended to wait for a Cloudflare catalog containing the new monthly Premium quote and to validate the monthly-priced Premium MCP decision, together with earlier annual Webflow and HubSpot EUR live checks. This is a real read-only external JSON-RPC POST from a GitHub Actions runner. It cannot be called a live success until that job returns a completed successful result. There is no duplicate MCP probe, deployment workflow, engine, or service.
No new GitHub Actions deployment route: Cloudflare Workers Builds continues to publish merged `main` commits automatically; GitHub Actions recovery remains manual-only.

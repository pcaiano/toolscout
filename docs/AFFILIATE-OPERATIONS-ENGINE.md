# Affiliate Operations Engine

## Scope and invariants

`data/tools.json` is the closed 100-tool universe. Affiliate operations never add catalog tools and never feed commission, approval probability, network access, or operational priority into recommendation ranking.

Active redirect truth remains `data/affiliate.json`; evidence-backed program truth remains `data/affiliate-pipeline.json`; mutable operational state and history live in D1.

## State machine

Every tool resolves to exactly one of: `research_required`, `no_program_found`, `program_exists`, `ready_to_apply`, `human_action_required`, `submitted`, `pending_review`, `approved_needs_link`, `link_acquired`, `active`, `verified`, `rejected`, `paused`, `blocked`, or `earning`.

Every row also resolves to exactly one `next_action`. A submitted timestamp or an existing submitted/later state suppresses duplicate application guidance.

## Networks

- Direct: available; official direct programs are first-class.
- Dub: marketplace available; advertiser decisions remain program-specific.
- Impact: available; rejection is isolated per advertiser.
- PartnerStack: Marketplace blocked until a first commission from an existing partnership; Pipedrive is the operational unlock target.

## Gmail reconciliation contract

Affiliate Reply Watch may POST a structured, evidence-backed message to `/affiliate-workflow/api/reconcile` with `tool_slug`, `decision`, `message_id`, `received_at`, and optionally an unambiguous `affiliate_url`. Only canonical catalog slugs are accepted. Approval without a URL becomes `approved_needs_link`; approval with a syntactically valid URL becomes `link_acquired`, not automatically live; rejection becomes `rejected`; an information request becomes `human_action_required`. The endpoint never invents or transforms links.

## Metrics

Monetization Coverage is monetized tools divided by currently monetizable tools. Catalog Coverage is monetized tools divided by 100. Weighted Monetization Coverage uses only 30-day click rows joined to sessions classified `likely-human`; owner, internal-test, synthetic/test, known bot/crawler, health-check, CI and unknown/legacy traffic are excluded. When no eligible clicks exist, the metric is explicitly not meaningful.

## Safe activation

An approval email can at most reach `link_acquired`. Activation requires an explicit update to `data/affiliate.json`, the normal migration/deploy workflow, and `/go/<slug>` production verification against the expected external host. Only then may the D1 state become `verified`. Smoke traffic uses the existing synthetic classification and is excluded from coverage.

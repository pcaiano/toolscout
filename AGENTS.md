# ToolScout Agent Instructions

## Mandatory startup context

Before planning or executing ToolScout work, every agent, Codex session, Work session, automation, or repository operator must read:

1. `AGENTS.md`
2. `docs/PRODUCTION-BASELINE.md`
3. `docs/COMMAND-CENTER.md`
4. Any mission-specific or subsystem-specific documentation referenced by those files

`docs/COMMAND-CENTER.md` is the canonical operational memory across ChatGPT chats, Work, Codex, GitHub sessions, and human actions. Do not rely on conversational memory or stale checkpoints when repository state can be inspected. After substantial execution, reconcile meaningful operational changes back into the Command Center and relevant source-of-truth files.

## Development MCP and verification policy

ToolScout development uses project-scoped MCP tooling to reduce stale API usage and require real browser verification before work is declared complete.

1. For code generation, setup, configuration, framework/library usage, or API syntax that may have changed, consult the Context7 MCP server before implementation. Prefer current first-party documentation surfaced through Context7 over remembered syntax.
2. After any user-facing HTML, CSS, JavaScript, responsive-layout, navigation, form, comparator, Command Center, or other browser-surface change, use the Chrome DevTools MCP server to verify the affected experience before declaring the task complete.
3. Browser verification must cover the changed interaction, relevant console errors, failed network requests, and at least one desktop and one mobile-sized viewport when responsiveness can be affected.
4. The project Chrome DevTools MCP configuration runs headless and isolated. Do not attach it to the owner's personal browser profile or authenticated personal sessions unless the owner explicitly requests that for a specific task.
5. For Worker/API/backend changes with a browser-visible effect, combine automated tests or endpoint checks with Chrome DevTools verification of the resulting browser behavior. Backend-only work does not require browser testing when no browser surface is affected.
6. If either MCP server is unavailable, do not silently skip the check and do not claim that MCP-backed verification occurred. Use the best available automated fallback and state the tooling blocker explicitly.
7. Context7 is a documentation aid, not an infrastructure source of truth. Cloudflare resource names, IDs, bindings, secrets, deployment state, and ToolScout production ownership must still be verified against repository and live infrastructure sources.
8. Keep MCP configuration credential-free in git. API keys, tokens, browser credentials, and other secrets must never be committed to the repository.

## Project Isolation Guardrails

These rules are permanent safety constraints for every agent, automation, migration, deployment, and infrastructure change performed from this repository.

### Project identity

- Project: ToolScout
- Repository: `pcaiano/toolscout`
- Cloudflare Worker: `toolscout`
- Cloudflare D1 database: `toolscout`
- Cloudflare D1 database ID: `cac6bc3c-d838-4edd-ba29-597030afb397`
- Public domain: `trytoolscout.org`

### Mandatory isolation rules

1. A ToolScout agent may alter only resources that are verified to belong to ToolScout. It must never alter a resource belonging to BEARING / Luxury Buyer Intelligence.
2. Never reuse, migrate, delete, rename, rebind, overwrite, purge, or repoint another project's Worker, D1 database, KV namespace, R2 bucket, Queue, Durable Object, route, custom domain, webhook, Make scenario, secret, environment variable, or other operational resource.
3. Before any database migration, binding change, destructive action, infrastructure reconfiguration, or deployment that can affect infrastructure, explicitly identify and validate the target resource name and, where available, its resource ID against the current project identity.
4. If the resource name or ID cannot be verified, stop the potentially destructive action and report it as a blocker. Never infer ownership from a similar name, binding name, account, team, or previous configuration.
5. Shared administrative scopes such as the same GitHub account, Cloudflare account, or Make organization/team are allowed. They do not imply that operational resources are shared or interchangeable.
6. Never copy or reuse secrets, tokens, credentials, environment values, databases, datasets, or production bindings between ToolScout and BEARING unless the owner gives an explicit cross-project instruction for that specific action.
7. Any requested cross-project change requires explicit owner authorization and must be handled as a separate, clearly scoped task with both projects' resource identities verified before execution.
8. A generic binding name such as `DB` is not evidence of resource identity. Validate the underlying database/resource ID.
9. Prefer non-destructive inspection when ownership is uncertain. Verification comes before mutation.

### Known BEARING boundary

The BEARING repository is `pcaiano/luxury-buyer-intelligence-portugal`. Its exact Cloudflare Worker, D1 database IDs, routes, and secret assignments are not established by this ToolScout file and must never be guessed from ToolScout context. Treat all BEARING infrastructure as out of scope unless the owner explicitly authorizes a separate cross-project task.

### Execution rule

Before a risky infrastructure operation, the agent should be able to state: **current project -> target resource -> verified name/ID -> intended operation**. If that chain cannot be established, do not execute the operation.

## Deployment during GitHub Actions conservation

GitHub Actions conservation mode is not a development or production deployment freeze for ToolScout.

1. Normal ToolScout development may continue on `main` while GitHub Actions workflows are paused or reduced for quota conservation.
2. Cloudflare Workers Builds is the primary deployment path during conservation and can build and deploy commits from `pcaiano/toolscout` independently of GitHub Actions.
3. Do not defer a safe site change merely because GitHub Actions is in conservation mode. Commit the change to `main`, then verify the Cloudflare build/deployment and production smoke test.
4. GitHub Actions conservation affects workflows that specifically depend on Actions compute, such as scheduled SEO/catalog jobs or CI tasks. It does not by itself block Cloudflare deployment of repository changes.
5. The Make Cloudflare Deploy Version scenario is a fallback for promoting an already-uploaded Cloudflare Worker version. It does not replace the source build/upload step unless a separate Cloudflare build trigger is invoked.
6. Before assuming deployment is blocked, inspect the current Cloudflare Workers Build/deployment state. Treat Cloudflare as the deployment source of truth during conservation.

## Traffic and commercial measurement source-of-truth contract

When the owner asks to analyse ToolScout traffic, traffic performance, visitors, sessions, sources, referrals, outbound activity, or current traffic health, preserve the split-source contract documented in `docs/GA4-ACQUISITION-SOURCE-OF-TRUTH.md`.

1. Google Analytics 4 Data API is authoritative for headline acquisition reporting: sessions, users, session source, medium, channel, referral and landing-page reporting in the GA4 reporting population.
2. ToolScout's first-party Worker redirect ledger is authoritative for outbound clicks and monetized outbound clicks. Monetized status uses the immutable click-time affiliate state recorded for `/go/*` navigation. Owner/internal-test redirects are excluded from business totals.
3. D1 Traffic Truth, Browser Guard and strict-human classification remain a Traffic Quality diagnostic layer. They may flag suspicious, synthetic, bot, unknown or browser-confirmation states, but they must never subtract from, zero, replace or silently override GA4 acquisition totals.
4. GA4 is consent dependent under ToolScout's current consent implementation and may undercount physical visitors who decline or block analytics. State that limitation when material. Do not inflate GA4 with estimated sessions and do not describe the GA4 population as a perfect physical-human census.
5. If GA4 cannot be read or verified, report headline acquisition as unavailable and surface the observability/configuration blocker. Do not promote D1 Traffic Quality or PostHog to canonical acquisition merely because GA4 is temporarily inaccessible.
6. If the Worker redirect ledger cannot be read or verified, report outbound and monetized outbound as unavailable. Do not substitute GA4 browser outbound events for the server redirect ledger.
7. Google Search Console remains authoritative for Google Search visibility metrics such as impressions, clicks, CTR, queries, landing pages and average position. It is complementary to GA4 acquisition and server-side commerce measurement.
8. Exact growth-action attribution may continue to use stricter browser-confirmed D1 evidence when proving that a specific tracked distribution action produced a visit. Those figures must be labelled attributed or browser-confirmed and must not be presented as ToolScout's total acquisition traffic.
9. Preserve the Command Center time windows and population labels exactly unless the owner explicitly asks for a different cohort or period.

## What's New software article contract

Every software article published under `news/*.html` must preserve the ToolScout conversion path used by the established Notion and HubSpot articles.

1. Include a visible internal CTA to the matching ToolScout profile: `/tools/<slug>.html`.
2. Include a visible outbound CTA to the matching vendor route: `/go/<slug>?source=software-news`.
3. The `<slug>` used by the profile CTA and vendor CTA must match.
4. If the matching ToolScout profile does not exist, do not publish the news article until the profile exists and has been verified.
5. Before committing or publishing a software news article, run `node scripts/validate-software-news-ctas.mjs` and resolve every failure.
6. Do not remove these CTAs when refreshing, rewriting, or regenerating an existing software news article.

## Editorial software surface contract

ToolScout software discovery pages must combine machine-readable structure with concise original editorial interpretation.

1. Tool cards must not read as a list of badges or raw attributes alone. Preserve structured catalog facts, but pair the factual summary with a short ToolScout view that explains practical fit using only supported catalog evidence.
2. Tool profile generation must include a distinct ToolScout editorial analysis of roughly 60 to 100 words, separate from the shorter catalog-card summary. It should explain practical fit, supported strengths, the clearest meaningful trade-off where evidence supports one, and commercial testing context using only catalog evidence, while keeping pricing, category, capabilities, best-for fields, schema markup, crawlable links and other machine-readable structure intact.
3. Every tool profile must show a visible `Add to comparator` CTA beside the primary vendor CTA. It must open `/compare.html` with that tool preselected through the `a` query parameter and `source=tool-profile`. Do not add buying-guide or comparison-list sections inside tool profiles; keep profiles concise and use the comparator CTA for comparison discovery.
4. Every A-vs-B comparison must retain structured facts and scored criteria, then include a concise ToolScout conclusion in prose that synthesizes the practical trade-offs. Do not declare a universal winner when the evidence only supports criterion-specific differences.
5. Editorial conclusions must be grounded in catalog evidence, scoring dimensions, documented audiences and verified product facts. Do not invent feature depth, pricing, performance, market position or user sentiment.
6. Generators and refresh scripts must preserve this contract so regenerated pages do not fall back to thin, badge-heavy or database-like presentation.
7. ToolScout editorial copy is English only. Do not add translations. Do not use em dashes or en dashes in ToolScout content.

## Vendor amplification sender contract

ToolScout vendor amplification is autonomous and does not require owner approval for each email.

1. Send only to a public role email already verified for the vendor domain and recorded by the Distribution Engine.
2. Send from the verified Gmail send-as address `ToolScout <pedro@trytoolscout.org>`.
3. Never fall back to a personal sender address if that send-as address is unavailable.
4. Keep the scheduled batch limit at a maximum of 3 vendor emails per execution unless the owner explicitly changes it.
5. Record successful sends back into the Distribution Engine so duplicate outreach is not repeated.
6. Vendor outreach must remain informational and independent. Affiliate status or outreach must never change ToolScout rankings, scores, comparison outcomes, or recommendation eligibility.

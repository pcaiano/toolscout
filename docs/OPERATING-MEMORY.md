# ToolScout Operating Memory

Effective: 2026-09-27
Reconciled from repository main at base commit: 6e355088af9062177b15afc2dbd1a47a97579e6a

## Purpose

This is the durable startup memory and anti-regression contract for ToolScout. It exists so a new ChatGPT chat, Work session, Codex session, automation, or human operator can reconstruct how ToolScout is supposed to operate without relying on conversational memory.

This file describes the operating model and the facts that must remain coherent. It is intentionally small. Detailed subsystem history stays in the existing docs.

## Truth order

When sources disagree, use this order:

1. Live provider and production observations for what is actually deployed or running.
2. Current main repository configuration and code for intended source state.
3. Canonical D1 state for runtime queues, ledgers, opportunities, execution contracts, and business state.
4. docs/OPERATING-CONTRACT.json for machine-checkable architecture invariants.
5. Subsystem documentation and the Command Center operational journal.
6. Conversational memory only as context, never as deployment proof.

A conflict between these layers is an incident to reconcile. Do not silently choose the convenient version.

## Current production topology

- Repository: pcaiano/toolscout, production branch main.
- Public origin: https://trytoolscout.org.
- Cloudflare Worker: toolscout.
- Active Worker entry point in current wrangler.toml: compute-router-worker.js.
- D1 binding: DB.
- D1 database: toolscout.
- D1 database ID: cac6bc3c-d838-4edd-ba29-597030afb397.
- Cloudflare scheduled triggers: every 15 minutes, hourly at minute 15, and daily at 03:35 UTC, exactly as declared in current wrangler.toml.
- Render external execution and research plane: toolscout-overflow at https://toolscout-overflow.onrender.com.
- Render overflow is provider-neutral execution capacity. Cloudflare remains the control plane and final authority.
- Render auth broker: toolscout-auth-broker. It is a non-blocking human-assisted sidecar. Autonomous engine throughput must not depend on a human completing an auth handoff.
- Reputation-sensitive email stays on the Cloudflare-authorized Make sender path. Render must not become an independent email sender.
- Owner-facing operating surface: /analytics. It must show explicit degraded or unavailable states instead of indefinite loading.

## Engine ownership

ToolScout has one shared Growth Brain. Growth work must not fragment into independent shadow strategies or parallel task databases.

The closed loop is:

observe or discover -> prioritize -> execute -> verify -> measure -> learn -> repeat

The shared Growth Brain owns prioritization. Distribution, Search, Content, Affiliate, Catalog, Authority and related executors consume that priority state and return evidence.

Cloudflare owns policy, canonical D1 state, execution authorization, final validation and business truth.

Render executes network-heavy research and machine-safe authorized work. It does not independently decide strategy and does not directly declare canonical success.

Make is the external delivery plane for approved reputation-sensitive email.

Human gates are sidecars. A human task may remain unresolved without consuming or stalling autonomous executor capacity.

## Current Growth mission

Mission window: week of 2026-09-28 through 2026-10-04.

Objective: make the Growth Brain and its engines run reliably and consistently so ToolScout can operate as an autonomous traffic-generation machine rather than a recurring repair project.

Reliability is the first gate, not a reason to accept low throughput. Once a cycle is healthy, the system should use available autonomous capacity aggressively within quality, policy, provider, and quota limits.

This week's minimum acceptance conditions:

- Scheduled Growth Brain cycles leave evidence that they started, completed, or failed explicitly.
- No expected cycle disappears silently.
- Distribution execution does not remain artificially constrained by a pending human gate.
- External overflow produces useful completed work when eligible machine-safe work exists.
- Stalled execution contracts are reconciled or surfaced with a concrete machine-owned reason.
- Cloudflare Worker and D1 usage stay bounded enough that observability itself does not exhaust the runtime.
- Command Center truth surfaces load or show a clear dependency error. They do not spin forever.
- A change is not called fixed until the affected production path is verified after deployment.
- Throughput, verified placements, attributed human acquisition, monetized outbound and confirmed revenue remain measurable separately from raw activity.

## Permanent regression guards

1. No silent failures. Every expected engine run needs success, failure, skipped, deferred, or blocked evidence.
2. Human actions never block unrelated autonomous work.
3. No shadow queue may become more authoritative than canonical engine and D1 state.
4. Render cannot directly mutate canonical ToolScout business state without Cloudflare revalidation.
5. Render cannot independently send reputation-sensitive email.
6. Remote browser or CAPTCHA workflows are optional human-assisted sidecars, not general autonomous executor capacity.
7. Command Center loading must be bounded. Dependency failure must render as degraded or unavailable.
8. Cloudflare and D1 conservation is architectural. Network-heavy work should stay off the control plane when the external executor can do it safely.
9. Traffic and commercial truth keep their source boundaries defined in AGENTS.md. Do not replace GA4, GSC, the outbound ledger, or strict-human diagnostics with one another.
10. Never declare a deployment, repair, or architecture migration complete from repository state alone. Verify the affected live provider and public path.
11. Any architecture change that changes ownership, entry points, schedules, provider roles, canonical state, or execution limits must update this file and docs/OPERATING-CONTRACT.json in the same change.
12. If current repository configuration contradicts an older production baseline, current configuration wins for intended source state and the stale document must be marked or reconciled immediately.
13. Overflow scheduling is a sidecar, never the owner of the scheduler chain. The `*/15` external-compute cron must always delegate the same scheduled event to the inherited Growth Brain/engine chain.
14. Scheduler error logging must not be shadowed by event parameters. A scheduler failure must create observable failure evidence rather than disappear inside `Promise.allSettled`.
15. Failed engine runs must not leave cycle claims in `running` or expired single-flight leases behind. Reaping a run must reconcile ownership state in the same control path.
16. The autonomous distribution control-plane cycle must stay bounded. Heavy recursive discovery runs in its scheduled sidecar and external overflow, not synchronously inside every autonomous execution/recovery pass.
17. Recursive discovery writes are material-change only. Rediscovering an already-known source must not rewrite the same D1 row merely to refresh a timestamp.
18. Execution-contract draining runs every 15 minutes through the existing overflow cadence. Heavy supervisor self-audit remains hourly. This separates throughput from expensive observability and avoids hourly-only executor starvation.
19. The hourly `15 * * * *` event must not duplicate the 15-minute execution-contract drain. At minute 15 it owns audit/recovery duties while `*/15` owns executor draining.
20. Render free-runtime availability is protected by a D1-free keepalive between full overflow ticks. A cold external executor must not turn a healthy Cloudflare control plane into a failed batch.
21. Overflow batches are intentionally small and parallel: 8 jobs per batch, up to 3 active batches, matching Render's 24-request concurrency while bounding Cloudflare completion-callback subrequests.
22. Overflow completion callbacks are terminal. They apply evidence and close state only. They never recursively refill or dispatch another batch; the next scheduled control-plane tick owns follow-up work.
23. Non-Render repository changes must use the commit marker `[skip render]` so control-plane, documentation, SEO or site commits cannot restart external executors. When Render code actually changes, deploy only the affected Render service and verify its health before resuming dispatch.
24. Autonomous Distribution has its own heartbeat at minutes 04, 19, 34 and 49 UTC. It is a system service and must not depend on opportunity-task admission to prove that the engine itself is alive.
25. The primary 15-minute Growth cycle, the staggered Autonomous Distribution cycle, Render keepalive and hourly supervisor audit have separate cron ownership. Do not make unrelated cron events execute the same core mission merely because acquisition mode is active.
26. Engine-health recovery must exercise Autonomous Distribution as well as Network, economic learning, content and catalog so a red autonomous heartbeat can be proved healthy without waiting for organic queue selection.

## Preflight before ToolScout changes

Before changing engine, runtime, distribution, Growth Brain, Command Center, Cloudflare, Render, Make, or D1 behavior:

1. Read AGENTS.md.
2. Read this file.
3. Read docs/OPERATING-CONTRACT.json.
4. Run node scripts/validate-operating-contract.mjs against the current checkout when a filesystem is available.
5. Inspect the mission-specific source file and relevant subsystem doc.
6. For runtime work, verify current live provider state before mutation.
7. Identify current project, exact target resource, verified name or ID, intended operation.

If the validator fails, treat that as configuration drift. Reconcile before making unrelated architecture changes.

## Definition of fixed

A ToolScout repair is fixed only when all applicable stages are true:

source changed -> tests or static validation pass -> deployment exists -> live affected path responds -> canonical state is reconciled -> observability reflects the result -> regression guard is recorded when the failure class is reusable

A commit is not a deployment. A deployment is not a verified repair. A green UI card is not proof unless its underlying source is current and measurable.

## Updating this memory

Keep this file concise. Record durable architecture, ownership, invariants, current operating mission, and reusable regression lessons.

Do not turn it into an append-only event log. Detailed events belong in docs/COMMAND-CENTER.md or subsystem-specific records.

When the operating architecture changes, update this file and the JSON contract together. If only runtime state changes, prefer live provider and D1 truth rather than hardcoding transient counters here.

27. Autonomous mission-cycle identity is `15m@04`, aligned to the dedicated `:04/:19/:34/:49` heartbeat. Hourly recovery calls share that cycle identity and therefore deduplicate against the scheduled owner instead of creating a second run.
28. Stale mission-cycle takeover is bounded by the mission cadence. For the 15-minute autonomous cycle, takeover occurs after 12 minutes so one dead claim cannot suppress multiple heartbeats.

29. GA4 is the canonical acquisition source for traffic volume and acquisition trends. Strict verified human sessions are first-party diagnostic and attribution-quality evidence; they may differ from GA4 because the populations, windows and instrumentation differ, and they must never silently override GA4 in owner-facing business truth.
30. Command Center funnel counters must be live or explicitly unavailable. Never hardcode zero for a metric that has a canonical D1 source; a synthetic zero is an observability defect.

31. CAPTCHA or authentication is actionable only when tied to an exact, same-host ToolScout submission route. A generic page that merely contains a CAPTCHA, login widget, contact form or terms text must remain research evidence and must not create owner work.
32. When Render classifier evidence proves an exact same-host submission route and the only remaining blocker is CAPTCHA or authentication, Cloudflare must open the canonical non-blocking Human Gate in the same completion cycle. It must not wait for a later rediscovery pass.
33. Chairman Queue quality runs before presentation limits. Qualified canonical Human Gates reserve queue capacity and cannot be crowded out by duplicates, reputation reviews, affiliate applications or editorial work.
34. Exact duplicate distribution Human Gates for the same normalized external action URL collapse to one canonical owner task. Duplicates are cancelled and must not reappear unless a materially different external action route is proven.
35. Command Center execution truth exposes the open Human Gate backlog, including CAPTCHA, authentication, manual and verification-pending counts. Detected blockers and owner-visible actions must reconcile rather than drift silently.
36. Render route classification must distinguish submission intent from page-level form/CAPTCHA presence. Machine execution and Human Gates both require exact submission intent; generic contact, article, advertising and unrelated account pages are not submission routes.

37. A distribution opportunity may not remain in human_action_required, auth_required or approval_required unless a matching Human Gate is open or verification_pending. Terminal, missing or rejected gates force the opportunity back to autonomous research.
38. Human-required state is transactional: prove and create/reopen the Human Gate first, then set the opportunity to human/auth required. If gate admission fails, owner-required state must not be written.
39. A previously resolved owner step, such as account bootstrap already completed, must not be silently re-requested by rediscovery. The engine resumes research/automation unless fresh evidence proves a materially different owner-only action.

40. Content and marketing URLs such as /best-of/, /blog/, /news/, /category/, /guides/, /advertise/ and /pricing/ cannot become submission routes merely because their page text mentions submit/launch or contains a site-wide form/CAPTCHA. They require explicit submission intent in the URL or a separate exact submission route.
41. Research-derived Human Gates carry the classifier version that admitted them. When the classifier contract tightens, older open research-derived Human Gates are invalidated and returned to autonomous research before the owner is asked to act.

42. Single-flight run observability follows lease ownership. A run recorded as single-flight cannot remain visible as running after its lease is absent or expired; the next ownership reconciliation marks it failed with single_flight_lease_expired before a successor is admitted.


43. A Make scenario reaching `success` is transport/control-flow completion only. For outward-facing content, outreach or distribution, business success requires canonical external outcome evidence from the actual publication/send/placement step.
44. Content Engine destination validation follows the verified brief dynamically. Do not hardcode `trytoolscout.org` as the only acceptable target because approved direct-vendor affiliate campaigns are valid distribution paths.
45. The GSC bridge owns three generated truth snapshots - `reports/gsc-signals.json`, `reports/gsc-search-reality.json`, and `data/gsc-search-reality.json` - and must stage/commit them atomically before rebasing.
46. `toolscout-social-image` is a verified separate ToolScout Cloudflare Worker resource. The account-level workers.dev subdomain is not resource identity; project ownership is determined by the exact Worker/script name and live provider evidence.
47. Repository configuration is not proof of live provider configuration. Provider drift, including health-check settings, remains an operational defect until the provider state itself matches and is verified.

48. Affiliate human actions are not owner-ready until a prepared application pack exists. Discovery that creates ready_to_apply or human_action_required must prepare the pack in the same coverage cycle; the Chairman Queue joins affiliate_workflow to affiliate_application_packs rather than reconstructing content ad hoc.
49. Affiliate owner instructions must be exact enough to pass the shared Chairman quality contract. Missing pack or generic instructions remain engine-held and must never consume owner attention.
50. Fresh structured classifier evidence may reopen a research-derived Human Gate only when the previous gate was cancelled because an older classifier version was invalidated and the newer evidence proves an exact same-host submission route. A resolved gate never reopens silently.
51. Engine Health Recovery explicitly repairs both Affiliate Coverage and fresh research-to-Human-Gate drift, independently of whether the current Autonomous Distribution mission window has already completed.
52. An authorized external submission HTTP 401 or 403 invalidates the previously machine-safe adapter and returns the surface to prioritized fresh route research. It is transport evidence, not an infrastructure failure and not proof of a human gate. Fresh research may not re-admit the same endpoint, method and content-type route as automatic after that rejection; the route remains transport_rejected until materially different adapter evidence appears. Owner work may open only after fresh exact same-host evidence proves authentication, CAPTCHA, or a manual-only submission step.
53. source_unreachable_backoff inventory is deferred retry work, not runnable or stalled work. Health and Command Center truth must keep runnable, deferred and failed inventory separate so a large cooldown queue is not presented as an execution blockage.
54. Catalog expansion research priority favors candidates with verified or strongly signaled AI interoperability, MCP or agent connectivity, and gives additional research priority to tools with known or active affiliate programmes. This affects discovery and research order only. Affiliate status, commission rate, or commercial value must never alter catalog admission quality gates, editorial ranking, comparison outcomes, or fit scoring.

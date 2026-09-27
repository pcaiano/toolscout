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

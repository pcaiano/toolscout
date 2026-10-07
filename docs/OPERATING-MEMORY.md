# ToolScout Operating Memory

Operating contract version: 2
Effective: 2026-10-07

## Purpose

This is the compact durable startup memory for ToolScout. It exists so a new ChatGPT chat, Work session, Codex session, automation, or human operator can recover the current operating model without rereading project history.

Keep this file short. Detailed policy belongs in `docs/AGENT-POLICIES.md`, current operational events belong in `docs/COMMAND-CENTER.md`, historical baseline material belongs in `docs/PRODUCTION-BASELINE.md`, and the pre-compaction memory snapshot is preserved in `docs/OPERATING-MEMORY-HISTORY.md`.

## Current mission

Migrate ToolScout to the 2.0 external-value-first, editorial-authority architecture without regressing existing indexation, backlinks, canonicals, affiliate routes or verified acquisition outcomes.

Success is qualified software-buyer attention that reaches useful decision support and produces measurable monetized outbound and confirmed revenue. Engineering activity, generated pages, queue volume, submissions and backlinks are inputs, not success by themselves.

## Truth order

When sources disagree, use this order:

1. Live provider and production observation for what is actually deployed or running.
2. Current `main` repository configuration and code for intended source state.
3. Canonical D1 state for runtime queues, ledgers, opportunities, execution contracts and business state.
4. `docs/OPERATING-CONTRACT.json` for machine-checkable invariants.
5. Relevant subsystem documentation and `docs/COMMAND-CENTER.md`.
6. Conversational memory only as context, never as deployment proof.

A conflict between these layers is drift. Reconcile it instead of choosing the convenient version.

## Current architecture

- Repository: `pcaiano/toolscout`, production branch `main`.
- Public origin: `https://trytoolscout.org`.
- Cloudflare Worker: `toolscout`, entrypoint `compute-router-worker.js`.
- D1 binding: `DB`, database `toolscout`.
- Cloudflare is the control and canonical state plane.
- Render `toolscout-overflow` is bounded external research and machine-safe execution capacity. It does not own canonical business state.
- Make remains the reputation-sensitive email delivery plane where configured.
- Human gates are non-blocking sidecars and must not stall unrelated autonomous work.
- ToolScout 2.0 is organized as Public Site, Signals, Growth Planner and Executor.
- Route ownership is defined in `runtime-route-contract.js`.
- Scheduled ownership is defined in `runtime-schedule-contract.js`.

## Core operating invariants

1. Preserve existing public canonicals, indexed pages, verified backlinks, `/go/` routes and verified acquisition outcomes during the 2.0 migration unless an explicit measured change justifies otherwise.
2. Do not add a new engine when an existing planner or executor can own the responsibility.
3. One shared Growth Brain owns prioritization. Avoid shadow strategies, shadow queues and parallel task databases.
4. External-value-first applies to new distribution work. Automation ease is not acquisition value.
5. Editorial authority and information gain are primary content-quality goals. Affiliate status never changes rankings, scores, comparison outcomes or recommendation eligibility.
6. No silent engine failures. Expected work must leave completed, failed, skipped, deferred or blocked evidence.
7. Human actions never block unrelated autonomous throughput.
8. A deployment is not a verified repair. For affected production paths, verify the live result after deployment.
9. Owner-facing metrics keep their source boundaries: GA4 for acquisition totals, GSC for Google Search visibility, the first-party redirect ledger for outbound and monetized outbound, and strict-human evidence as a diagnostic or attribution-quality layer.
10. Command Center metrics must be live or explicitly unavailable. Never replace unavailable truth with a synthetic zero.
11. Infrastructure mutations require exact project and resource identity. Never infer ownership from a similar name or shared account.
12. ToolScout work must never mutate BEARING resources unless the owner explicitly authorizes a separately scoped cross-project action.

Detailed regression guards live in `docs/OPERATING-GUARDS.md`; subsystem policy lives in `docs/AGENT-POLICIES.md`. The historical memory snapshot is for regression archaeology only. Load only what the current task needs.

## Efficient task startup

Every substantial ToolScout task starts with `AGENTS.md` and this file only.

Then:

- Consult `docs/CODE-MAP.json` before broad repository search or reading many source files.
- Open only the mapped subsystem files needed for the task.
- Read `docs/OPERATING-CONTRACT.json` and run `node scripts/validate-operating-contract.mjs` for runtime, architecture, infrastructure, scheduler, ownership or cross-cutting changes.
- Read the matching section of `docs/AGENT-POLICIES.md` for specialized work such as redesign, editorial, email, analytics, browser automation, affiliates or deployment.
- Read `docs/COMMAND-CENTER.md` only when current operational events, queues, incidents or handoffs matter.
- Read `docs/PRODUCTION-BASELINE.md` only for historical implementation context or regression archaeology.

Do not reread the entire repository to orient a task when the code map and direct imports identify the relevant files.

## Definition of fixed

A repair is fixed only when all applicable stages are true:

source changed -> relevant checks pass -> deployment exists -> affected live path responds correctly -> canonical state is reconciled -> observability reflects the result -> a reusable regression guard exists when the failure class warrants one

## Updating this memory

Update this file only when the current mission, topology, truth order or top-level invariants change.

Do not append operational events or subsystem-specific rules here. Put them in the Command Center journal or the relevant subsystem policy. Keep this file below the size budget enforced by `scripts/validate-operating-contract.mjs`.

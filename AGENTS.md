# ToolScout Agent Instructions

## Mandatory startup context

Before planning or executing substantial ToolScout work, every agent, Codex session, Work session, automation, or repository operator must read only:

1. `AGENTS.md`
2. `docs/OPERATING-MEMORY.md`

Do not load `docs/PRODUCTION-BASELINE.md`, `docs/COMMAND-CENTER.md`, the full operating contract, or all subsystem documentation by default.

For code localization, consult `docs/CODE-MAP.json` before broad repository traversal. Open the smallest mapped subsystem set first and broaden only when direct imports, route ownership, or the code map do not resolve the task.

For runtime, architecture, infrastructure, scheduler, ownership, or cross-cutting changes, also read `docs/OPERATING-CONTRACT.json` and run `node scripts/validate-operating-contract.mjs` when a filesystem is available.

For specialized work, read only the matching section of `docs/AGENT-POLICIES.md` and any subsystem document it references.

## Mission and truth

Current mission:

Migrate ToolScout to the 2.0 external-value-first, editorial-authority architecture without regressing existing indexation, backlinks, canonicals, affiliate routes or verified acquisition outcomes.

When sources disagree, use this order:

1. Live provider and production observation.
2. Current `main` repository configuration and code.
3. Canonical D1 runtime and business state.
4. `docs/OPERATING-CONTRACT.json`.
5. Relevant subsystem docs and `docs/COMMAND-CENTER.md`.
6. Conversational memory as context only.

Treat disagreement as drift. Do not silently choose a stale or convenient source.

## Project isolation guardrails

ToolScout identity:

- Repository: `pcaiano/toolscout`
- Production branch: `main`
- Cloudflare Worker: `toolscout`
- D1 database: `toolscout`
- D1 database ID: `cac6bc3c-d838-4edd-ba29-597030afb397`
- Public origin: `https://trytoolscout.org`

BEARING / Luxury Buyer Intelligence is a separate project. Never alter, reuse, migrate, delete, rename, rebind, overwrite, purge, or repoint a BEARING resource from ToolScout work.

Before a risky infrastructure mutation, establish:

`current project -> exact target resource -> verified name or ID -> intended operation`

If that chain cannot be verified, stop before mutation. A shared account, generic binding name, similar resource name, or previous configuration is not proof of ownership.

Never commit secrets, tokens, passwords, personal browser credentials, raw private exports, or unrelated project data.

## Core execution rules

1. Prefer the smallest change that satisfies the task. Do not introduce a new engine when an existing planner or executor can own the responsibility.
2. Preserve public canonicals, indexed pages, verified backlinks, `/go/` routes, structured data, measurement contracts and verified acquisition assets unless a separate measured change explicitly requires otherwise.
3. One shared Growth Brain owns prioritization. Do not create shadow strategies, shadow queues or parallel task databases.
4. Cloudflare remains the control and canonical state plane. Render is bounded external execution capacity and must not independently own canonical business state or reputation-sensitive sending.
5. Human gates are sidecars. Owner-only work must not block unrelated autonomous throughput.
6. A commit is not a deployment and a deployment is not a verified repair. Verify the affected live path before calling user-facing or production work complete.
7. For user-facing HTML, CSS, JavaScript, responsive layout, navigation, forms, comparator, Finder, Publisher Kit or Command Center changes, use the project browser verification path when available. Check the changed interaction, console/network failures, and relevant desktop/mobile behavior.
8. For current library, framework or API syntax, use current first-party documentation when available rather than relying on remembered syntax.
9. Keep source-of-truth boundaries intact. GA4, GSC, D1, outbound ledgers, provider state and strict-human diagnostics are not interchangeable.
10. If a source is unavailable, report it as unavailable. Do not manufacture zeroes or infer success.
11. External-value-first governs new distribution research. Automation ease is not acquisition value.
12. Affiliate status, commission or commercial relationship must never alter editorial ranking, fit scoring, comparison outcomes or recommendation eligibility.

## Conditional policy routing

Use `docs/AGENT-POLICIES.md` as an on-demand policy index. Read the relevant section before work in these areas:

- Browser automation or authenticated external forms: `External browser automation policy`.
- GitHub Actions conservation, Cloudflare deploys or Render deploys: `Deployment during GitHub Actions conservation`.
- GA4, GSC, traffic, strict humans, outbound or revenue reporting: `Traffic and commercial measurement source-of-truth contract`.
- Software news: `What's New software article contract`.
- Tool cards, profiles, comparisons and editorial copy: `Editorial software surface contract`.
- Vendor outreach or ToolScout email: `Vendor amplification sender contract` and `ToolScout outbound email visual contract`.
- Visual redesign or UX: `Redesign tooling policy`, `Redesign editorial homepage requirement`, `Redesign motion requirement`, and `Private surface redesign requirement`.
- AI interoperability and agent-facing product work: `AI interoperability editorial policy`.
- Historical implementation or an old regression: `docs/PRODUCTION-BASELINE.md` and, only when needed, `docs/OPERATING-MEMORY-HISTORY.md`.
- Current incidents, queues, handoffs or operational journal entries: `docs/COMMAND-CENTER.md`.

Do not read the whole policy file when one section is sufficient.

## Code localization and architecture

`docs/CODE-MAP.json` is the compact repository map. Use it before repository-wide search.

Canonical ownership files:

- Request and route ownership: `runtime-route-contract.js`
- Scheduled mission ownership: `runtime-schedule-contract.js`
- Production Worker entrypoint: `compute-router-worker.js`
- Machine-checkable operating invariants: `docs/OPERATING-CONTRACT.json`

If a route or scheduled mission already has a declared owner, change that owner or its direct dependency rather than reintroducing a broad compatibility wrapper.

## Memory discipline

`docs/OPERATING-MEMORY.md` contains only current mission, topology, truth order and top-level invariants.

Do not append routine events, one-off fixes or subsystem-specific rules to it. Put operational events in `docs/COMMAND-CENTER.md` and specialized durable policy in the relevant subsystem document or `docs/AGENT-POLICIES.md`.

Any change that alters architecture ownership, production entrypoints, provider roles, canonical state, schedules, or execution limits must update `docs/OPERATING-MEMORY.md` and `docs/OPERATING-CONTRACT.json` together when the top-level operating model changes.

## Definition of fixed

A repair is fixed only when all applicable stages are true:

`source changed -> relevant checks pass -> deployment exists -> affected live path responds correctly -> canonical state is reconciled -> observability reflects the result -> reusable regression protection exists when warranted`

Do not declare success from repository state alone.

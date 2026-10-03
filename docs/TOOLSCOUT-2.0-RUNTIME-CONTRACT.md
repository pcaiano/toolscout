# ToolScout 2.0 runtime contract

ToolScout 2.0 is an outcome-weighted, always-on growth system. Future runtime changes must preserve the following invariants.

## Business truth

- GA4 is canonical for visitors and sessions.
- Google Search Console is canonical for Google search clicks, impressions and average position.
- The ToolScout server redirect ledger is canonical for outbound clicks and monetized outbound clicks.
- External backlink snapshots are reported only while current. Stale external snapshots remain reference evidence and are not converted to current zero values.
- Missing canonical source data must be shown as unavailable. Diagnostic populations must not replace canonical business truth.

## Growth execution

- Every active executable growth action must have an execution contract and a mapped executor.
- Nonterminal execution contracts must not survive after their source action is no longer active.
- Planning may not starve execution. Newly planned actions receive contracts in the same scheduler cycle.
- External actions require task-specific evidence. Generic batch activity is not accepted as proof of a specific task.
- Human gates are non-blocking sidecars and only exist for exact human-only work.

## Distribution and authority

- New independent referring domains remain the primary authority objective.
- Generic contact routes are research evidence, not backlink authority.
- Machine-safe execution requires a verified free submission adapter and exact submission intent.
- CAPTCHA, MFA, authentication and unsupported manual steps remain human-only.
- Direct competitor outreach stays excluded. Self-service listing routes remain separately eligible when policy-clean.

## Contact Supply and sender

- Discovered email is not the same as sender-admissible supply.
- Public contact research is diversified across multiple same-domain official source URLs with independent backoff.
- Sender capacity is zero when no executable contact and no in-flight dispatch exists.
- When sender supply is exhausted, capacity shifts to self-service distribution, non-email authority and search/content work.
- Reputation, cooldown and policy gates are never widened to create artificial throughput.

## Scheduling and recovery

- Scheduler ownership is defined in runtime-schedule-contract.js.
- Critical mission cadence is verified by the permanent ToolScout 2.0 Integrity Audit.
- Stale compute leases, missing executors, orphan contracts and open architecture incidents fail the integrity audit.
- Historical failed jobs are evidence, not live backlog.

## Preservation

- Existing public URLs, canonical behavior, indexing assets, redirects and verified external placements must survive deployments.
- Every guarded runtime cutover runs architecture validation, preservation validation, live smoke verification and an operational probe.
- The permanent workflow .github/workflows/toolscout-v2-integrity-audit.yml is the canonical post-implementation integrity audit.

This contract is intended to prevent regressions from reintroducing activity-for-activity's-sake, false zeroes, phantom execution work or blocking human dependencies.

# ToolScout External Compute Overflow v1

Effective: 2026-09-25

## Purpose

Increase Growth Brain research throughput without consuming ToolScout's scarce Cloudflare Worker CPU or driving D1 toward the Workers Free daily row-read ceiling.

GitHub Actions are not part of this runtime before the October quota reset.

## Control plane

Cloudflare remains canonical for:
- Growth Brain priorities and policy.
- D1 business state.
- Execution contracts and leases.
- Human gates and reputation-sensitive actions.
- Final validation before any external action.
- Command Center and business truth.

The external worker performs network-heavy research and strictly pre-authorized machine-safe execution:
- distribution-route discovery;
- public contact-route discovery;
- HTML inspection and route classification;
- evidence preparation;
- HTTP submission through adapters that Cloudflare has already revalidated as verified, free and confidence >=95;
- public publication verification.

It never decides which action should happen, never edits ToolScout business state directly and never sends email. Reputation-sensitive email remains Cloudflare-authorized and is delivered by the existing external Make sender. Payment, reciprocal-link requirements and material terms acceptance remain policy-blocked. Login/account bootstrap and CAPTCHA are routed to non-blocking human-assisted sidecars; when a reusable machine credential or authenticated route becomes available, autonomous execution resumes without consuming the human queue as executor capacity.

## Capacity

Current design budget:
- 1,500 external research jobs per UTC day.
- 800 machine-safe execution/verification jobs per UTC day.
- reputation-sensitive external actions keep their separate 12/day ceiling.
- 8 jobs per batch to keep Cloudflare completion callbacks safely bounded.
- at most 3 active batches, matching 24 jobs against the external worker's 24-request concurrency.
- external worker concurrency: 24 requests.
- Cloudflare dispatch cadence: every 15 minutes.
- lightweight Render keepalive: minutes 7, 22, 37 and 52 of every hour, with no normal D1 work on successful probes.
- authorized execution jobs outrank research jobs in the external queue.

These are maximum processing limits, not a requirement to invent work. Priority and quality gates remain canonical.

## D1 conservation

D1 Workers Free has a hard daily row-read ceiling, so overflow observability must not scan the job table.

The router uses one `compute_overflow_metrics` row for Command Center/runtime health. Metrics are updated as state changes occur. The fifteen-minute overflow cron exits without querying D1 while no external runtime URL is configured.

External results only cause canonical D1 changes when they produce useful route/contact evidence. Cloudflare then performs the final validation through the existing Distribution Engine.

## Security

No permanent cross-provider secret is stored in the public repository.

Each dispatched batch receives a high-entropy capability ID. The external worker fetches that exact batch and receives a single-batch completion capability. Completion is accepted only for that batch and token.

The external research worker:
- only performs HTTP/HTTPS GET research;
- blocks localhost and private network ranges;
- only follows same-site candidate routes;
- never submits a form;
- never logs or receives ToolScout admin credentials.

## Runtime provider

Primary deployment target: Render Free web service via `render.yaml`.

The service is deliberately provider-neutral at the research-core level. A Deno Deploy entry point is also available under `overflow-compute/deno-worker.ts`.

Render or another external runtime becomes active only after `OVERFLOW_COMPUTE_URL` is configured in the Cloudflare deployment.

## Failure model

If external compute is absent or unavailable:
- Cloudflare continues normal Growth Brain operation.
- Overflow cron does not consume D1 work when no runtime is configured.
- failed batch dispatches are requeued.
- completion callbacks do not recursively dispatch more work; follow-up waits for the next scheduled control-plane tick to avoid Cloudflare subrequest exhaustion.
- stale external batches are requeued after 3 minutes.
- no external research result is trusted as an automatic submission decision.

GitHub Actions remain fallback-disabled until the October quota reset.


## Action plane

The canonical action path is:

Cloudflare validates policy, cost, adapter confidence and exact payload -> D1 queues a capability-scoped execution job -> Render executes only the exact authorized HTTP request -> Render returns transport evidence -> Cloudflare revalidates the current adapter and payload -> Cloudflare records submission/verification state.

A Render callback cannot independently mark a placement as canonical if the adapter, payload, method, endpoint or policy changed after authorization.

Email is intentionally not moved into Render. The existing Make sender is already an external execution plane for email and preserves Pedro's outbound reputation boundary.

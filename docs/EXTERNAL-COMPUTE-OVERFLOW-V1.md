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

The external worker performs only network-heavy research:
- distribution-route discovery;
- public contact-route discovery;
- HTML inspection and route classification;
- evidence preparation.

It never submits forms, sends outreach, changes ToolScout business state directly, or makes reputation-sensitive decisions.

## Capacity

Current design budget:
- 1,500 external research jobs per UTC day.
- 100 jobs per batch.
- at most 2 active batches.
- external worker concurrency: 24 requests.
- Cloudflare dispatch cadence: every 5 minutes.

These are maximum processing limits, not a requirement to invent work. Priority and quality gates remain canonical.

## D1 conservation

D1 Workers Free has a hard daily row-read ceiling, so overflow observability must not scan the job table.

The router uses one `compute_overflow_metrics` row for Command Center/runtime health. Metrics are updated as state changes occur. The five-minute overflow cron exits without querying D1 while no external runtime URL is configured.

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
- stale external batches are requeued after 20 minutes.
- no external research result is trusted as an automatic submission decision.

GitHub Actions remain fallback-disabled until the October quota reset.

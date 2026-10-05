# ToolScout infrastructure operating model

Effective 2026-10-05.

## Ownership

Cloudflare Workers are the production control plane and the only primary scheduler for ToolScout 2.0. D1 is the canonical runtime and business state store.

Render is an execution sidecar. `toolscout-overflow` handles authorized external research and machine-safe execution. `toolscout-auth-broker` handles bounded human-assisted authentication. Neither service may own canonical business state or block autonomous throughput.

GitHub Actions are limited to CI, daily evidence refresh, SEO maintenance and bounded manual recovery. The exact allowed workflow set and the only permitted GitHub schedules are machine-enforced by `docs/OPERATING-CONTRACT.json` and `tests/toolscout-v2-infrastructure-ownership.test.mjs`.

## Render PostgreSQL

The Render PostgreSQL database `toolscout-runtime` / `toolscout_runtime` is residual infrastructure. No current ToolScout 2.0 code dependency has been observed and production state is canonical in Cloudflare D1.

The free database expires on 2026-10-25T23:50:50Z. Do not upgrade it unless new machine evidence proves an active dependency. The intended disposition is retirement before expiry.

## Render workspace residual

The old Render web service `hubspot-comm-preferences-fix` belongs to the completed HubSpot communication-preferences repair and is not part of ToolScout infrastructure. It completed the 442-recipient operation with zero failures and was superseded by the separate `hubspot-communications` service/repository. Remove or suspend it from the Render dashboard when a supported service-delete/suspend action is available.

## Anti-regression rules

Do not restore the pre-conservation GitHub workflow topology. Do not reintroduce GitHub Pages as a ToolScout production deployment authority. Do not create a second primary scheduler. Do not make Render PostgreSQL a hidden dependency. Do not publish manual authority values as machine truth.

Historical conservation workflows remain recoverable from branch `pre-conservation-2026-09-13` and Git history, but any reintroduction requires an explicit operating-contract change and CI approval.

# M02 — Verified revenue attribution

## Delivery state

Repository implementation complete; production acceptance must be recorded only after migration/deploy and smoke succeed.

## Evidence boundary

- Clicks never count as conversions or revenue.
- Stable click references are anonymous UUIDs and contain no customer data.
- systeme.io is the only program with sub-ID propagation enabled because its official help documentation explicitly supports the `tk` affiliate tag.
- beehiiv and Jotform receive no additional parameter until official evidence supports one.
- Historical clicks are not backfilled or attributed.
- Active Worker fallbacks, scheduled asset requests and smoke checks use only the permanent ToolScout domain. The historical foreign hostname was removed rather than inspected.

## Data and lifecycle

Migration `0008_verified_revenue_attribution.sql` adds click references, exact vendor sub-ID matching, deterministic import keys and an audit table. Database triggers reject attribution without a matching non-owner click. Revenue lifecycle (`pending`, `confirmed`, `paid`, `reversed`) remains separate from attribution evidence (`unattributed`, `attributed`, `vendor_confirmed`).

## Import and review

`scripts/import-revenue-ledger.mjs` produces SQL but never applies it. It requires explicit numeric evidence values, refuses unsupported attributed programs and resolves session/tool/intent from the stored click. Conversion imports are idempotent by vendor conversion ID; reporting-period evidence is idempotent by deterministic record key.

Raw exports, customer details and credentials must never be committed or imported. Owner review and verified ToolScout D1 identity are mandatory before applying generated SQL.

# Affiliate revenue import

ToolScout treats vendor-side revenue as evidence, never as an estimate derived from clicks.

## Supported programs

The initial import guard accepts:

- `systeme-io`
- `beehiiv`
- `jotform`

This list is intentionally explicit. Add another program only after its affiliate relationship and evidence format are verified.

## Workflow

1. Export or transcribe a vendor report into a local JSON file. Do **not** commit private vendor exports, account identifiers, customer data, or credentials.
2. Each row must include `affiliate_slug` and `evidence_ref` plus either `conversion_id` or a reporting period (`period_start` / `period_end`).
3. Generate reviewable SQL:

```sh
node scripts/import-revenue-ledger.mjs /secure/path/vendor-records.json /tmp/revenue-ledger-import.sql
```

4. Review the SQL and the vendor evidence before applying it to the ToolScout D1 database.
5. Apply only to the verified ToolScout D1 resource. The project guardrail in `AGENTS.md` remains mandatory.
6. Confirm `/api/stats` and the Command Center after import. Revenue should change only when ledger evidence exists.

## Example schema

```json
[
  {
    "affiliate_slug": "jotform",
    "tool_slug": "jotform",
    "conversion_id": "vendor-conversion-id",
    "status": "confirmed",
    "attribution_status": "vendor_confirmed",
    "amount": 0,
    "currency": "EUR",
    "commission": 0,
    "confirmed_at": "2026-08-31T00:00:00Z",
    "source": "jotform_report",
    "evidence_ref": "vendor-report-reference"
  }
]
```

The zeroes above are placeholders for the input format, **not** assumptions about real revenue. Never create a ledger row unless vendor evidence exists.

## Status semantics

- `pending`: vendor evidence exists, commission not yet confirmed.
- `confirmed`: commission is confirmed but not yet paid.
- `paid`: commission has been paid.
- `reversed`: vendor reversed or invalidated the conversion.

Attribution values:

- `unattributed`: vendor evidence cannot yet be tied to a ToolScout click/session.
- `attributed`: ToolScout has a defensible attribution link.
- `vendor_confirmed`: vendor evidence explicitly confirms the conversion/attribution.

## Safety rules

- Never infer conversions, commissions, or sales from outbound clicks.
- Never write `€0` to represent missing vendor reporting; absence of evidence remains unknown.
- Keep raw affiliate exports and PII out of GitHub.
- Prefer stable vendor conversion IDs so imports are idempotent.
- Review reporting-period rows carefully: without a conversion ID they cannot use the conversion unique index for deduplication.

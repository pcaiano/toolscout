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
   `amount` and `commission` must be explicitly present, including when vendor evidence genuinely reports zero.
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
    "attribution_status": "unattributed",
    "amount": 0,
    "currency": "EUR",
    "commission": 0,
    "confirmed_at": "2026-08-31T00:00:00Z",
    "source": "jotform_report",
    "evidence_ref": "vendor-report-reference"
  }
]
```

The zeroes above are placeholders for the input format, **not** assumptions about real revenue. Never create a ledger row unless vendor evidence exists. The example is deliberately unattributed because it contains no vendor-provided ToolScout click reference.

## Exact click attribution

Every recorded outbound click now receives a PII-free `click_ref`. ToolScout sends that value to a vendor only when an official source confirms a supported affiliate tag/sub-ID parameter. As of 2026-08-31, only systeme.io is enabled for this behavior: its official help article documents the `tk` affiliate tag parameter. beehiiv and Jotform keep their existing affiliate URLs unchanged because no equivalent official evidence is recorded.

An attributed systeme.io import must include all of:

- the vendor `conversion_id`;
- `click_ref` copied exactly from the vendor report's `tk` value;
- `vendor_sub_id` with the same exact value;
- vendor evidence reference, lifecycle status, amount, commission and currency.

The database rejects attribution when the reference is missing, belongs to owner/internal-test activity, or was not actually stored as the outbound click's propagated sub-ID. Tool, intent, session and numeric click ID are resolved from the stored click rather than trusted from the import file.

## Status semantics

- `pending`: vendor evidence exists, commission not yet confirmed.
- `confirmed`: commission is confirmed but not yet paid.
- `paid`: commission has been paid.
- `reversed`: vendor reversed or invalidated the conversion.

Attribution values:

- `unattributed`: vendor evidence cannot yet be tied to a ToolScout click/session.
- `attributed`: vendor evidence contains an exact supported sub-ID that matches a stored ToolScout click; the evidence has been reviewed.
- `vendor_confirmed`: the same exact-match requirement applies and the vendor evidence explicitly confirms conversion-level attribution. This is stronger attribution evidence, not a different payment lifecycle.

## Safety rules

- Never infer conversions, commissions, or sales from outbound clicks.
- Never write `€0` to represent missing vendor reporting; absence of evidence remains unknown.
- Keep raw affiliate exports and PII out of GitHub.
- Prefer stable vendor conversion IDs so imports are idempotent.
- Conversion rows remain idempotent by `(affiliate_slug, conversion_id)`. Reporting-period rows use a deterministic evidence record key.
- Every insert/update is copied to `revenue_ledger_audit`; do not edit that audit history.
- Raw vendor exports may expose customer information. Keep them outside the repository and do not import PII into ToolScout.

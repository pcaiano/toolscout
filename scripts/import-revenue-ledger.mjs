import fs from 'node:fs';
import crypto from 'node:crypto';

const [inputPath, outputPath = 'reports/revenue-ledger-import.sql'] = process.argv.slice(2);
if (!inputPath) {
  console.error('Usage: node scripts/import-revenue-ledger.mjs <records.json> [output.sql]');
  process.exit(1);
}

const allowedStatus = new Set(['pending', 'confirmed', 'paid', 'reversed']);
const allowedAttribution = new Set(['unattributed', 'attributed', 'vendor_confirmed']);
const allowedAffiliates = new Set(['systeme-io', 'beehiiv', 'jotform']);
const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(rows)) throw new Error('Input must be a JSON array.');

const q = value => value === null || value === undefined || value === ''
  ? 'NULL'
  : `'${String(value).replaceAll("'", "''")}'`;
const n = value => {
  if (value === null || value === undefined || value === '') throw new Error('Numeric evidence value is required.');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid number: ${value}`);
  if (number < 0) throw new Error(`Negative evidence value is not allowed: ${value}`);
  return String(number);
};
const key = value => crypto.createHash('sha256').update(value).digest('hex');

const statements = [];
for (const [index, row] of rows.entries()) {
  const affiliate = String(row.affiliate_slug || '').trim();
  if (!allowedAffiliates.has(affiliate)) throw new Error(`Row ${index + 1}: unsupported affiliate_slug ${affiliate}`);
  if (!row.evidence_ref) throw new Error(`Row ${index + 1}: evidence_ref is required; vendor revenue must have evidence.`);
  const status = String(row.status || 'pending');
  const attribution = String(row.attribution_status || 'unattributed');
  if (!allowedStatus.has(status)) throw new Error(`Row ${index + 1}: invalid status ${status}`);
  if (!allowedAttribution.has(attribution)) throw new Error(`Row ${index + 1}: invalid attribution_status ${attribution}`);
  if (row.conversion_id == null && row.period_start == null && row.period_end == null) {
    throw new Error(`Row ${index + 1}: provide conversion_id or a reporting period.`);
  }
  const clickRef = row.click_ref == null ? null : String(row.click_ref);
  const vendorSubId = row.vendor_sub_id == null ? null : String(row.vendor_sub_id);
  if (attribution === 'unattributed' && (clickRef || vendorSubId)) {
    throw new Error(`Row ${index + 1}: unattributed rows cannot include click_ref or vendor_sub_id.`);
  }
  if (attribution !== 'unattributed') {
    if (affiliate !== 'systeme-io') throw new Error(`Row ${index + 1}: ${affiliate} has no verified sub-ID support.`);
    if (!row.conversion_id || !clickRef || vendorSubId !== clickRef) {
      throw new Error(`Row ${index + 1}: attributed rows require conversion_id and matching click_ref/vendor_sub_id.`);
    }
  }
  const recordKey = key([affiliate, row.conversion_id || '', row.period_start || '', row.period_end || '', row.evidence_ref].join('|'));
  const identitySelect = attribution === 'unattributed'
    ? `${q(row.tool_slug)}, ${q(row.intent_slug)}, NULL, NULL`
    : `(SELECT tool_slug FROM click_events WHERE click_ref=${q(clickRef)}), (SELECT intent_slug FROM click_events WHERE click_ref=${q(clickRef)}), (SELECT session_id FROM click_events WHERE click_ref=${q(clickRef)}), (SELECT id FROM click_events WHERE click_ref=${q(clickRef)})`;

  const conflict = row.conversion_id == null
    ? 'ON CONFLICT(record_key) WHERE record_key IS NOT NULL'
    : 'ON CONFLICT(affiliate_slug, conversion_id) WHERE conversion_id IS NOT NULL';
  statements.push(`INSERT INTO revenue_ledger (
    affiliate_slug, tool_slug, intent_slug, session_id, click_id, click_ref, vendor_sub_id, record_key, conversion_id,
    status, attribution_status, amount, currency, commission, period_start, period_end,
    confirmed_at, paid_at, source, evidence_ref, notes
  ) VALUES (
    ${q(affiliate)}, ${identitySelect}, ${q(clickRef)}, ${q(vendorSubId)}, ${q(recordKey)}, ${q(row.conversion_id)},
    ${q(status)}, ${q(attribution)}, ${n(row.amount)}, ${q(row.currency || 'EUR')}, ${n(row.commission)}, ${q(row.period_start)}, ${q(row.period_end)},
    ${q(row.confirmed_at)}, ${q(row.paid_at)}, ${q(row.source || 'manual_import')}, ${q(row.evidence_ref)}, ${q(row.notes)}
  ) ${conflict} DO UPDATE SET
    tool_slug=excluded.tool_slug,
    intent_slug=excluded.intent_slug,
    session_id=COALESCE(excluded.session_id, revenue_ledger.session_id),
    click_id=COALESCE(excluded.click_id, revenue_ledger.click_id),
    click_ref=excluded.click_ref,
    vendor_sub_id=excluded.vendor_sub_id,
    record_key=excluded.record_key,
    status=excluded.status,
    attribution_status=excluded.attribution_status,
    amount=excluded.amount,
    currency=excluded.currency,
    commission=excluded.commission,
    period_start=excluded.period_start,
    period_end=excluded.period_end,
    confirmed_at=excluded.confirmed_at,
    paid_at=excluded.paid_at,
    source=excluded.source,
    evidence_ref=excluded.evidence_ref,
    notes=excluded.notes,
    updated_at=datetime('now');`);
}

const sql = `-- Generated from vendor evidence. Review before applying to D1.\nBEGIN TRANSACTION;\n${statements.join('\n')}\nCOMMIT;\n`;
fs.mkdirSync(outputPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(outputPath, sql);
console.log(`Generated ${statements.length} revenue ledger statement(s) at ${outputPath}.`);

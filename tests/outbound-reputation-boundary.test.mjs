import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../distribution-sender-worker.js',import.meta.url),'utf8');

assert.match(src,/OUTBOUND_REPUTATION_CONTRACT='pedro-outbound-reputation-v1'/);
assert.match(src,/\/api\/distribution\/outbound-reputation\/check/);
assert.match(src,/reputation_quarantine/);
assert.match(src,/reputation_boundary_quarantine/);
assert.match(src,/internal_api_url/);
assert.match(src,/internal_runtime_identifier/);
assert.match(src,/internal_system_jargon/);
assert.match(src,/unresolved_template_or_object/);
assert.match(src,/unapproved_autonomous_template/);
assert.match(src,/vendor_reference_v23/);
assert.match(src,/publisher_resources_v22/);
assert.doesNotMatch(src,/Free ToolScout software decision feed/);
assert.doesNotMatch(src,/our free feed and embed kit is here/);

assert.match(src,/function toolScoutEmailShell/);
assert.match(src,/bgcolor="#0B0D0C"/);
assert.match(src,/background:#B7FF3C/);
assert.match(src,/Independent software discovery/);
assert.match(src,/role="presentation"/);
assert.match(src,/ctaLabel:'View featured page'/);
assert.match(src,/ctaLabel:'Open Publisher Kit'/);
assert.match(src,/toolScoutEmailShell\(sanitizeExternalOutreachBody/);
const operating=JSON.parse(fs.readFileSync(new URL('../docs/OPERATING-CONTRACT.json',import.meta.url),'utf8'));
assert.equal(operating.email_brand.visual_system,'toolscout_2');
assert.equal(operating.email_brand.compatibility,'table_based_inline_css');
assert.ok(operating.invariants.includes('toolscout_branded_email_uses_toolscout_2_visual_system'));

console.log('Pedro outbound reputation boundary fails closed before external email dispatch.');

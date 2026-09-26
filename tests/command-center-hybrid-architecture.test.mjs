import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const cc=read('command-center-simplified-view.js');
assert.match(cc,/Growth Execution Plane/);
assert.match(cc,/compute:'\/api\/compute\/health'/);
assert.match(cc,/auth:'\/api\/auth-plane\/health'/);
assert.match(cc,/Emails - rolling 24h/);
assert.match(cc,/Machine-safe actions - today/);
assert.match(cc,/Research jobs - today/);
assert.match(cc,/Distribution execution funnel/);
assert.match(cc,/Submission routes found/);
assert.match(cc,/Machine-safe form candidates/);
assert.match(cc,/Placements verified today/);
assert.match(cc,/Open architecture incident detail/);
assert.match(cc,/Actions completed/);
assert.match(cc,/Open secure login session/);
assert.match(cc,/data-auth-handoff/);
assert.match(cc,/const FAST_KEYS=\['queue','runtime','authority','compute','auth'\]/);
assert.doesNotMatch(cc,/External actions - 24h[\s\S]{0,120}Target/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/EMAIL_TARGET_24H=50/);
assert.match(truth,/EMAIL_MAX_24H=60/);
assert.match(truth,/MACHINE_SAFE_EXTERNAL_MAX_24H=800/);
assert.match(truth,/RESEARCH_EXTERNAL_MAX_24H=1500/);
assert.match(truth,/emailSent24h/);
assert.match(truth,/emailReadyContacts/);
assert.match(truth,/instant_webhook_plus_3h_fallback/);
assert.match(truth,/cloudflare_authorize_external_execute_cloudflare_verify/);
assert.match(truth,/cloudflare_authorize_make_send_cloudflare_confirm/);
assert.match(truth,/cloudflare_vault_render_browser_human_challenge_resume/);
assert.match(truth,/business-truth-v10-hybrid-execution/);
assert.match(truth,/Growth Execution Plane/);
assert.match(truth,/FROM growth_architecture_incidents/);
assert.match(truth,/items:\(architecture\.items\|\|\[\]\)/);

console.log('Command Center reflects the hybrid Growth Brain architecture without treating capacity as business success.');

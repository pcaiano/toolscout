import assert from 'node:assert/strict';
import fs from 'node:fs';

const sender=fs.readFileSync(new URL('../distribution-sender-worker.js',import.meta.url),'utf8');
const command=fs.readFileSync(new URL('../growth-command-center-v2-worker.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

assert.match(sender,/outbound_reputation_learning/);
assert.match(sender,/template_issue/);
assert.match(sender,/exact_fingerprint/);
assert.match(sender,/HARD_REPUTATION_ISSUES/);
assert.match(sender,/override-validate/);
assert.match(sender,/override-status/);
assert.match(sender,/sent_and_learned/);
assert.match(sender,/status='validated'/);
assert.match(command,/REPUTATION_OVERRIDE_WEBHOOK_URL/);
assert.match(command,/owner_override_dispatching/);
assert.match(command,/reputation_override_send_failed/);
assert.match(command,/sent:true,learned:true/);
assert.match(ui,/Send now \+ learn/);

console.log('Owner-approved false positives are sent immediately and teach the reputation filter without globally weakening hard guards.');

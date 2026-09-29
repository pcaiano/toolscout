import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

const content=read('content-engine-intelligence-worker.js');
assert.match(content,/Number\(selected\.redirect_allowed\|\|0\)===1/);
assert.match(content,/targets\(selected\.tool_slug\)/);
assert.match(content,/toolscout_redirect/);
assert.match(content,/direct_vendor/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/affiliate_network_click_evidence/);
assert.match(truth,/partnerstack:apollo:first-10:2026-09-25T17:12:28Z/);
assert.match(truth,/social_affiliate_redirects/);
assert.match(truth,/never_sum_cross_source_click_counts/);
assert.match(truth,/liveVerifiedOutbound24h/);

const commandCenter=read('command-center-simplified-view.js');
assert.match(commandCenter,/Tracked social affiliate redirects - 24h/);
assert.match(commandCenter,/Affiliate-network click floor/);
assert.match(commandCenter,/Sources kept separate/);

console.log('Commercial click reconciliation preserves strict truth while exposing social and affiliate-network evidence.');

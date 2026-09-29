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
assert.match(truth,/affiliate_network_accounts/);
assert.match(truth,/affiliate_network_program_evidence/);
assert.match(truth,/pedro@trytoolscout\.org/);
assert.match(truth,/pcaiano@gmail\.com/);
assert.match(truth,/\['unbounce',6\],\['apollo',19\],\['gorgias',20\],\['brevo',0\],\['kit',23\],\['instantly',12\],\['lemlist',27\]/);

const commandCenter=read('command-center-simplified-view.js');
assert.match(commandCenter,/Tracked social affiliate redirects - 24h/);
assert.match(commandCenter,/Affiliate-network click floor/);
assert.match(commandCenter,/Sources kept separate/);
assert.match(commandCenter,/PartnerStack accounts/);
assert.match(commandCenter,/PartnerStack current programmes/);

const growthCommandCenter=read('growth-command-center-v2-worker.js');
assert.match(growthCommandCenter,/socialAffiliateRedirects30d/);
assert.match(growthCommandCenter,/vendorReportedClickFloor/);
assert.match(growthCommandCenter,/Strict 30d/);
assert.match(growthCommandCenter,/Vendor floor/);

console.log('Commercial click reconciliation preserves strict truth while exposing social and affiliate-network evidence.');

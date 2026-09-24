import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const external=JSON.parse(read('data/se-ranking-backlink-truth.json'));
assert.equal(external.metrics.referringDomains,10);
assert.equal(external.metrics.backlinks,16);
assert.equal(external.reconciliationPolicy.internalLedgerRetained,true);

const supervisor=read('growth-supervisor.js');
assert.match(supervisor,/SE_RANKING_REF_DOMAIN_MAX_AGE_HOURS=168/);
assert.match(supervisor,/internalVerifiedReferringDomains/);
assert.match(supervisor,/Math\.max\(internalVerifiedReferringDomains,seRankingReferringDomains\)/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/command-center-business-truth-v3/);
assert.match(truth,/seRankingReferringDomains/);
assert.match(truth,/internalVerifiedReferringDomains/);
assert.match(truth,/referringDomainSource/);

const priority=read('distribution-priority-worker.js');
assert.match(priority,/humanGate=number\(row\?\.human_required\)>0/);
assert.match(priority,/Math\.max\(calculated,baseline,learned,number\(row\?\.distribution_score\)\)/);

const autonomous=read('distribution-autonomous-worker.js');
assert.match(autonomous,/PRIORITY_HUMAN_GATE_THRESHOLD=70/);
assert.match(autonomous,/gateType:'manual_submission'/);
assert.match(autonomous,/priority_manual_submission_gate/);
assert.match(autonomous,/o\.distribution_score DESC/);

const humanActions=read('human-action-entry-worker.js');
assert.match(humanActions,/ORDER BY COALESCE\(l\.priority_weight,o\.distribution_score,0\) DESC/);
assert.match(humanActions,/High-priority opportunities keep their score/);

console.log('SE Ranking reconciliation and priority human-gate policy are aligned.');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

const router=read('compute-router-worker.js');
const contactStart=router.indexOf('async function enqueueContactSupplyResearch(env,remaining)');
const distributionStart=router.indexOf('async function enqueueDistributionResearch(env)');
assert.ok(contactStart>=0&&distributionStart>contactStart,'research functions must exist');
const contactBody=router.slice(contactStart,distributionStart);
const distributionBody=router.slice(distributionStart,router.indexOf('function encodedAdapterBody',distributionStart));

assert.doesNotMatch(contactBody,/await enqueueContactSupplyResearch\(env,remaining\)/,'contact supply research must never recurse into itself');
assert.match(distributionBody,/const supply=await enqueueContactSupplyResearch\(env,remaining\)/,'contact supply should be prioritized from the distribution research coordinator');
assert.match(router,/const DISTRIBUTION_RESEARCH_BUCKET_HOURS=6;/);
assert.match(router,/const ROLE_EMAIL_RESEARCH_BUCKET_HOURS=24;/);
assert.match(distributionBody,/jobKey:\`route:\$\{row\.surface_slug\}:bucket:\$\{routeBucket\}:/);
assert.match(distributionBody,/jobKey:\`contact:\$\{row\.surface_slug\}:bucket:\$\{routeBucket\}:/);
assert.match(distributionBody,/jobKey:\`publisher-email:\$\{row\.surface_slug\}:bucket:\$\{roleEmailBucket\}:/);
assert.match(distributionBody,/jobKey:\`vendor-email:\$\{row\.tool_slug\}:bucket:\$\{roleEmailBucket\}:/);
assert.match(distributionBody,/status='research_required'[\s\S]*last_checked_at<=datetime\('now','-\$\{DISTRIBUTION_RESEARCH_BUCKET_HOURS\} hours'\)/);
assert.match(distributionBody,/return\{enqueued,remaining,contactSupply:supply\}/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/const AUTHORITY_POLICY_TARGET_24H=50;/);

const orchestrator=read('distribution-orchestrator-worker.js');
const coordinationCalls=[...orchestrator.matchAll(/runWithLedger\(env,\{engine:'growth',mission:'opportunity_coordination'[^}]*\}/g)].map(x=>x[0]);
assert.ok(coordinationCalls.length>=3,'manual, Make and scheduled coordination paths must exist');
assert.ok(coordinationCalls.every(x=>x.includes('singleFlightMinutes:15')),'all opportunity coordination paths must be single-flight guarded');

const cc=read('command-center-simplified-view.js');
assert.match(cc,/Machine-safe action supply/);
assert.match(cc,/6 most recent/);
assert.match(cc,/not the size of the executable backlog/);

console.log('Overflow throughput recovery prevents recursive stalls, restores recurring research and exposes action-supply starvation.');

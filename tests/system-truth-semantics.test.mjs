import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const cc=read('command-center-simplified-view.js');
assert.doesNotMatch(cc,/Search \+ Authority/);
assert.doesNotMatch(cc,/function searchAuthority\(/);
assert.doesNotMatch(cc,/No new verified external result/);
assert.match(cc,/authorityFailureStates=new Set\(\['execution_required','external_handoff_timeout','handoff_reconciliation_required','failed'\]\)/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.doesNotMatch(truth,/'Search \+ Authority'/);

const contract=read('growth-execution-contract.js');
assert.match(contract,/ORDER BY CASE WHEN status='stalled' THEN 0 ELSE 1 END,CASE WHEN executor='catalog_cycle'/);

const seo=read('seo-execution-runtime.js');
assert.match(seo,/async function canonicalState\(/);
assert.match(seo,/canonical_current_state_verified/);
assert.match(seo,/if\(action==='repair_canonical_alignment'\)/);

const authority=read('growth-runtime-closed-loop-worker.js');
assert.match(authority,/runnable_queue/);
assert.match(authority,/deferred_queue/);
assert.match(authority,/return'qualifying_backlog'/);
assert.match(authority,/authority_backlog_awaiting_qualification/);
assert.match(authority,/qualifyingBacklog/);

console.log('System Truth distinguishes real failures from deferred acquisition inventory.');

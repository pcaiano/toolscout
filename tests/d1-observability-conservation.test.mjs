import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

const view=read('command-center-simplified-view.js');
assert.match(view,/const FAST_KEYS=\['queue','runtime','authority'\]/,'live operational sources must remain on the fast lane');
assert.match(view,/const HEAVY_KEYS=\['stats','truth'\]/,'D1-heavy observability sources must be isolated');
assert.match(view,/setInterval\(loadFast,60000\)/,'authority visibility must still refresh every minute');
assert.match(view,/setInterval\(loadHeavy,180000\)/,'heavy analytics reads must run at a lower cadence');
assert.match(view,/if\(document\.hidden\|\|fastBusy\)return/,'background tabs must not waste D1 reads');
assert.match(view,/if\(document\.hidden\|\|heavyBusy\)return/,'background tabs must not waste heavy D1 reads');

const ledger=read('engine-run-ledger.js');
assert.match(ledger,/idx_engine_runs_started ON engine_runs\(started_at DESC\)/,'runtime recent-runs query must have a dedicated started_at index');

const budget=read('d1-read-budget-worker.js');
assert.match(budget,/\['\/api\/runtime\/executors', 90\]/,'runtime executor snapshot must use a shared read cache');
assert.match(budget,/PROTECTED_READS = new Set\(\[[^\]]*'\/api\/runtime\/executors'/,'runtime executor cache must remain session-scoped');

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/const BUSINESS_TRUTH_CACHE_MS=120000;/,'business truth must use a short observability cache');
assert.doesNotMatch(truth,/authorityRuntimeRow/,'business truth must not duplicate the live authority count scans');
assert.match(truth,/X-ToolScout-Read-Mode/,'manual fresh reads must remain observable');

const authority=read('growth-runtime-closed-loop-worker.js');
assert.match(authority,/const AUTHORITY_HEALTH_CACHE_MS=90000;/,'authority health GET must use a short read cache');
assert.match(authority,/async function closeAuthorityExecutionLoop\(request,env,ctx\)\{\s*const before=await authoritySnapshot\(env\);/s,'execution loop must continue to read live authority state directly');
assert.match(authority,/const afterMachine=await authoritySnapshot\(env\);/,'machine execution proof must remain live');
assert.match(authority,/const after=await authoritySnapshot\(env\);/,'final execution proof must remain live');
assert.match(authority,/public-candidates\?limit=4/,'authority growth batch throughput must remain four');

console.log('D1 observability conservation: read load reduced without throttling authority execution.');

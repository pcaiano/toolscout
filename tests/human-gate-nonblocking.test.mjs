import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../distribution-autonomous-worker.js',import.meta.url),'utf8');

assert.match(source,/refreshPersistentActionUrls\(env,\{statuses:\['auth_required','research_required'\],limit:3\}\)/);
assert.match(source,/refreshPersistentActionUrls\(env,\{statuses:\['human_action_required','approval_required'\],limit:3\}\)/);
assert.match(source,/human_gate_execution_policy:'non_blocking_sidecar_v2'/);
assert.match(source,/non_blocking:true/);

const machineRefresh=source.indexOf("const routeRefresh=await refreshPersistentActionUrls(env,{statuses:['auth_required','research_required'],limit:3})");
const qualification=source.indexOf('const qualification=await qualify(env)');
const execution=source.indexOf('const execution=await packageAndExecute(env)');
const humanSync=source.indexOf('const humanGateSync=await syncExistingHumanGates(env)',execution);
assert.ok(machineRefresh>=0&&qualification>machineRefresh&&execution>qualification,'automatic path must execute in order');
assert.ok(humanSync>execution,'human-gate work must happen only after automatic execution');

const contract=fs.readFileSync(new URL('../growth-execution-contract.js',import.meta.url),'utf8');
assert.match(contract,/human_gate:\{engine:'human',mode:'human'/);
assert.match(contract,/if\(spec\.mode==='human'\)continue;/);

console.log('Human actions are a non-blocking sidecar and do not consume automatic executor capacity.');

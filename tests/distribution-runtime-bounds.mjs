import fs from 'node:fs';
const a=fs.readFileSync('distribution-autonomous-worker.js','utf8');
const d=fs.readFileSync('distribution-discovery-worker.js','utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
check(!a.includes('const discovery=await runDiscoveryRefresh(env);'), 'autonomous critical path does not run heavy discovery synchronously');
check(a.includes("scheduled_discovery_sidecar_and_render_overflow"), 'autonomous cycle declares delegated discovery plane');
check(d.includes('INSERT OR IGNORE INTO distribution_discovery_sources'), 'known recursive discovery sources are not rewritten every scan');
check(d.includes('const fetched=await Promise.all(sources.map(async s=>'), 'discovery source network probes are concurrent and bounded by per-fetch timeout');
if(failures.length){for(const f of failures)console.error('FAIL '+f);process.exit(1)}
console.log('PASS bounded distribution runtime guards');

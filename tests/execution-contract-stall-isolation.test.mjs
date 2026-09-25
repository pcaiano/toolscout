import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const start=src.indexOf('async function runGrowthExecutionContractCycle(env)');
const end=src.indexOf('async function runBoundedPublicExecutionReconcile(env)',start);
assert.ok(start>=0&&end>start,'execution-contract cycle must exist');
const body=src.slice(start,end);

assert.match(src,/async function boundedExecution\(/,'bounded execution helper must exist');
assert.match(body,/boundedExecution\(executeCloudflareSeoTask\(env,task\),12000,'seo_cloudflare_task'\)/,'SEO tasks must be time bounded');
assert.match(body,/boundedExecution\(Promise\.resolve\(\)\.then\(\(\)=>fn\(task\)\),60000,`executor_\$\{executor\}`\)/,'primary internal executors must be time bounded');

const catalogPos=body.indexOf("if(selectedInternalLane==='catalog_cycle')");
const seoPos=body.indexOf('await runSeoBatch(4);');
assert.ok(catalogPos>=0&&seoPos>catalogPos,'selected stalled internal lane must run before SEO batch work');

console.log('Execution-contract primary work is isolated from slow SEO work and bounded by timeouts.');

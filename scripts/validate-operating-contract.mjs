import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const contract=JSON.parse(read('docs/OPERATING-CONTRACT.json'));
const wrangler=read('wrangler.toml');
const render=read('render.yaml');
const router=read('compute-router-worker.js');
const agents=read('AGENTS.md');

const failures=[];
const passes=[];
function requireCheck(ok,label){
  (ok?passes:failures).push(label);
}
function esc(s){return String(s).replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');}
function hasQuotedAssignment(text,key,value){
  const re=new RegExp('^\\s*'+esc(key)+'\\s*=\\s*["\\\']'+esc(value)+'["\\\']\\s*$','m');
  return re.test(text);
}

requireCheck(hasQuotedAssignment(wrangler,'name',contract.cloudflare.worker_name),'wrangler worker name matches contract');
requireCheck(hasQuotedAssignment(wrangler,'main',contract.cloudflare.entrypoint),'wrangler entrypoint matches contract');
requireCheck(wrangler.includes('binding = "'+contract.cloudflare.d1_binding+'"'),'D1 binding matches contract');
requireCheck(wrangler.includes('database_name = "'+contract.cloudflare.d1_database_name+'"'),'D1 database name matches contract');
requireCheck(wrangler.includes('database_id = "'+contract.cloudflare.d1_database_id+'"'),'D1 database ID matches contract');
requireCheck(wrangler.includes('migrations_dir = "'+contract.cloudflare.migrations_dir+'"'),'migration directory matches contract');
requireCheck(wrangler.includes('OVERFLOW_COMPUTE_URL = "'+contract.cloudflare.overflow_compute_url+'"'),'overflow URL matches contract');
for(const cron of contract.cloudflare.crons){
  requireCheck(wrangler.includes('"'+cron+'"'),'wrangler contains cron '+cron);
}

requireCheck(render.includes('name: '+contract.render.overflow.service_name),'Render overflow service name matches contract');
requireCheck(render.includes('region: '+contract.render.overflow.region),'Render overflow region matches contract');
requireCheck(render.includes('startCommand: "'+contract.render.overflow.start_command+'"'),'Render overflow start command matches contract');
requireCheck(render.includes('value: "'+String(contract.render.overflow.max_concurrency)+'"'),'Render MAX_CONCURRENCY matches contract');

requireCheck(router.includes('const DAILY_JOB_BUDGET='+contract.execution.external_research_jobs_per_utc_day+';'),'router research budget matches contract');
requireCheck(router.includes('const EXECUTION_DAILY_JOB_BUDGET='+contract.execution.external_execution_jobs_per_utc_day+';'),'router execution budget matches contract');
requireCheck(router.includes('const BATCH_SIZE='+contract.execution.batch_size+';'),'router batch size matches contract');
requireCheck(router.includes('const MAX_ACTIVE_BATCHES='+contract.execution.max_active_batches+';'),'router active batch limit matches contract');
requireCheck(router.includes("const OVERFLOW_CRON='"+contract.execution.dispatch_cron+"';"),'router overflow cron matches contract');
requireCheck(router.includes("const RENDER_KEEPALIVE_CRON='"+contract.execution.render_keepalive_cron+"';"),'render keepalive cron matches contract');
requireCheck(wrangler.includes('"'+contract.execution.autonomous_control_cron+'"'),'wrangler autonomous control cron matches contract');
requireCheck(router.includes("const RENDER_TRIGGER_TIMEOUT_MS="+contract.execution.render_trigger_timeout_ms+";"),'Render trigger timeout matches contract');
requireCheck(router.includes("async scheduled(scheduledEvent,env,ctx)"),'overflow scheduler does not shadow event logger');
requireCheck(router.includes("base.scheduled(scheduledEvent,env,ctx)"),'overflow cron delegates to inherited scheduler');
requireCheck(router.includes("'inherited_scheduler_failed'"),'inherited scheduler failures are observable');

requireCheck(agents.includes('docs/OPERATING-MEMORY.md'),'AGENTS startup reads operating memory');
requireCheck(agents.includes('docs/OPERATING-CONTRACT.json'),'AGENTS startup reads operating contract');
requireCheck(agents.includes('validate-operating-contract.mjs'),'AGENTS requires operating contract validation');

console.log('ToolScout operating contract validation');
for(const p of passes)console.log('PASS '+p);
for(const f of failures)console.error('FAIL '+f);
console.log(passes.length+' passed, '+failures.length+' failed');
if(failures.length)process.exitCode=1;

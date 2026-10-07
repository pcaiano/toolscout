import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const contract=JSON.parse(read('docs/OPERATING-CONTRACT.json'));
const wrangler=read('wrangler.toml');
const render=read('render.yaml');
const router=read('compute-router-worker.js');
const overflowServer=read('overflow-compute/server.mjs');
const gscWorkflow=read('.github/workflows/gsc-growth-bridge.yml');
const gscSync=read('scripts/sync-gsc-signals.mjs');
const agents=read('AGENTS.md');
const operatingMemory=read('docs/OPERATING-MEMORY.md');
const codeMapPath=contract.memory?.code_map||'docs/CODE-MAP.json';
const codeMap=JSON.parse(read(codeMapPath));
const scheduleContractSource=read('runtime-schedule-contract.js');

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
requireCheck(render.includes('healthCheckPath: '+contract.render.overflow.health_check_path),'Render overflow health-check path matches contract');
requireCheck(overflowServer.includes("url.pathname==='/health'"),'Render overflow server exposes /health');

requireCheck(router.includes('const DAILY_JOB_BUDGET='+contract.execution.external_research_jobs_per_utc_day+';'),'router research budget matches contract');
requireCheck(router.includes('const EXECUTION_DAILY_JOB_BUDGET='+contract.execution.external_execution_jobs_per_utc_day+';'),'router execution budget matches contract');
requireCheck(router.includes('const BATCH_SIZE='+contract.execution.batch_size+';'),'router batch size matches contract');
requireCheck(router.includes('const MAX_ACTIVE_BATCHES='+contract.execution.max_active_batches+';'),'router active batch limit matches contract');
requireCheck(router.includes('const DISTRIBUTION_CLASSIFIER_VERSION='+contract.execution.distribution_classifier_version+';'),'distribution classifier version matches contract');
requireCheck(scheduleContractSource.includes("primaryGrowth:'"+contract.execution.dispatch_cron+"'"),'schedule contract primary growth cron matches operating contract');
requireCheck(scheduleContractSource.includes("renderKeepalive:'"+contract.execution.render_keepalive_cron+"'"),'schedule contract render keepalive cron matches operating contract');
requireCheck(router.includes('const OVERFLOW_CRON=TOOLSCOUT_CRONS.primaryGrowth;'),'router overflow cron uses schedule contract');
requireCheck(router.includes('const RENDER_KEEPALIVE_CRON=TOOLSCOUT_CRONS.renderKeepalive;'),'router keepalive cron uses schedule contract');
requireCheck(wrangler.includes('"'+contract.execution.autonomous_control_cron+'"'),'wrangler autonomous control cron matches contract');
requireCheck(router.includes("const RENDER_TRIGGER_TIMEOUT_MS="+contract.execution.render_trigger_timeout_ms+";"),'Render trigger timeout matches contract');
requireCheck(router.includes("async scheduled(scheduledEvent,env,ctx)"),'overflow scheduler does not shadow event logger');
requireCheck(router.includes('runGrowthScheduler(scheduledEvent,env,ctx)'),'overflow cron delegates to Growth Scheduler');
requireCheck(router.includes('runCommandCenterIntegrityScheduled(scheduledEvent,env,ctx)'),'overflow cron preserves Command Center integrity scheduler');
requireCheck(router.includes("'inherited_scheduler_failed'"),'inherited scheduler failures are observable');

for(const truthFile of contract.observability.gsc_truth_files){
  requireCheck(gscSync.includes(truthFile),'GSC sync writes truth file '+truthFile);
  requireCheck(gscWorkflow.includes(truthFile),'GSC workflow stages truth file '+truthFile);
}
requireCheck(gscWorkflow.includes('git add $GSC_FILES'),'GSC truth files are committed as one atomic set');

requireCheck(agents.includes('docs/OPERATING-MEMORY.md'),'AGENTS startup reads operating memory');
requireCheck(agents.includes('docs/OPERATING-CONTRACT.json'),'AGENTS startup reads operating contract');
requireCheck(agents.includes('validate-operating-contract.mjs'),'AGENTS requires operating contract validation');

requireCheck(codeMap.repository===contract.project.repository,'code map repository matches contract');
requireCheck(codeMap.production_branch===contract.project.production_branch,'code map production branch matches contract');
requireCheck(codeMap.entrypoint===contract.cloudflare.entrypoint,'code map entrypoint matches contract');
requireCheck(fs.existsSync(codeMap.contracts?.route_ownership||''),'code map route contract exists');
requireCheck(fs.existsSync(codeMap.contracts?.scheduled_ownership||''),'code map schedule contract exists');

if(contract.memory){
  const startupSection=(agents.split('## Mandatory startup context')[1]||'').split('\n## ')[0]||'';
  const mandatoryStartupLines=startupSection.split('\n').filter(line=>/^\s*\d+\.\s+/.test(line));
  for(const startupFile of contract.memory.startup_files||[]){
    requireCheck(mandatoryStartupLines.some(line=>line.includes(startupFile)),'startup context includes '+startupFile);
  }
  for(const onDemandFile of contract.memory.on_demand_files||[]){
    requireCheck(!mandatoryStartupLines.some(line=>line.includes(onDemandFile)),'startup context does not mandate '+onDemandFile);
  }
  requireCheck(agents.includes(contract.memory.code_map),'AGENTS routes code localization through code map');
  requireCheck(agents.includes(contract.memory.policy_index),'AGENTS routes specialized policy through policy index');
  requireCheck(operatingMemory.includes('Operating contract version: '+contract.version),'operating memory contract version matches');
  requireCheck(operatingMemory.includes('Effective: '+contract.effective_date),'operating memory effective date matches contract');
  requireCheck(operatingMemory.includes(contract.mission.objective),'operating memory mission matches contract');
  requireCheck(operatingMemory.length<=Number(contract.memory.operating_memory_max_chars||Infinity),'operating memory stays within compact startup budget');
  requireCheck(fs.existsSync(contract.memory.code_map),'configured code map exists');
  requireCheck(fs.existsSync(contract.memory.policy_index),'configured policy index exists');
  requireCheck(fs.existsSync(contract.memory.guard_index),'configured operating guard index exists');
  for(const historyFile of contract.memory.historical_context||[]){
    requireCheck(fs.existsSync(historyFile),'historical/on-demand context exists '+historyFile);
  }
}

console.log('ToolScout operating contract validation');
for(const p of passes)console.log('PASS '+p);
for(const f of failures)console.error('FAIL '+f);
console.log(passes.length+' passed, '+failures.length+' failed');
if(failures.length)process.exitCode=1;

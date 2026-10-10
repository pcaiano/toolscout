import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const scheduler=read('growth-scheduler.js');
const catalog=read('catalog-autonomy-worker.js');
const ledger=read('engine-run-ledger.js');

test('every scheduled catalog admission and verification has an expiring mission lease',()=>{
 for(const mission of ['runtime_coverage','runtime_quality']){
  const scheduled=scheduler.split('\n').filter(line=>line.includes("mission:'"+mission+"'")&&line.includes('runWithLedger('));
  assert.equal(scheduled.length,2,mission+' needs normal and recovery entrypoints');
  for(const line of scheduled)assert.match(line,/singleFlightMinutes:8/,mission+' must not leave unbounded running rows');
  const manual=catalog.split('\n').filter(line=>line.includes("mission:'"+mission+"'")&&line.includes("triggerName:'manual_api'"));
  assert.equal(manual.length,2,mission+' needs a lease for both authorized APIs');
  for(const line of manual)assert.match(line,/singleFlightMinutes:8/);
 }
 assert.match(scheduler,/Date\.now\(\)-at>12\*60000/,'expired running catalog rows must be eligible for next scheduler recovery');
});

test('catalog can admit 24 documented tools but never runs unbounded research within a single cron',()=>{
 assert.match(catalog,/MAX_ADMIT_PER_DAY=24/);
 assert.match(catalog,/MAX_CANDIDATE_CHECKS_PER_CYCLE=32/);
 assert.match(catalog,/MAX_ADMISSION_WALL_MS=90000/);
 assert.match(catalog,/Date\.now\(\)-startedAt>MAX_ADMISSION_WALL_MS/);
 assert.match(catalog,/cycle_budget_exhausted:cycleBudgetExhausted/);
 assert.match(catalog,/if\(!trustedManufacturerEvidence\(raw,\{decisionGrade:true\}\)\)/);
 assert.match(catalog,/if\(!quality\.publishable\)/);
 assert.match(catalog,/source\.status!=='ok'/);
});


test('Codex P2: deadline is rechecked after awaited supplier phases and bounds trailing sync',()=>{
 const admission=catalog.slice(catalog.indexOf('export async function admitTrustedCandidates(env)'),catalog.indexOf('export async function auditCatalogQualityBatch(env'));
 assert.match(admission,/const startedAt=Date\.now\(\);[\s\S]*?await ensureSchema\(env\);\s*if\(setupDeadline\('schema'\)\)return setupDeadline\('schema'\)/,'setup must count against wall time and recheck after schema');
 assert.match(admission,/const source=await fetchTrustedCandidateOfficialSource\(raw\);\s*if\(budgetStop\(\)\)break/,'slow source fallback cannot continue into quality gate');
 assert.match(admission,/const quality=await auditCatalogTool\(env,profile\);\s*if\(budgetStop\(\)\)break/,'slow quality/logo probe cannot continue to D1 admission');
 assert.match(admission,/existing\.add\(slug\);admitted\+\+;\s*if\(budgetStop\(\)\)break/,'committed admissions must report elapsed deadline');
 assert.match(admission,/if\(budgetStop\(\)\)market_gaps_deferred=true/,'deadline must fence trailing market gap writes');
 assert.match(admission,/syncMarketGaps\(env,\{deadlineAt:startedAt\+MAX_ADMISSION_WALL_MS\}\)/,'market gap loop must respect remaining wall time');
 assert.match(admission,/if\(budgetStop\(\)\)snapshot_deferred=true/,'do not start an overdue forced snapshot');
 assert.match(catalog,/if\(Date\.now\(\)>deadlineAt\)\{deferred=true;break;\}/,'market gap writes stop at deadline');
 assert.match(admission,/cycle_elapsed_ms:Date\.now\(\)-startedAt,market_gaps_deferred,snapshot_deferred/,'ledger must expose bounded and deferred work');
});

test('Codex #606: bounded supplier checks the 90-second deadline after each awaited setup phase',()=>{
 const setup=catalog.slice(catalog.indexOf('export async function admitTrustedCandidates(env)'),catalog.indexOf('  const categoryCounts=new Map();',catalog.indexOf('export async function admitTrustedCandidates(env)')));
 assert.match(setup,/const startedAt=Date\.now\(\);/);
 assert.match(setup,/const setupDeadline=phase=>Date\.now\(\)-startedAt>MAX_ADMISSION_WALL_MS/);
 for(const [phase,call] of [
   ['schema','await ensureSchema(env);'],
   ['config',"await assetJson(env,'/data/catalog-engine.json',{});"],
   ['baseline',"await assetJson(env,'/data/tools.json',[]);"],
   ['runtime_candidates','await runtimeCandidates(env);'],
   ['affiliate_registry','await affiliateResearchRegistry(env);'],
   ['research_seeds',"await assetJson(env,'/data/catalog-research-seeds.json',{candidates:[]});"]
 ]){
   const position=setup.indexOf(call),guard=setup.indexOf("if(setupDeadline('"+phase+"'))return setupDeadline('"+phase+"');");
   assert.ok(position>=0,phase+' network/D1 phase must be present');
   assert.ok(guard>position,phase+' must check deadline following its awaited operation');
   assert.ok(guard-position<200,phase+' deadline check must immediately follow its awaited operation');
 }
 assert.match(setup,/if\(setupDeadline\('before_candidate_file'\)\)return setupDeadline\('before_candidate_file'\)/);
 assert.match(setup,/if\(setupDeadline\('candidate_file'\)\)return setupDeadline\('candidate_file'\)/);
 assert.match(setup,/prepared%64===0&&setupDeadline\('candidate_pool'\)/);
 assert.match(setup,/ok:false,reason:'catalog_admission_setup_budget_exhausted'/,'setup exhaustion must remain recoverable by hourly scheduler');
 assert.match(scheduler,/if\(row.status==='failed'\|\|row.status==='degraded'\)return true/,'failed admission must be retried');
});

test('Codex #607: failed mission records retain structured setup-timeout evidence',()=>{
 assert.match(ledger,/const explicitResult=error\?\.engineResult&&typeof error\.engineResult==='object'\?error\.engineResult:null/);
 assert.match(ledger,/failed_result:explicitResult/);
 assert.match(ledger,/status:'failed'/);
 assert.match(catalog,/preparation_deferred:true/);
 assert.match(catalog,/cycle_elapsed_ms:Date\.now\(\)-startedAt/);
});

test('Catalog source holds have a bounded cooldown, without admission or ranking shortcuts',()=>{
 const admission=catalog.slice(catalog.indexOf('export async function admitTrustedCandidates(env)'),catalog.indexOf('export async function auditCatalogQualityBatch(env)'));
 assert.match(catalog,/OFFICIAL_SOURCE_HOLD_COOLDOWN_HOURS=3/);
 assert.match(admission,/SELECT DISTINCT tool_slug FROM catalog_runtime_events/);
 assert.match(admission,/event_type='catalog_candidate_official_source_hold' AND created_at>=datetime\('now', \?\)/);
 assert.match(admission,/if\(setupDeadline\('source_hold_cooldown'\)\)return setupDeadline\('source_hold_cooldown'\)/);
 assert.match(admission,/if\(sourceHoldCooldown\.has\(item\.slug\)\)\{sourceRetriesDeferred\+\+;continue;\}/);
 assert.match(admission,/official_source_retries_deferred:sourceRetriesDeferred/);
 assert.match(admission,/if\(!trustedManufacturerEvidence\(raw,\{decisionGrade:true\}\)\)/);
 assert.match(admission,/if\(!quality\.publishable\)/);
});

test('Catalog coverage recovery is independent from potentially slow quality verification',()=>{
 const hourly=scheduler.slice(scheduler.indexOf('  }else if(hourly){'));
 assert.match(hourly,/if\(recoverQuality\|\|recoverWarnings\)\{\s*scheduleTask\(ctx,runWithLedger\(env,\{engine:'catalog',mission:'runtime_quality'/);
 assert.match(hourly,/if\(recoverCoverage\|\|newCandidateSupply\)\{\s*scheduleTask\(ctx,runWithLedger\(env,\{engine:'catalog',mission:'runtime_coverage'/);
 assert.match(hourly,/singleFlightMinutes:8/);
 assert.doesNotMatch(hourly,/if\(recoverQuality\|\|recoverWarnings\)\{try\{await runWithLedger/,'quality must not be awaited before coverage');
 assert.doesNotMatch(hourly,/scheduleTask\(ctx,\(async\(\)=>\{/,'recovery tasks must not share a sequential async wrapper');
});

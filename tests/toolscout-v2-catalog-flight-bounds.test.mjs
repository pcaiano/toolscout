import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const scheduler=read('growth-scheduler.js');
const catalog=read('catalog-autonomy-worker.js');

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
 assert.match(admission,/const startedAt=Date\\.now\\(\\);\\s*await ensureSchema\\(env\\)/,'setup must count against wall time');
 assert.match(admission,/const source=await fetchTrustedCandidateOfficialSource\\(raw\\);\\s*if\\(budgetStop\\(\\)\\)break/,'slow source fallback cannot continue into quality gate');
 assert.match(admission,/const quality=await auditCatalogTool\\(env,profile\\);\\s*if\\(budgetStop\\(\\)\\)break/,'slow quality/logo probe cannot continue to D1 admission');
 assert.match(admission,/existing\\.add\\(slug\\);admitted\\+\\+;\\s*if\\(budgetStop\\(\\)\\)break/,'committed admissions must report elapsed deadline');
 assert.match(admission,/if\\(budgetStop\\(\\)\\)market_gaps_deferred=true/,'deadline must fence trailing market gap writes');
 assert.match(admission,/syncMarketGaps\\(env,\\{deadlineAt:startedAt\\+MAX_ADMISSION_WALL_MS\\}\\)/,'market gap loop must respect remaining wall time');
 assert.match(admission,/if\\(budgetStop\\(\\)\\)snapshot_deferred=true/,'do not start an overdue forced snapshot');
 assert.match(catalog,/if\\(Date\\.now\\(\\)>deadlineAt\\)\\{deferred=true;break;\\}/,'market gap writes stop at deadline');
 assert.match(admission,/cycle_elapsed_ms:Date\\.now\\(\\)-startedAt,market_gaps_deferred,snapshot_deferred/,'ledger must expose bounded and deferred work');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const schedules=fs.readFileSync(new URL('../runtime-schedule-contract.js',import.meta.url),'utf8');

test('search and news opportunity generators do not emit unexecutable distribution sender abstractions',()=>{
  const searchBlock=orchestrator.slice(
    orchestrator.indexOf('for(const op of searchOpportunities.slice(0,40))'),
    orchestrator.indexOf('for(const row of normalizedGscPages')
  );
  assert.match(searchBlock,/filter\(action=>!\['distribution_amplification','backlink_reference_outreach'\]/);
  assert.doesNotMatch(searchBlock,/\.\.\.execution,'content_amplification','distribution_amplification'/);

  const newsBlock=orchestrator.slice(
    orchestrator.indexOf('for(const item of Array.isArray\(softwareUpdates'),
    orchestrator.indexOf('for(const item of newsCandidates')
  );
  assert.doesNotMatch(newsBlock,/distribution_amplification/);

  const gscBlock=orchestrator.slice(
    orchestrator.indexOf('for(const row of normalizedGscPages'),
    orchestrator.indexOf('if\(humanSprintActive\(\)\)')
  );
  assert.doesNotMatch(gscBlock,/actions\.unshift\('distribution_amplification'\)/);
});

test('scheduled planning immediately materializes execution contracts without moving planning ahead of execution',()=>{
  const scheduled=orchestrator.slice(orchestrator.indexOf('async scheduled(event,env,ctx)'));
  const executionPos=scheduled.indexOf("mission:'execution_contract'");
  const opportunityPos=scheduled.indexOf("mission:'opportunity_coordination'");
  const postSyncPos=scheduled.indexOf('await syncExecutionContracts(env).catch(()=>null)',opportunityPos);
  assert.ok(executionPos>=0);
  assert.ok(opportunityPos>executionPos,'execution-first starvation protection must stay intact');
  assert.ok(postSyncPos>opportunityPos,'newly planned actions must receive contracts in the same scheduler cycle');
});

test('affiliate schedule contract matches active versus maintenance cadence',()=>{
  assert.match(schedules,/affiliate_coverage:\{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS\.hourly,subcadence:'2h_active_12h_maintenance_or_recovery'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {executableIntentSearchActions} from '../search-action-policy.js';
import {isQualifyingAuthorityBacklog} from '../growth-runtime-closed-loop-worker.js';

const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const schedules=fs.readFileSync(new URL('../runtime-schedule-contract.js',import.meta.url),'utf8');

test('search and news opportunity generators do not emit unexecutable distribution sender abstractions',()=>{
  const searchBlock=orchestrator.slice(
    orchestrator.indexOf('for(const op of searchOpportunities.slice(0,40))'),
    orchestrator.indexOf('for(const row of normalizedGscPages')
  );
  assert.match(searchBlock,/const intentExecution=executableIntentSearchActions\(op\)/);
  assert.match(searchBlock,/const actions=intentExecution\.actions/);
  assert.doesNotMatch(searchBlock,/distribution_amplification|backlink_reference_outreach/);
  for(const lane of ['seo-aeo-snippet','seo-striking-distance','seo-authority-depth','commercial-intent','seo-first-page-observation','seo-indexing-recovery','editorial-safety','measure']){
    const policy=executableIntentSearchActions({lane,executionPlan:['distribution_amplification','backlink_reference_outreach','publish']});
    assert.equal(policy.actions.includes('distribution_amplification'),false);
    assert.equal(policy.actions.includes('backlink_reference_outreach'),false);
  }

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

test('opportunity coordination materializes contracts before reporting success on every invocation path',()=>{
  const start=orchestrator.indexOf('async function coordinateGrowthOpportunities');
  const end=orchestrator.indexOf('\nasync function ',start+40);
  const body=orchestrator.slice(start,end>start?end:orchestrator.length);
  const flush=body.indexOf('await flushGrowthWrites(env,growthWrites,40)');
  const sync=body.indexOf('const executionContractSync=await syncExecutionContracts(env)');
  const result=body.lastIndexOf('return {ok:true');
  assert.ok(flush>=0);
  assert.ok(sync>flush,'execution contracts must be materialized after the active opportunity set is written');
  assert.ok(result>sync,'coordination must not report success before execution contract sync completes');
  assert.match(body,/executionContractSync/);
});

test('affiliate schedule contract matches active versus maintenance cadence',()=>{
  assert.match(schedules,/affiliate_coverage:\{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS\.hourly,subcadence:'2h_active_12h_maintenance_or_recovery'/);
});


test('authority recovery treats non-executable outreach inventory as qualification backlog',()=>{
  assert.equal(isQualifyingAuthorityBacklog(
    {queue:3,runnableQueue:0,deferredQueue:0,qualificationQueue:0},
    {externalAttemptObserved:false,handoffReady:false}
  ),true);
  assert.equal(isQualifyingAuthorityBacklog(
    {queue:3,runnableQueue:1,deferredQueue:2,qualificationQueue:2},
    {externalAttemptObserved:false,handoffReady:false}
  ),false);
});

test('authority runnable truth uses the same readiness contract as make sender admission',()=>{
  const closedLoop=fs.readFileSync(new URL('../growth-runtime-closed-loop-worker.js',import.meta.url),'utf8');
  assert.match(closedLoop,/MAKE_SENDER_READY_CONDITION/);
  assert.match(closedLoop,/executor='make_sender'.*status IN \('pending','claimed'\).*MAKE_SENDER_READY_CONDITION/s);
  assert.doesNotMatch(closedLoop,/runnable_external_queue[\s\S]{0,240}status IN \('pending','claimed','attempted'\)/);
});


test('Cloudflare primary cycle dispatches execution before authority recovery',()=>{
  const primary=fs.readFileSync(new URL('../cloudflare-primary-runtime-worker.js',import.meta.url),'utf8');
  const start=primary.indexOf('async function runPrimaryCycle');
  const end=primary.indexOf('async function runtimeMatrix',start);
  const body=primary.slice(start,end);
  const dispatch=body.indexOf("stages.executionDispatch=await internalJson(req,env,ctx,'/api/growth/execution/dispatch')");
  const authority=body.indexOf("stages.authority=await internalJson(req,env,ctx,'/api/distribution/authority/close-loop')");
  assert.ok(dispatch>0);
  assert.ok(authority>dispatch,'primary cycle must claim sender work before authority handoff observation');
});

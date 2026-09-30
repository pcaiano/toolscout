import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SCHEDULED_MISSIONS,missionOwner,scheduleContract} from '../runtime-schedule-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('every scheduled mission has one named owner',()=>{
  const entries=Object.entries(SCHEDULED_MISSIONS);
  assert.ok(entries.length>=10);
  for(const [mission,def] of entries){
    assert.ok(def.owner,mission+' must have an owner');
    assert.equal(missionOwner(mission),def.owner);
  }
  assert.equal(scheduleContract().invariant,'one_named_owner_per_scheduled_mission');
});

test('Command Center theme no longer owns growth engine scheduling',()=>{
  const cc=read('command-center-light-theme-worker.js');
  assert.doesNotMatch(cc,/runGrowthScheduler/);
  assert.doesNotMatch(cc,/runDistributionNetworkCycle/);
  assert.doesNotMatch(cc,/runAuditedAffiliateCoverageCycle/);
  assert.doesNotMatch(cc,/rebalanceDistributionPriorities/);
  assert.doesNotMatch(cc,/runContentSocialIntelligenceCycle/);
  assert.doesNotMatch(cc,/missionNeedsRecovery/);
});

test('compute router dispatches growth scheduling while growth scheduler owns the extracted operational cycles',()=>{
  const compute=read('compute-router-worker.js');
  const authority=read('authority-acquisition-worker.js');
  assert.match(compute,/runGrowthScheduler/);
  assert.match(compute,/runAuthorityAcquisitionScheduled/);
  assert.match(compute,/runAuthorityDrainScheduled/);
  assert.equal(missionOwner('authority_sender_drain'),'authority_drain');
  assert.equal(SCHEDULED_MISSIONS.authority_sender_drain.cron,'15 * * * *');
  assert.match(compute,/import base from '\.\/growth-runtime-observability-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-authority-drain-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-trend-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-visible-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-health-language-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-ga4-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/d1-read-budget-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/ga4-owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/ga4-attribution-24h-worker\.js'/);
  assert.match(compute,/runSeoRuntimeScheduled/);
  const seo=read('seo-cloudflare-runtime-worker.js');
  assert.match(seo,/export async function runSeoRuntimeScheduled/);
  assert.match(seo,/trigger!==TOOLSCOUT_CRONS\.hourly&&trigger!==TOOLSCOUT_CRONS\.daily/);
  assert.match(authority,/export async function runAuthorityAcquisitionScheduled/);
  assert.match(authority,/trigger!==TOOLSCOUT_CRONS\.hourly/);
  assert.match(authority,/authority_acquisition_scheduler/);
  const drain=read('growth-runtime-authority-drain-worker.js');
  assert.match(drain,/export async function runAuthorityDrainScheduled/);
  assert.match(drain,/authority_drain_scheduler/);
  const hourlyCore=compute.indexOf('await Promise.allSettled([growth,authority,primary,seo])');
  const drainCall=compute.indexOf('await runAuthorityDrainScheduled(scheduledEvent,env,ctx)');
  assert.ok(hourlyCore>=0&&drainCall>hourlyCore,'authority drain must execute after hourly core scheduling settles');
  assert.match(compute,/trigger===TOOLSCOUT_CRONS\.hourly\|\|trigger===TOOLSCOUT_CRONS\.daily/);
  assert.equal(scheduleContract().dispatcher,'compute_router');

  const scheduler=read('growth-scheduler.js');
  assert.match(scheduler,/cycleOwner:'growth_scheduler'/);
  assert.match(scheduler,/runDistributionNetworkCycle/);
  assert.match(scheduler,/runAuditedAffiliateCoverageCycle/);
  assert.match(scheduler,/rebalanceDistributionPriorities/);
  assert.match(scheduler,/verifyCatalogBatch/);
  assert.match(scheduler,/runContentSocialIntelligenceCycle/);
  assert.match(scheduler,/verifyNewsSources/);
});

test('runtime schedule contract is observable from the entrypoint',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/\/api\/runtime\/schedule-contract/);
  assert.match(compute,/scheduleContract\(\)/);
});

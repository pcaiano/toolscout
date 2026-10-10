import {runDistributionNetworkCycle} from './distribution-network-worker.js';
import {runWithLedger,reapStaleEngineRuns,missionCycleContext} from './engine-run-ledger.js';
import {runAuditedAffiliateCoverageCycle} from './affiliate-coverage-entry-worker.js';
import {verifyBatch as verifyCatalogBatch,admitTrustedCandidates,hasNewDecisionGradeCatalogSupply,verifyNewsSources,seedBaselineCatalog} from './catalog-autonomy-worker.js';
import {runContentSocialIntelligenceCycle} from './content-engine-intelligence-worker.js';
import {rebalanceDistributionPriorities} from './distribution-priority-worker.js';
import {growthSupervisorDirective,runGrowthSupervisorAudit} from './growth-supervisor.js';
import {syncAgentReadyVerified} from './machine-discovery-extension.js';
import {TOOLSCOUT_CRONS} from './runtime-schedule-contract.js';
import {syncLinkableAssets} from './distribution-linkable-assets-worker.js';

async function missionNeedsRecovery(env,engine,mission,maxAgeMinutes=0){
  try{
    await reapStaleEngineRuns(env,120);
    const row=await env.DB.prepare(`SELECT status,started_at,completed_at FROM engine_runs WHERE engine=? AND mission=? ORDER BY started_at DESC LIMIT 1`).bind(engine,mission).first();
    if(!row)return true;
    if(row.status==='failed'||row.status==='degraded')return true;
    if(row.status==='running'){
      // A terminated Worker can leave a ledger row running after its lease
      // expires. Re-enter the mission so runWithLedger can reap and retry.
      const at=Date.parse(String(row.started_at||'').replace(' ','T')+'Z');
      return engine==='catalog'&&['runtime_quality','runtime_coverage'].includes(mission)&&Number.isFinite(at)&&Date.now()-at>12*60000;
    }
    if(maxAgeMinutes>0&&row.status==='completed'){
      const stamp=row.completed_at||row.started_at;
      const t=Date.parse(String(stamp||'').replace(' ','T')+'Z');
      if(Number.isFinite(t)&&Date.now()-t>maxAgeMinutes*60000)return true;
    }
    return false;
  }catch{return false}
}

async function catalogQualityNeedsRecovery(env){
  try{
    const row=await env.DB.prepare(`SELECT evidence_json FROM engine_runs WHERE engine='catalog' AND mission='runtime_quality' AND status='completed' ORDER BY started_at DESC LIMIT 1`).first();
    const evidence=JSON.parse(row?.evidence_json||'{}');
    const checked=Number(evidence?.checked||0),warnings=Number(evidence?.warnings||0);
    return checked>0&&warnings>=checked;
  }catch{return false}
}

async function catalogWarningsNeedRecovery(env,hours=6){
  try{
    const cutoff=`-${Math.max(1,Number(hours)||6)} hours`;
    const row=await env.DB.prepare(`SELECT COUNT(*) n FROM catalog_runtime_state
      WHERE (quality_status='source_warning' OR source_status IN ('network_warning','warning','blocked_or_limited'))
        AND (last_checked_at IS NULL OR last_checked_at<=datetime('now', ?))`).bind(cutoff).first();
    return Number(row?.n||0)>0;
  }catch{return false}
}

function scheduleTask(ctx,promise){
  const task=Promise.resolve(promise).catch(()=>{});
  if(ctx?.waitUntil){ctx.waitUntil(task);return task;}
  return task;
}

export async function runGrowthScheduler(event,env,ctx,{delegate=null}={}){
  const trigger=event?.cron||'scheduled';
  const hourly=trigger===TOOLSCOUT_CRONS.hourly;
  const daily=trigger===TOOLSCOUT_CRONS.daily;
  const scheduledHour=new Date(Number(event?.scheduledTime)||Date.now()).getUTCHours();
  const twoHourly=hourly&&scheduledHour%2===0;
  const sixHourly=hourly&&scheduledHour%6===0;
  const twelveHourly=hourly&&scheduledHour%12===0;
  const agentReadyDaily=hourly&&scheduledHour===3;

  const [affiliateSupervisor,catalogSupervisor]=await Promise.all([
    growthSupervisorDirective(env,'affiliate').catch(()=>null),
    growthSupervisorDirective(env,'catalog').catch(()=>null)
  ]);
  const affiliateMaintenance=affiliateSupervisor?.config?.mode==='maintenance_only';
  // Manufacturer-document integrity is mandatory even when catalog expansion is demand-led.

  if(trigger===TOOLSCOUT_CRONS.primaryGrowth||hourly||daily){
    scheduleTask(ctx,runWithLedger(env,{engine:'growth',mission:'self_audit',triggerName:trigger,singleFlightMinutes:20},()=>runGrowthSupervisorAudit(env)));
  }

  // Reuse the existing 15-minute Growth Brain control tick only to recover a
  // failed catalog coverage mission. Normal supplier admission remains hourly;
  // no extra cron or permanently competing admission executor is introduced.
  if(trigger===TOOLSCOUT_CRONS.primaryGrowth){
    const failedCoverage=await missionNeedsRecovery(env,'catalog','runtime_coverage');
    if(failedCoverage){
      scheduleTask(ctx,runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:trigger+':incident_recovery',singleFlightMinutes:8},()=>admitTrustedCandidates(env)));
    }
  }

  if(hourly){
    // A non-destructive, bounded backfill into the existing Catalog Autonomy
    // D1 table. Reuses Growth Brain's mission ledger; no shadow queue.
    scheduleTask(ctx,runWithLedger(env,{engine:'catalog',mission:'baseline_catalog_migration',triggerName:trigger,singleFlightMinutes:20},
      ()=>seedBaselineCatalog(env)));
    const prioritiesRecovery=await missionNeedsRecovery(env,'distribution','operating_priorities',150);
    const contentRecovery=await missionNeedsRecovery(env,'content','social_intelligence',7*60);
    if(twoHourly){
      const networkCycle=missionCycleContext('distribution','network_cycle',Number(event?.scheduledTime)||Date.now());
      scheduleTask(ctx,runWithLedger(env,{engine:'distribution',mission:'network_cycle',triggerName:trigger,singleFlightMinutes:20,cycleContext:networkCycle,cycleOwner:'growth_scheduler'},()=>runDistributionNetworkCycle(env)));
      scheduleTask(ctx,syncLinkableAssets(env));
      const affiliateRecovery=await missionNeedsRecovery(env,'affiliate','coverage_cycle');
      if(!affiliateMaintenance||twelveHourly||affiliateRecovery){
        scheduleTask(ctx,runAuditedAffiliateCoverageCycle(env,affiliateRecovery?trigger+':recovery':trigger));
      }
    }
    if(twoHourly||prioritiesRecovery){
      scheduleTask(ctx,runWithLedger(env,{engine:'distribution',mission:'operating_priorities',triggerName:prioritiesRecovery?trigger+':recovery':trigger,singleFlightMinutes:20},()=>rebalanceDistributionPriorities(env)));
    }
    // A small hourly batch covers 127 existing vendors in about one day,
    // without a separate update scheduler or unbounded vendor requests.
    scheduleTask(ctx,runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:trigger,singleFlightMinutes:8},()=>verifyCatalogBatch(env)));
    if(sixHourly||contentRecovery){
      scheduleTask(ctx,runWithLedger(env,{engine:'content',mission:'social_intelligence',triggerName:contentRecovery?trigger+':recovery':trigger,singleFlightMinutes:15},()=>runContentSocialIntelligenceCycle(env)));
    }
    if(agentReadyDaily){
      scheduleTask(ctx,runWithLedger(env,{engine:'distribution',mission:'agentready_verification',triggerName:trigger,singleFlightMinutes:30},()=>syncAgentReadyVerified(env)));
    }
  }

  if(daily){
    scheduleTask(ctx,(async()=>{
      try{await runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:trigger,singleFlightMinutes:8},()=>admitTrustedCandidates(env))}catch{}
      try{await runWithLedger(env,{engine:'content',mission:'software_news_source_watch',triggerName:trigger},()=>verifyNewsSources(env))}catch{}
    })());
  }else if(hourly){
    const [recoverCoverage,recoverNews,recoverQuality,recoverWarnings,newCandidateSupply]=await Promise.all([
      missionNeedsRecovery(env,'catalog','runtime_coverage'),
      missionNeedsRecovery(env,'content','software_news_source_watch'),
      catalogQualityNeedsRecovery(env),
      catalogWarningsNeedRecovery(env,6),
      hasNewDecisionGradeCatalogSupply(env).catch(()=>false)
    ]);
    // Independent recovery tasks: one slow quality/source verifier must never
    // delay admission or software-news recovery on this same hourly cron.
    // Existing single-flight leases still prevent overlapping catalog missions.
    if(recoverQuality||recoverWarnings){
      scheduleTask(ctx,runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:trigger+':recovery',singleFlightMinutes:8},()=>verifyCatalogBatch(env)));
    }
    if(recoverCoverage||newCandidateSupply){
      scheduleTask(ctx,runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:trigger+(newCandidateSupply?':new_documented_cohort':':recovery'),singleFlightMinutes:8},()=>admitTrustedCandidates(env)));
    }
    if(recoverNews){
      scheduleTask(ctx,runWithLedger(env,{engine:'content',mission:'software_news_source_watch',triggerName:trigger+':recovery'},()=>verifyNewsSources(env)));
    }
  }

  return typeof delegate==='function'?delegate(event,env,ctx):undefined;
}

export const growthSchedulerInternals={
  missionNeedsRecovery,
  catalogQualityNeedsRecovery,
  catalogWarningsNeedRecovery
};

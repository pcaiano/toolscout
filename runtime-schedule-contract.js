// ToolScout 2.0 explicit scheduler ownership contract.
//
// This does not change cadence by itself. It makes ownership machine-readable
// so scheduled work can be moved out of decorator/UI layers incrementally.

export const TOOLSCOUT_CRONS=Object.freeze({
  primaryGrowth:'*/15 * * * *',
  autonomousDistribution:'4,19,34,49 * * * *',
  renderKeepalive:'7,22,37,52 * * * *',
  hourly:'20 * * * *',
  daily:'35 3 * * *'
});

export const SCHEDULED_MISSIONS=Object.freeze({
  render_keepalive:{owner:'compute_router',cron:TOOLSCOUT_CRONS.renderKeepalive,plane:'executor'},
  overflow_dispatch:{owner:'compute_router',cron:TOOLSCOUT_CRONS.primaryGrowth,plane:'executor'},
  seo_execution_batch:{owner:'compute_router',cron:TOOLSCOUT_CRONS.primaryGrowth,plane:'executor'},

  autonomous_distribution:{owner:'distribution_orchestrator',cron:TOOLSCOUT_CRONS.autonomousDistribution,plane:'growth_planner'},
  growth_opportunity_coordination:{owner:'distribution_orchestrator',cron:TOOLSCOUT_CRONS.primaryGrowth,plane:'growth_planner'},
  growth_execution_contract:{owner:'distribution_orchestrator',cron:TOOLSCOUT_CRONS.primaryGrowth,plane:'growth_planner'},
  growth_supervisor_audit:{owner:'distribution_orchestrator',cron:TOOLSCOUT_CRONS.hourly,plane:'signals'},
  growth_rnd_audit:{owner:'distribution_orchestrator',cron:TOOLSCOUT_CRONS.daily,plane:'growth_planner'},

  authority_vetted_acquisition:{owner:'authority_acquisition',cron:TOOLSCOUT_CRONS.hourly,plane:'executor'},
  authority_pipeline_recovery:{owner:'authority_acquisition',cron:TOOLSCOUT_CRONS.hourly,plane:'executor'},
  authority_sender_drain:{owner:'authority_drain',cron:TOOLSCOUT_CRONS.hourly,plane:'executor'},
  authority_closed_loop:{owner:'growth_runtime_closed_loop',cron:TOOLSCOUT_CRONS.hourly,plane:'executor'},
  authority_gap_recovery:{owner:'growth_runtime_integrity',cron:TOOLSCOUT_CRONS.hourly,plane:'executor'},

  seo_runtime_refresh:{owner:'seo_runtime',cron:[TOOLSCOUT_CRONS.hourly,TOOLSCOUT_CRONS.daily],plane:'signals'},
  traffic_integrity_heartbeat:{owner:'traffic_integrity_core',cron:TOOLSCOUT_CRONS.primaryGrowth,plane:'signals'},

  distribution_network:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.hourly,subcadence:'2h',plane:'executor'},
  affiliate_coverage:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.hourly,subcadence:'2h_or_recovery',plane:'executor'},
  distribution_priorities:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.hourly,subcadence:'2h_or_recovery',plane:'growth_planner'},
  catalog_runtime_quality:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.hourly,subcadence:'6h_or_recovery',plane:'signals'},
  content_social_intelligence:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.hourly,subcadence:'6h_or_recovery',plane:'growth_planner'},
  catalog_runtime_coverage:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.daily,plane:'executor'},
  software_news_source_watch:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.daily,plane:'signals'},
  agentready_verification:{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS.hourly,subcadence:'daily_03_15_utc',plane:'executor'}
});

export function missionOwner(mission){
  return SCHEDULED_MISSIONS[String(mission||'')]?.owner||null;
}

export function ownerHasMission(owner,mission){
  return missionOwner(mission)===String(owner||'');
}

export function cronMatches(mission,cron){
  const expected=SCHEDULED_MISSIONS[String(mission||'')]?.cron;
  return Array.isArray(expected)?expected.includes(String(cron||'')):expected===String(cron||'');
}

export function scheduleContract(){
  return{
    version:2,
    architecture:'toolscout-2.0',
    dispatcher:'compute_router',
    crons:TOOLSCOUT_CRONS,
    missions:SCHEDULED_MISSIONS,
    invariant:'one_named_owner_per_scheduled_mission'
  };
}

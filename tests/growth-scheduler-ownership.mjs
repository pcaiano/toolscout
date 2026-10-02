import fs from 'node:fs';
const code=fs.readFileSync('distribution-orchestrator-worker.js','utf8');
const growthScheduler=fs.readFileSync('growth-scheduler.js','utf8');
const wrangler=fs.readFileSync('wrangler.toml','utf8');
const commandCenter=fs.readFileSync('command-center-light-theme-worker.js','utf8');
const ledger=fs.readFileSync('engine-run-ledger.js','utf8');
const schedule=fs.readFileSync('runtime-schedule-contract.js','utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};

check(schedule.includes("autonomousDistribution:'4,19,34,49 * * * *'"),'schedule contract owns staggered autonomous heartbeat');
check(wrangler.includes('"4,19,34,49 * * * *"'),'wrangler registers autonomous heartbeat');
check(code.includes("const AUTONOMOUS_CONTROL_CRON=TOOLSCOUT_CRONS.autonomousDistribution"),'orchestrator consumes central autonomous cron');
check(code.includes("if(trigger===AUTONOMOUS_CONTROL_CRON)"),'autonomous cron is handled separately');
check(code.includes("cycleOwner:'distribution_autonomous_scheduler'"),'autonomous heartbeat has explicit cycle owner');
check(code.includes("const growthCycleDue=trigger===TOOLSCOUT_CRONS.primaryGrowth||trigger===TOOLSCOUT_CRONS.daily"),'primary growth work uses central cadence contract');
check(!code.includes("mission:'self_audit'"),'distribution orchestrator no longer owns supervisor self audit');
check(growthScheduler.includes("runGrowthSupervisorAudit"),'growth scheduler imports supervisor audit');
check(growthScheduler.includes("mission:'self_audit'"),'growth scheduler executes supervisor audit on its live hourly path');
check(schedule.includes("growth_supervisor_audit:{owner:'growth_scheduler'"),'schedule contract assigns supervisor audit to live growth scheduler owner');
check(code.includes("autonomousDistribution','distribution','autonomous_cycle'"),'engine-health recovery exercises autonomous distribution');
check(!commandCenter.includes("runAutonomousDistributionCycle"),'Command Center does not own autonomous distribution scheduling');
check(!commandCenter.includes("runGrowthScheduler"),'Command Center does not own Growth Scheduler execution');
check(ledger.includes("['distribution:autonomous_cycle',{minutes:15,anchorMinute:4}]"),'autonomous cycle identity matches staggered 15-minute heartbeat');
check(ledger.includes('const staleTakeoverMinutes='),'stale cycle takeover is cadence-bounded');

if(failures.length){for(const f of failures)console.error('FAIL '+f);process.exit(1)}
console.log('PASS ToolScout 2.0 scheduler ownership');

import fs from 'node:fs';
const code=fs.readFileSync('distribution-orchestrator-worker.js','utf8');
const wrangler=fs.readFileSync('wrangler.toml','utf8');
const commandCenter=fs.readFileSync('command-center-light-theme-worker.js','utf8');
const ledger=fs.readFileSync('engine-run-ledger.js','utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
check(code.includes("const AUTONOMOUS_CONTROL_CRON='4,19,34,49 * * * *';"),'autonomous heartbeat has staggered cron');
check(wrangler.includes('"4,19,34,49 * * * *"'),'wrangler registers autonomous heartbeat');
check(code.includes("if(trigger===AUTONOMOUS_CONTROL_CRON)"),'autonomous cron is handled separately');
check(code.includes("cycleOwner:'distribution_autonomous_scheduler'"),'autonomous heartbeat has explicit cycle owner');
check(code.includes("const growthCycleDue=trigger==='*/15 * * * *'||trigger==='35 3 * * *'"),'primary growth work is gated to primary cadence');
check(code.includes("const auditDue=trigger==='15 * * * *'||trigger==='35 3 * * *'"),'hourly audit is separated');
check(code.includes("autonomousDistribution','distribution','autonomous_cycle'"),'engine-health recovery exercises autonomous distribution');
check(!commandCenter.includes("runAutonomousDistributionCycle"),'Command Center does not own or duplicate autonomous distribution scheduling');
check(ledger.includes("['distribution:autonomous_cycle',{minutes:15,anchorMinute:4}]"),'autonomous cycle identity matches staggered 15-minute heartbeat');
check(ledger.includes('const staleTakeoverMinutes='),'stale cycle takeover is cadence-bounded');
if(failures.length){for(const f of failures)console.error('FAIL '+f);process.exit(1)}
console.log('PASS staggered always-on Growth Brain scheduler ownership');

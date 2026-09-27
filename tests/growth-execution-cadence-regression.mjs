import fs from 'node:fs';
const s=fs.readFileSync('distribution-orchestrator-worker.js','utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
check(s.includes("const executionDue=event?.cron==='*/15 * * * *'||event?.cron==='35 3 * * *'"), 'execution drains on the 15-minute cadence');
check(s.includes("const auditDue=event?.cron==='15 * * * *'||event?.cron==='35 3 * * *'"), 'heavy self-audit remains hourly/daily');
check(s.includes("singleFlightMinutes:12"), '15-minute drain has a lease shorter than its cadence');
check(!s.includes("event?.cron==='*/5 * * * *'"), 'dead five-minute fast path is removed');
if(failures.length){for(const f of failures)console.error('FAIL '+f);process.exit(1)}
console.log('PASS growth execution cadence separation');

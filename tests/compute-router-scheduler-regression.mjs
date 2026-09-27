import fs from 'node:fs';

const source=fs.readFileSync('compute-router-worker.js','utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};

check(source.includes("async scheduled(scheduledEvent,env,ctx)"),'scheduled event parameter must not shadow event logger');
check(source.includes("base.scheduled(scheduledEvent,env,ctx)"),'overflow cron must delegate to inherited scheduler');
check(source.includes("'inherited_scheduler_failed'"),'inherited scheduler failure must be recorded');
const overflowStart=source.indexOf("if(trigger===OVERFLOW_CRON)");
const fallback=source.indexOf("return typeof base.scheduled==='function'?base.scheduled(scheduledEvent,env,ctx):undefined;",overflowStart);
const inherited=source.indexOf("base.scheduled(scheduledEvent,env,ctx)",overflowStart);
check(overflowStart>=0&&inherited>overflowStart&&fallback>inherited,'delegation must occur inside overflow branch before fallback');
check(!source.includes("async scheduled(event,env,ctx)"),'legacy shadowing signature must not return');

if(failures.length){
  for(const failure of failures)console.error('FAIL '+failure);
  process.exit(1);
}
console.log('PASS compute-router scheduler delegates overflow cron and preserves failure observability');

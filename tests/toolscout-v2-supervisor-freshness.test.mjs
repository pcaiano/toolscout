import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const schedule=fs.readFileSync(new URL('../runtime-schedule-contract.js',import.meta.url),'utf8');
const growth=fs.readFileSync(new URL('../growth-scheduler.js',import.meta.url),'utf8');
const compute=fs.readFileSync(new URL('../compute-router-worker.js',import.meta.url),'utf8');

test('growth supervisor audit follows primary growth cadence',()=>{
  assert.match(schedule,/growth_supervisor_audit:\{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS\.primaryGrowth/);
  assert.match(growth,/if\(trigger===TOOLSCOUT_CRONS\.primaryGrowth\|\|hourly\|\|daily\)/);
  assert.match(growth,/mission:'self_audit'.*singleFlightMinutes:20/);
});
test('compute router explicitly invokes growth scheduler during primary growth cron',()=>{
  assert.match(compute,/const growth=Promise\.resolve\(runGrowthScheduler\(scheduledEvent,env,ctx\)\)/);
  assert.match(compute,/Promise\.allSettled\(\[overflowWork,growth,inherited\]\)/);
});

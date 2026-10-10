import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router=fs.readFileSync(new URL('../compute-router-worker.js',import.meta.url),'utf8');
const contract=fs.readFileSync(new URL('../runtime-schedule-contract.js',import.meta.url),'utf8');
const block=router.slice(
  router.indexOf("if(trigger===TOOLSCOUT_CRONS.hourly||trigger===TOOLSCOUT_CRONS.daily){"),
  router.indexOf("return runCommandCenterIntegrityScheduled(scheduledEvent,env,ctx);")
);
const chain=block.slice(block.indexOf('const authorityChain=(async()=>{'),block.indexOf('const combined=Promise.allSettled'));

test('hourly authority executes independently of unrelated long-running SEO, newsletter and linkable research',()=>{
  assert.ok(chain.startsWith('const authorityChain=(async()=>{'));
  assert.doesNotMatch(chain,/await Promise\.allSettled\(\[growth,authority,primary,seo,newsletterSync,linkableResearch\]\)/);
  assert.match(chain,/Promise\.allSettled\(\[authority,primary\]\)\.then/);
  assert.match(chain,/preparationTimer=setTimeout\(\(\)=>resolve\('deadline'\),30000\)/);
  assert.match(block,/const combined=Promise\.allSettled\(\[growth,authority,primary,seo,newsletterSync,linkableResearch,authorityChain\]\)/);
});

test('sender claims are observed before authority recovery without waiting indefinitely for a hanging dispatch',()=>{
  const drain=chain.indexOf('const drain=runAuthorityDrainScheduled(');
  const close=chain.indexOf('await runGrowthClosedLoopScheduled(');
  assert.ok(drain>0&&close>drain);
  assert.match(chain,/if\(ctx\?\.waitUntil\)ctx\.waitUntil\(drain\)/,'timed-out but still active sender execution must remain registered with the runtime context');
  assert.match(chain,/drainTimer=setTimeout\(\(\)=>resolve\('deadline'\),45000\)/);
  assert.match(chain,/authority_drain_window_exhausted/);
  assert.match(chain,/authority_hourly_preparation_deferred/);
  assert.match(chain,/authority_closed_loop_scheduler_failed/);
});

test('authority recovery remains owned by the original hourly scheduler, never by a new cron',()=>{
  assert.match(contract,/authority_closed_loop:\{owner:'growth_runtime_closed_loop',cron:TOOLSCOUT_CRONS\.hourly/);
  assert.match(block,/if\(trigger===TOOLSCOUT_CRONS\.hourly\|\|trigger===TOOLSCOUT_CRONS\.daily\)/);
  assert.doesNotMatch(chain,/new Cron|setInterval|createEngine/);
});

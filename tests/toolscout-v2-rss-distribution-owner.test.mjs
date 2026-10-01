import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('RSS distribution admin routes have a direct owner',()=>{
  const runtime=read('lemlist-profile-correction-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleRssDistributionRoute/);
  assert.match(contract,/owner:'rss_distribution'/);
  assert.match(contract,/\/api\/distribution\/rss\/status/);
  assert.match(contract,/\/api\/distribution\/rss\/publish/);
  assert.match(compute,/ownership\.owner==='rss_distribution'/);
  assert.match(compute,/handleRssDistributionRoute/);
});

test('RSS public response transform remains explicit and ordered immediately after lower runtime',()=>{
  const compute=read('compute-router-worker.js');
  const lower=compute.indexOf('base.fetch(request,env,ctx)');
  const rss=compute.indexOf('transformRssPublicResponse(request,response)');
  const core=compute.indexOf('transformTrafficIntegrityCoreResponse(request,response)');
  assert.ok(lower>=0&&rss>lower&&core>rss,'RSS transform must remain after lower runtime and before later response transforms');
  assert.match(compute,/import base from '\.\/distribution-discovery-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
});

test('RSS transform preserves feed metadata, discovery link and lemlist profile correction',()=>{
  const runtime=read('lemlist-profile-correction-worker.js');
  assert.match(runtime,/export async function transformRssPublicResponse/);
  assert.match(runtime,/application\/rss\+xml/);
  assert.match(runtime,/pubsubhubbub\.appspot\.com/);
  assert.match(runtime,/rel="alternate"/);
  assert.match(runtime,/PROFILE_PATH='\/tools\/lemlist'/);
  assert.match(runtime,/14-day free trial/);
  assert.match(runtime,/650M\+ lead database/);
});

test('RSS scheduled WebSub publish stays in compatibility scheduler and is not duplicated in compute',()=>{
  const runtime=read('lemlist-profile-correction-worker.js');
  const compute=read('compute-router-worker.js');
  assert.match(runtime,/event\?\.cron==='15 \* \* \* \*'/);
  assert.match(runtime,/publishRssIfChanged\(env,\{reason:'hourly'\}\)/);
  assert.doesNotMatch(compute,/publishRssIfChanged/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});

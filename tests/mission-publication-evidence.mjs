import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const token='local-test-only', hash=createHash('sha256').update(token).digest('hex');
for(const file of ['mission-integrity-worker.js','mission-integrity-v2-worker.js']){
  let source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  source=source.replace(/^import base.*$/m,'const base={fetch:async()=>Response.json({})};').replace(/const (?:TOKEN|PROOF)_SHA256='[^']+'/,m=>m.replace(/'[^']+'/,"'"+hash+"'"));
  const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  let bindings;
  const db={batch:async()=>[],prepare:()=>({bind(...args){bindings=args;return this;},run:async()=>({success:true})})};
  const send=async(body,auth=true)=>mod.default.fetch(new Request('https://example.test/api/engine-evidence',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'Authorization':'Bearer '+token,'X-ToolScout-Proof':token}:{})},body:JSON.stringify({engine:'content',mission_id:'test',stage:'x',observed_at:'2026-09-18T07:00:00Z',...body})}),{DB:db},{});
  assert.equal((await send({status:'queued',external_id:'buffer-id'},false)).status,401);
  assert.equal((await send({status:'queued'})).status,422);
  let response=await (await send({status:'completed',external_id:'buffer-id'})).json();
  assert.equal(response.status,'queued'); assert.equal(response.verified,false); assert.equal(bindings[4],'queued');
  response=await (await send({status:'completed',external_id:'https://x.com/ToolScout/status/123456789'})).json();
  assert.equal(response.status,'completed'); assert.equal(response.verified,true);
  assert.equal((await send({status:'failed',detail:'vendor rejection'})).status,200);
  if(mod.contentMissionHealth){
    const now=new Date().toISOString();
    const rows=[{stage:'linkedin',status:'completed',external_id:'li-id'},{stage:'bluesky',status:'completed',external_id:'at://id'},{stage:'x',status:'queued',external_id:'buffer-id'}];
    const env={DB:{batch:async()=>[],prepare:()=>({bind(){return this;},first:async()=>({mission_id:'test',first_at:now,last_at:now}),all:async()=>({results:rows})})}};
    let health=await mod.contentMissionHealth(env);
    assert.deepEqual(health.queued_stages,['x']);assert.equal(health.last_completed_at,null);assert.notEqual(health.status,'healthy');
    rows[2].status='completed';rows[2].external_id='https://x.com/ToolScout/status/123456789';
    health=await mod.contentMissionHealth(env);assert.equal(health.status,'healthy');
    rows[2].status='failed';health=await mod.contentMissionHealth(env);assert.equal(health.status,'failed');
  }
}
console.log('Publication evidence checks passed for both authentication paths.');

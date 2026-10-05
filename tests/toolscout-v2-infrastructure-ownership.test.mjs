import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('GitHub Actions surface matches the operating contract exactly',()=>{
  const contract=JSON.parse(read('docs/OPERATING-CONTRACT.json'));
  const dir=new URL('.github/workflows/',root);
  const actual=fs.readdirSync(dir).filter(x=>/\.ya?ml$/i.test(x)).sort();
  const allowed=[...(contract.github_actions?.active_workflows||[])].sort();
  assert.deepEqual(actual,allowed);
  assert.equal(contract.github_actions?.primary_scheduler_forbidden,true);
});

test('only the approved telemetry and SEO workflows own GitHub schedules',()=>{
  const contract=JSON.parse(read('docs/OPERATING-CONTRACT.json'));
  const scheduled=contract.github_actions?.scheduled_workflows||{};
  for(const name of contract.github_actions?.active_workflows||[]){
    const body=read('.github/workflows/'+name);
    const hasSchedule=/\n\s*schedule\s*:/.test(body);
    assert.equal(hasSchedule,Object.hasOwn(scheduled,name),name+' schedule ownership drift');
    if(hasSchedule){
      const expected=String(scheduled[name]);
      assert.ok(body.includes("cron: '"+expected+"'")||body.includes('cron: "'+expected+'"'),name+' cron drift');
    }
  }
});

test('Cloudflare remains the primary scheduler and Render remains execution only',()=>{
  const contract=JSON.parse(read('docs/OPERATING-CONTRACT.json'));
  assert.equal(contract.execution?.cloudflare_is_control_plane,true);
  assert.equal(contract.execution?.render_is_execution_plane,true);
  assert.equal(contract.execution?.overlapping_core_work_forbidden,true);
  assert.equal(contract.render?.overflow?.must_not_own_canonical_business_state,true);
});

test('Render Postgres is residual and cannot become canonical runtime state',()=>{
  const contract=JSON.parse(read('docs/OPERATING-CONTRACT.json'));
  const pg=contract.render?.postgres_runtime;
  assert.equal(pg?.status,'residual_pending_retirement');
  assert.equal(pg?.canonical_business_state,false);
  assert.equal(pg?.upgrade_required,false);
  assert.equal(pg?.database_name,'toolscout_runtime');
  const repositoryFiles=[
    'compute-router-worker.js',
    'cloudflare-primary-runtime-worker.js',
    'growth-scheduler.js',
    'distribution-orchestrator-worker.js',
    'overflow-compute/server.mjs',
    'auth-broker/server.mjs'
  ];
  for(const file of repositoryFiles){
    const body=read(file);
    assert.doesNotMatch(body,/DATABASE_URL|postgres(?:ql)?:\/\//i,file+' unexpectedly depends on Postgres');
  }
});

test('dated snapshot-bound recovery launchers stay retired',()=>{
  for(const name of [
    'authority-truth-production-repair.yml',
    'growth-sprint-1-production.yml',
    'growth-truth-production-repair.yml'
  ]){
    assert.equal(fs.existsSync(new URL('.github/workflows/'+name,root)),false,name+' must remain retired');
  }
});


test('runtime reports conservation stubs as retired',()=>{
  const runtime=read('cloudflare-primary-runtime-worker.js');
  assert.match(runtime,/conservationStubsExpected:false/);
  assert.doesNotMatch(runtime,/conservationStubsExpected:true/);
});

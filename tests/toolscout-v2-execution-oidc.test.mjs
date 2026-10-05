import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');

test('execution dispatch keeps admin auth and adds repo-scoped GitHub OIDC',()=>{
  assert.match(src,/claims\.aud!=='toolscout-execution'/);
  assert.match(src,/claims\.repository!=='pcaiano\/toolscout'/);
  assert.match(src,/claims\.ref!=='refs\/heads\/main'/);
  assert.match(src,/claims\.iss!=='https:\/\/token\.actions\.githubusercontent\.com'/);
  assert.match(src,/env\.ADMIN_TOKEN&&t===env\.ADMIN_TOKEN/);
  assert.match(src,/async function executionAuth\(request,env\)/);
  assert.match(src,/return githubExecutionOidcValid\(t\)/);
});

test('execution dispatch remains protected by auth',()=>{
  assert.match(src,/\/api\/growth\/execution\/dispatch'.*POST/);
  assert.match(src,/if\(!\(await executionAuth\(request,env\)\)\)return Response\.json\(\{error:'unauthorized'\}/);
});


test('GitHub OIDC does not widen unrelated admin routes',()=>{
  const adminAuth=src.match(/async function auth\(request,env\)\{[^}]+\}/s)?.[0]||'';
  assert.match(adminAuth,/return Boolean\(env\.ADMIN_TOKEN&&t===env\.ADMIN_TOKEN\)/);
  assert.doesNotMatch(adminAuth,/githubExecutionOidcValid/);
});

test('manual execution dispatch refreshes opportunities before claiming tasks',()=>{
  assert.match(src,/mission:'opportunity_coordination',triggerName:'manual_execution_dispatch'/);
  assert.match(src,/preExecutionCoordination/);
  const coord=src.indexOf("triggerName:'manual_execution_dispatch'");
  const exec=src.indexOf("triggerName:'manual_api'",coord);
  assert.ok(coord>=0&&exec>coord);
});

test('execution-scoped OIDC may refresh canonical opportunities but does not open general admin routes',()=>{
  assert.match(src,/\/api\/growth\/opportunities\/refresh'.*POST.*executionAuth\(request,env\)/s);
  assert.match(src,/\/api\/growth\/supervisor\/audit'.*POST.*auth\(request,env\)/s);
});


test('repo-scoped GitHub OIDC can invoke only the bounded engine-health recovery route',()=>{
  assert.match(src,/\/api\/growth\/engine-health\/public-reconcile'.*POST/s);
  assert.match(src,/growthEscalationHandoffOk\(request\).*executionAuth\(request,env\)/s);
  assert.match(src,/run\('networkCycle','distribution','network_cycle',20/);
});

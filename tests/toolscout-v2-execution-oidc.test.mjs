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
  assert.match(src,/return githubExecutionOidcValid\(t\)/);
});

test('execution dispatch remains protected by auth',()=>{
  assert.match(src,/\/api\/growth\/execution\/dispatch'.*POST/);
  assert.match(src,/if\(!\(await auth\(request,env\)\)\)return Response\.json\(\{error:'unauthorized'\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../growth-execution-contract.js',import.meta.url),'utf8');

test('stale surface authority contracts are cancelled from current distribution truth',()=>{
  assert.match(src,/surface_state_superseded_authority_action/);
  assert.match(src,/subject_key IN \('rss','toolscout-ard','toolscout-machine-discovery'\)/);
  for(const status of ['live','verified','pending_review','scheduled','submitted','human_action_required']) assert.match(src,new RegExp(status));
  assert.match(src,/COALESCE\(o\.human_required,0\)=1/);
});

test('verification and proven-surface actions are not blanket-cancelled',()=>{
  const m=src.match(/staleSurfaceAuthority[\s\S]*?\)\.run\(\)\.catch/);
  assert.ok(m);
  assert.doesNotMatch(m[0],/verify_backlink_acquisition/);
  assert.doesNotMatch(m[0],/scale_proven_surface/);
});

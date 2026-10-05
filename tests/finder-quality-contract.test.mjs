import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Finder refuses ungrounded rankings instead of assigning a default match',()=>{
  assert.match(app,/function querySignal\(/);
  assert.match(app,/if\(!signal\.recognized\)/);
  assert.match(app,/\.filter\(t=>t\.score>=50\)/);
  assert.match(app,/recommendation_unresolved/);
  assert.doesNotMatch(app,/const raw=40\+/);
});

test('Finder implements the approved interpretation and result reveal motion',()=>{
  assert.match(app,/async function runRecommendation\(/);
  assert.match(app,/Interpreting your need/);
  assert.match(app,/Matching the decision criteria/);
  assert.match(home,/\.search-progress/);
  assert.match(home,/@keyframes resultReveal/);
  assert.match(home,/prefers-reduced-motion:reduce/);
});

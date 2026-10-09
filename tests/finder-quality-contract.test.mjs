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


test('broad category searches avoid fake personalized percentages',()=>{
  assert.match(app,/function broadCategoryQuery\(/);
  assert.match(app,/This is a broad category search/);
  assert.match(app,/Category fit/);
  assert.match(app,/Refine for personalized ranking/);
  assert.match(app,/function scoreTool\(/);
  assert.doesNotMatch(app,/const raw=42\+/);
  assert.match(app,/if\(goal&&!sameCategory&&!nameMatch\)return -1/);
  assert.match(app,/t\.freePlanKnown!==true/);
  assert.match(app,/t\.editorialReview\?\.summary/);
});

test('Finder motion exposes three visible decision stages',()=>{
  assert.match(app,/data-stage="1"/);
  assert.match(app,/Matching the decision criteria/);
  assert.match(app,/Building your shortlist/);
  assert.match(home,/\.search-stages/);
  assert.match(home,/\.search-stage\.active/);
});

test('Search Engine shows an explained editorial fit indicator, not a fabricated probability',()=>{
  assert.ok(app.includes('Fit score</span><strong>${t.score}/100'));
  assert.ok(!app.includes('Match</span><strong>${t.score}%'));
  assert.match(app,/Scores are editorial fit indicators, not probabilities/);
  assert.ok(app.includes('if(!signal.recognized)'));
});

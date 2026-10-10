import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {businessWorkflowGuidance} from '../business-workflow-intent.js';
import {qualifiedSoftwareDecisionShortlist} from '../agent-protocol-core-worker.js';

const load=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const baseline=load('data/tools.json'),wave5=load('data/catalog-wave5-decision-ready.json');
const catalog=[...baseline,...wave5];

test('a broad restaurant decision leads with documented restaurant POS, not generic project software',()=>{
 const g=businessWorkflowGuidance('best software for my restaurant',{},catalog);
 assert.equal(g.decision_status,'needs_workflow_selection');
 assert.deepEqual(g.workflows.map(w=>w.category),['business','crm','marketing','automation']);
 assert.equal(g.specialist_workflows.length,1);
 const w=g.specialist_workflows[0];
 assert.equal(w.category,'restaurant-pos');
 assert.equal(w.specialist,true);
 assert.deepEqual(w.category_examples.map(t=>t.slug).sort(),['square-for-restaurants','toast-pos']);
 const next=qualifiedSoftwareDecisionShortlist(catalog,{job:w.job,limit:5});
 assert.ok(next.some(t=>t.slug==='toast-pos'));
 assert.ok(next.every(t=>t.category==='restaurant-pos'));
 assert.equal(w.availability,'documented_specialist_category');
 assert.ok(w.finder_url.includes('source=ai-agent'));
 assert.doesNotMatch(JSON.stringify(g),/pos\.toasttab\.com|squareup\.com|sourceUrl|\/go\//);
});

test('a broad veterinary clinic decision offers a documented clinical job but dental care does not',()=>{
 const vet=businessWorkflowGuidance('best software for my veterinary clinic',{},catalog);
 assert.equal(vet.industry,'healthcare');
 assert.deepEqual(vet.specialist_workflows.map(w=>w.category),['veterinary']);
 assert.deepEqual(vet.specialist_workflows[0].category_examples.map(t=>t.slug),['ezyvet']);
 const next=qualifiedSoftwareDecisionShortlist(catalog,{job:vet.specialist_workflows[0].job,limit:5});
 assert.ok(next.some(t=>t.slug==='ezyvet'));
 assert.ok(next.every(t=>t.category==='veterinary'));
 const dentist=businessWorkflowGuidance('best software for my dental clinic',{},catalog);
 assert.deepEqual(dentist.specialist_workflows,[]);
 assert.deepEqual(businessWorkflowGuidance('best software for my restaurant',{},baseline).specialist_workflows,[],
   'Do not fabricate specialist choices before D1 admission');
});

test('no specialist handoff without dated manufacturer-proven capability and category eligibility',()=>{
 const altered=wave5.map(t=>structuredClone(t));
 const toast=altered.find(t=>t.slug==='toast-pos');
 toast.decisionClaims=toast.decisionClaims.map(c=>({...c,sourceUrl:'https://third-party.example/docs'}));
 const square=altered.find(t=>t.slug==='square-for-restaurants');
 square.rankingEligible=false;
 const restaurant=businessWorkflowGuidance('best software for my restaurant',{},[...baseline,...altered]);
 assert.deepEqual(restaurant.specialist_workflows,[]);
 const ezy=altered.find(t=>t.slug==='ezyvet');
 ezy.decisionClaims=ezy.decisionClaims.map(c=>({...c,verifiedAt:'2025-01-01'}));
 assert.deepEqual(businessWorkflowGuidance('best software for my veterinary clinic',{},[...baseline,...altered]).specialist_workflows,[]);
});

test('public Finder, mini widget and A2A all include the same gated specialist pathways',()=>{
 const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 assert.match(read('app.js'),/guidance\.specialist_workflows/);
 assert.match(read('embed/toolscout-finder.js'),/guidance\.specialist_workflows/);
 assert.match(read('agent-protocol-core-worker.js'),/g\.specialist_workflows/);
 assert.match(read('app.js'),/w\.specialist/);
 assert.match(read('embed/toolscout-finder.js'),/w\.specialist/);
});

test('Codex P2: specialist proof must describe the specialist job, not any unrelated capability',()=>{
 const copy=wave5.map(t=>structuredClone(t));
 for(const t of copy.filter(t=>t.category==='restaurant-pos'||t.category==='veterinary'))
   t.decisionClaims=t.decisionClaims.map(c=>({...c,value:'email campaigns'}));
 assert.deepEqual(businessWorkflowGuidance('best software for my restaurant',{},[...baseline,...copy]).specialist_workflows,[]);
 assert.deepEqual(businessWorkflowGuidance('best software for my veterinary clinic',{},[...baseline,...copy]).specialist_workflows,[]);
});

test('Codex P2: veterinarian, vet practice and animal hospital route to healthcare specialist guidance',()=>{
 for(const job of ['best software for my veterinarian','best software for my vet practice','best software for my animal hospital']){
  const g=businessWorkflowGuidance(job,{},catalog);
  assert.equal(g.industry,'healthcare',job);
  assert.deepEqual(g.specialist_workflows.map(w=>w.category),['veterinary'],job);
 }
});

test('Codex P2: Finder Full preserves all four general workflows alongside the specialist',()=>{
 const js=fs.readFileSync(new URL('../embed/toolscout-finder.js',import.meta.url),'utf8');
 assert.match(js,/const general=Array\.isArray\(guidance\.workflows\)\?guidance\.workflows\.slice\(0,4\)/);
 assert.match(js,/mode==='mini'\?\[\.\.\.specialist,\.\.\.general\]\.slice\(0,2\):\[\.\.\.specialist,\.\.\.general\]/);
});

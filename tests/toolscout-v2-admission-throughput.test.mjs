import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedManufacturerEvidence,stageReviewedCatalogCandidate,handleCatalogAutonomyRoute} from '../catalog-autonomy-worker.js';
import {structuralCatalogIssues} from '../catalog-quality-runtime.js';

const runtime=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
const cohort=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave6-decision-ready.json',import.meta.url),'utf8'));
const engine=JSON.parse(fs.readFileSync(new URL('../data/catalog-engine.json',import.meta.url),'utf8'));

test('hourly admission handles at least one full documented cohort without weakening gates',()=>{
 assert.match(runtime,/MAX_ADMIT_PER_DAY=24/);
 assert.match(runtime,/MAX_CANDIDATE_CHECKS_PER_CYCLE=32/);
 assert.match(runtime,/if\(!trustedManufacturerEvidence\(raw,\{decisionGrade:true\}\)\)/);
 assert.match(runtime,/source\.status!=='ok'/);
 assert.match(runtime,/if\(!quality\.publishable\)/);
 assert.match(runtime,/source_status='ok'/);
 assert.ok(engine.trustedCandidateFiles.includes('data/catalog-wave6-decision-ready.json'));
});

test('wave six supplies eight distinct eligible manufacturer-documented vendor records',()=>{
 assert.equal(cohort.length,8);
 assert.equal(new Set(cohort.map(t=>t.slug)).size,cohort.length);
 for(const tool of cohort){
  assert.equal(trustedManufacturerEvidence(tool,{decisionGrade:true}),true,tool.slug+' lacks first-party proof');
  assert.deepEqual(structuralCatalogIssues(tool),[],tool.slug+' lacks full catalog parity');
 }
});


test('documented research candidates enter private D1 staging without becoming public catalog',async()=>{
 const candidate=cohort[0];
 const writes=[];
 const env={
   ADMIN_TOKEN:'internal-test-secret',
   ASSETS:{fetch:async request=>{
     const path=new URL(request.url).pathname;
     if(path==='/data/catalog-engine.json')return Response.json(engine);
     if(path==='/data/tools.json')return Response.json([]);
     return new Response('not found',{status:404});
   }},
   DB:{prepare(sql){
     return{
       bind(...values){return{
         first:async()=>({n:7}),
         run:async()=>{writes.push({sql,values});return{meta:{changes:1}}}
       }},
       all:async()=>({results:[]})
     };
   }}
 };
 const denied=await handleCatalogAutonomyRoute(new Request('https://trytoolscout.org/api/catalog-autonomy/research-stage',{method:'POST'}),env);
 assert.equal(denied.status,401,'authenticated staging is never publicly writable');
 const result=await stageReviewedCatalogCandidate(env,candidate);
 assert.equal(result.ok,true);
 assert.equal(result.status,'research_ready');
 assert.equal(result.published,false);
 assert.equal(result.admitted,false);
 assert.ok(!JSON.stringify(result).includes(candidate.editorialReview.sourceUrl),'private evidence URLs stay off intake results');
 const insert=writes.find(x=>/INSERT INTO catalog_runtime_candidates/.test(x.sql));
 assert.ok(insert,'canonical D1 receives the candidate');
 assert.match(insert.sql,/research_ready/);
 assert.match(insert.sql,/WHERE catalog_runtime_candidates.status='research_ready'/,
   'a staged candidate cannot overwrite the published or quality-held record');
 const events=writes.filter(x=>/INSERT INTO catalog_runtime_events/.test(x.sql));
 assert.equal(events.length,1);
});

test('research intake refuses undated evidence and cannot overwrite canonical static profiles',async()=>{
 const candidate=cohort[0];
 const bad={...candidate,evidence:[],decisionClaims:[]};
 const asset=async request=>{
   const path=new URL(request.url).pathname;
   return Response.json(path==='/data/catalog-engine.json'?engine:path==='/data/tools.json'?[]:{});
 };
 const unusedDb={prepare(){throw Error('invalid evidence must not reach D1')}};
 const missing=await stageReviewedCatalogCandidate({ASSETS:{fetch:asset},DB:unusedDb},bad);
 assert.equal(missing.ok,false);
 assert.equal(missing.reason,'manufacturer_decision_evidence_required');
 const protectedAsset=async request=>{
   const path=new URL(request.url).pathname;
   return Response.json(path==='/data/catalog-engine.json'?engine:path==='/data/tools.json'?[{slug:candidate.slug}]:{});
 };
 const existing=await stageReviewedCatalogCandidate({ASSETS:{fetch:protectedAsset},DB:unusedDb},candidate);
 assert.equal(existing.reason,'existing_published_tool');
});

test('D1 research ready ingestion shares existing bounded hourly catalog coverage contract',()=>{
 assert.match(runtime,/WHERE status='research_ready' ORDER BY updated_at ASC LIMIT 128/);
 assert.match(runtime,/profile_json FROM catalog_runtime_candidates/);
 assert.match(runtime,/if\(!trustedManufacturerEvidence\(raw,\{decisionGrade:true\}\)\)/);
 assert.match(runtime,/if\(config\?\.admission\?\.requireReachableOfficialSource!==false&&source.status!=='ok'\)/);
 assert.match(runtime,/if\(!quality\.publishable\)/);
 assert.match(runtime,/SELECT tool_slug FROM catalog_runtime_candidates WHERE status='research_ready' LIMIT 1/);
 const routes=fs.readFileSync(new URL('../runtime-route-contract.js',import.meta.url),'utf8');
 assert.match(routes,/id:'catalog_reviewed_research_intake',owner:'catalog_autonomy_runtime'/);
 assert.match(runtime,/u\.pathname==='\/api\/catalog-autonomy\/research-stage'/);
 assert.match(runtime,/WHERE status IN \('published','admitted_coverage','quality_hold'\)/,
   'staged profiles cannot enter the public runtime snapshot');
});

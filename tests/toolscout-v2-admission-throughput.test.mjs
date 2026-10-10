import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedManufacturerEvidence,stageReviewedCatalogCandidate,handleCatalogAutonomyRoute,canonicalManufacturerDocumentIdentity,publishStagedCandidateIfUnchanged} from '../catalog-autonomy-worker.js';
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
 assert.match(runtime,/WHERE \$\{ACTIVE_RESEARCH_READY_WHERE\} ORDER BY c\.updated_at ASC LIMIT 128/);
 assert.match(runtime,/profile_json FROM catalog_runtime_candidates/);
 assert.match(runtime,/if\(!trustedManufacturerEvidence\(raw,\{decisionGrade:true\}\)\)/);
 assert.match(runtime,/if\(config\?\.admission\?\.requireReachableOfficialSource!==false&&source.status!=='ok'\)/);
 assert.match(runtime,/if\(!quality\.publishable\)/);
 assert.match(runtime,/SELECT c\.tool_slug FROM catalog_runtime_candidates c WHERE \$\{ACTIVE_RESEARCH_READY_WHERE\} LIMIT 1/);
 const routes=fs.readFileSync(new URL('../runtime-route-contract.js',import.meta.url),'utf8');
 assert.match(routes,/id:'catalog_reviewed_research_intake',owner:'catalog_autonomy_runtime'/);
 assert.match(runtime,/u\.pathname==='\/api\/catalog-autonomy\/research-stage'/);
 assert.match(runtime,/WHERE status IN \('published','admitted_coverage','quality_hold'\)/,
   'staged profiles cannot enter the public runtime snapshot');
});


test('Codex P1: recent failed research is deferred so 32 permanent holds cannot starve a new valid cohort',()=>{
 assert.match(runtime,/const RESEARCH_HOLD_RETRY_HOURS=6/);
 assert.match(runtime,/const ACTIVE_RESEARCH_READY_WHERE=/);
 assert.match(runtime,/catalog_candidate_manufacturer_docs_hold/);
 assert.match(runtime,/catalog_candidate_quality_hold/);
 assert.match(runtime,/h\.created_at>=datetime\('now','-6 hours'\)/);
 assert.match(runtime,/h\.created_at>=c\.updated_at/);
 const uses=runtime.match(/\$\{ACTIVE_RESEARCH_READY_WHERE\}/g)||[];
 assert.ok(uses.length>=2,'hourly selection and incident recovery both respect hold cooldown');
 assert.match(runtime,/stagedSlugs\.has\(slug\)/,'the API-staged revision takes precedence over stale checked-in files');
});

test('Codex P2: two URLs with different tracking parameters do not prove two manufacturer documents',()=>{
 const base='https://docs.vendor.example/features/pricing';
 assert.equal(canonicalManufacturerDocumentIdentity(base+'?utm_campaign=a'),
   canonicalManufacturerDocumentIdentity(base+'?utm_campaign=b#details'));
 assert.equal(canonicalManufacturerDocumentIdentity(base+'/'),
   canonicalManufacturerDocumentIdentity(base));
 assert.notEqual(canonicalManufacturerDocumentIdentity(base),
   canonicalManufacturerDocumentIdentity('https://docs.vendor.example/features/integrations'));
 assert.equal(canonicalManufacturerDocumentIdentity('http://docs.vendor.example/features/pricing'),null);
 assert.match(runtime,/canonicalManufacturerDocumentIdentity\(result\.finalUrl\)/);
});

test('Codex P2: a concurrent newer D1 revision wins over the old admission snapshot',async()=>{
 const changes=[];
 const env={DB:{prepare(sql){return{bind(...params){
   changes.push({sql,params});
   return{run:async()=>({meta:{changes:0}})};
 }}}}};
 const old=JSON.stringify({slug:'example',editorial:'old'});
 const next={slug:'example',editorial:'new'};
 assert.equal(await publishStagedCandidateIfUnchanged(env,'example',next,old),false);
 assert.equal(changes.length,1);
 assert.match(changes[0].sql,/WHERE tool_slug=\? AND status='research_ready' AND profile_json=\?/);
 assert.equal(changes[0].params[2],old);
 assert.equal(changes[0].params[1],'example');
 assert.deepEqual(JSON.parse(changes[0].params[0]),next);
 const admitted={DB:{prepare(){return{bind(){return{run:async()=>({meta:{changes:1}})}}}}}};
 assert.equal(await publishStagedCandidateIfUnchanged(admitted,'example',next,old),true);
 assert.match(runtime,/catalog_candidate_revision_superseded/);
});

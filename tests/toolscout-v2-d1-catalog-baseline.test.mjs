import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {seedBaselineCatalog,publicMergedTools,publicRuntimeToolResponse,publicCatalogInventory} from '../catalog-autonomy-worker.js';
import {missionOwner,TOOLSCOUT_CRONS,SCHEDULED_MISSIONS} from '../runtime-schedule-contract.js';

const all=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const hubspot=all.find(t=>t.slug==='hubspot');
const airtable=all.find(t=>t.slug==='airtable');
const zapier=all.find(t=>t.slug==='zapier');
assert.ok(hubspot&&airtable&&zapier);
function fixture(){
 const staticTools=[hubspot,airtable,zapier];
 const revisions=new Map();
 const db={prepare(statement){
   let args=[];
   return {
     bind(...values){args=values;return this},
     async all(){
       if(statement.includes('FROM catalog_runtime_candidates')&&statement.includes('SELECT tool_slug FROM'))return {results:[...revisions.keys()].map(tool_slug=>({tool_slug}))};
       if(statement.includes('FROM catalog_runtime_candidates'))return {results:[...revisions.entries()].map(([tool_slug,r])=>({tool_slug,profile_json:r.json,status:'published',source_status:r.origin,verified_at:r.verifiedAt}))};
       if(statement.includes('FROM catalog_runtime_state'))return {results:[]};
       if(statement.includes('FROM affiliate_workflow'))return {results:[]};
       throw Error('Unexpected all query: '+statement);
     },
     async first(){
       if(statement.includes('sqlite_master'))return {n:7};
       if(statement.includes('COUNT(*) n FROM catalog_runtime_candidates'))return {n:[...revisions.keys()].filter(slug=>args.includes(slug)).length};
       throw Error('Unexpected first query: '+statement);
     },
     async run(){
       if(!statement.includes('INSERT OR IGNORE INTO catalog_runtime_candidates'))throw Error('Unexpected mutation: '+statement);
       const [slug,json,verifiedAt]=args;
       if(revisions.has(slug))return {meta:{changes:0}};
       revisions.set(slug,{json,origin:'baseline_snapshot',verifiedAt});
       return {meta:{changes:1}};
     }
   };
 }};
 const env={DB:db,ASSETS:{async fetch(req){
   const path=new URL(req.url).pathname;
   if(path==='/data/tools.json')return Response.json(staticTools);
   if(path==='/data/affiliate.json')return Response.json({});
   return new Response('not found',{status:404});
 }}};
 return {env,revisions,staticTools};
}
test('new D1 migration uses the existing growth scheduler, not a shadow engine',()=>{
 assert.equal(missionOwner('baseline_catalog_migration'),'growth_scheduler');
 assert.equal(SCHEDULED_MISSIONS.baseline_catalog_migration.cron,TOOLSCOUT_CRONS.hourly);
 const scheduler=fs.readFileSync(new URL('../growth-scheduler.js',import.meta.url),'utf8');
 assert.match(scheduler,/mission:'baseline_catalog_migration'/);
 assert.match(scheduler,/seedBaselineCatalog\(env\)/);
});
test('bounded baseline backfill is complete, lossless and idempotent without overwriting D1 revisions',async()=>{
 const {env,revisions,staticTools}=fixture();
 const revised={...hubspot,description:'Already reviewed in D1 with a newer buyer-specific editorial interpretation'};
 revisions.set('hubspot',{json:JSON.stringify(revised),origin:'editorially_verified',verifiedAt:'2026-10-09'});
 const first=await seedBaselineCatalog(env,{limit:1});
 assert.equal(first.copied,1);
 assert.equal(first.seeded,2);
 assert.equal(first.remaining,1);
 const second=await seedBaselineCatalog(env,{limit:3});
 assert.equal(second.copied,1);
 assert.equal(second.seeded,3);
 assert.equal(second.remaining,0);
 assert.equal(second.phase,'seeded_pending_surface_promotion');
 const third=await seedBaselineCatalog(env);
 assert.equal(third.copied,0);
 assert.equal(revisions.get('hubspot').json,JSON.stringify(revised));
 for(const original of staticTools.filter(t=>t.slug!=='hubspot')){
   assert.deepEqual(JSON.parse(revisions.get(original.slug).json),original,'must preserve exact per-feature manufacturer evidence and editorial structure');
   assert.equal(revisions.get(original.slug).origin,'baseline_snapshot');
 }
 const catalog=await publicMergedTools(env);
 assert.deepEqual(catalog.map(t=>t.slug),staticTools.map(t=>t.slug));
 assert.equal(catalog.find(t=>t.slug==='hubspot').description,revised.description,'D1 revision is authoritative in Finder and MCP data');
 const fallbackPage=await publicRuntimeToolResponse(env,'airtable');
 assert.equal(fallbackPage,null,'legacy HTML remains the public presentation until renderer parity validation');
 const inventory=await publicCatalogInventory(env);
 assert.equal(inventory.total,3);
 assert.deepEqual([inventory.storage.seeded_baseline,inventory.storage.baseline_remaining],[2,1],'distinguishes imported baseline rows from reviewed D1 revisions');
 assert.equal(inventory.storage.primary,'cloudflare_d1');
 assert.equal(inventory.storage.legacy_html_preserved,true);
});
test('migration cannot accidentally insert fabricated vendor verification timestamps',async()=>{
 const {env,revisions}=fixture();
 await seedBaselineCatalog(env,{limit:3});
 for(const row of revisions.values()){
   const profile=JSON.parse(row.json);
   assert.equal(row.verifiedAt,profile.lastVerified||profile.sourceCheckedOn||null);
 }
});

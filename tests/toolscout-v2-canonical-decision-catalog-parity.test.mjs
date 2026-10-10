import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicMergedTools,publicDecisionCatalogTools,publicRuntimeToolResponse} from '../catalog-autonomy-worker.js';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const original=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const source=original.find(t=>t.slug==='hubspot');
assert.ok(source,'first-party documented HubSpot test fixture missing');
const admitted={...structuredClone(source),slug:'runtime-evidence-crm',name:'Runtime Evidence CRM',
  description:'Evidence-grounded CRM selected as a fixture for the dynamic admission decision regression.',
  category:'crm',rankingEligible:true,comparisonEligible:true,categoryReviewRequired:false};
const paused={...structuredClone(source),slug:'runtime-paused-crm',name:'Runtime Paused CRM',rankingEligible:false};
const broken={...structuredClone(source),slug:'runtime-broken-crm',name:'Runtime Broken CRM'};
const profiles=[admitted,paused,broken].map(p=>({tool_slug:p.slug,profile_json:JSON.stringify(p),status:'published',source_status:'ok',verified_at:'2026-10-09'}));
const states=[{tool_slug:broken.slug,quality_status:'confirmed_broken'}];
function fullEnvironment({withDb=true}={}){
 const env={ASSETS:{async fetch(req){const p=new URL(req.url).pathname;
   if(p==='/data/tools.json')return Response.json(original);
   if(p==='/data/intents.json')return Response.json([]);
   if(p==='/data/affiliate.json')return Response.json({[admitted.slug]:{enabled:true,url:'https://merchant.example/approved-referral'},[paused.slug]:{enabled:false,url:'https://merchant.example/disabled'},hubspot:{enabled:true,url:'http://insecure.example/affiliate'},airtable:{enabled:false,url:'https://approved.example/affiliate'}});
   return new Response('missing',{status:404});
 }}};
 if(withDb)env.DB={prepare(sql){
   return {async all(){
     if(sql.includes('FROM catalog_runtime_candidates'))return {results:profiles};
     if(sql.includes('FROM catalog_runtime_state'))return {results:states};
     throw Error('Unexpected database query: '+sql);
   }};
 }};
 return env;
}
async function mcp(name,args,env){
 const body={jsonrpc:'2.0',id:556,method:'tools/call',params:{name,arguments:args,
   _meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'catalog-parity-test',version:'1.0'}}}};
 const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{method:'POST',
   headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},body:JSON.stringify(body)}),env,{waitUntil(){}});
 assert.equal(response.status,200);
 return (await response.json()).result;
}
test('canonical catalog merges documented runtime admissions without retaining confirmed broken vendors',async()=>{
 const all=await publicMergedTools(fullEnvironment());
 assert.equal(all.filter(t=>t.slug==='hubspot').length,1);
 assert.equal(all.some(t=>t.slug===admitted.slug),true);
 assert.equal(all.some(t=>t.slug===paused.slug),true,'ineligible records still exist for transparent lookup');
 assert.equal(all.some(t=>t.slug===broken.slug),false,'confirmed broken vendor must remain suppressed');
 assert.equal(all.length,original.length+2);
});
test('decision catalog preserves canonical rank order while refusing disabled, missing and insecure product URLs',async()=>{
 const env=fullEnvironment();
 const [canonical,projected]=await Promise.all([publicMergedTools(env),publicDecisionCatalogTools(env)]);
 assert.deepEqual(projected.map(t=>t.slug),canonical.map(t=>t.slug),'affiliate presence never reorders catalog');
 assert.equal(projected.find(t=>t.slug===admitted.slug).toolscoutApprovedVisit,'https://trytoolscout.org/go/'+admitted.slug);
 for(const slug of ['hubspot','airtable',paused.slug]){
   assert.equal(projected.find(t=>t.slug===slug).toolscoutApprovedVisit,null,slug+' must not advertise broken commerce');
 }
 const noAffiliate=await mcp('get_tool',{tool:'hubspot'},env);
 assert.equal(noAffiliate.structuredContent.tool.tool_url,null);
 assert.equal(noAffiliate.structuredContent.tool.profile_url,'https://trytoolscout.org/tools/hubspot');
 const approved=await mcp('get_tool',{tool:admitted.slug},env);
 assert.equal(approved.structuredContent.tool.tool_url,'https://trytoolscout.org/go/'+admitted.slug+'?source=ai-agent');
 assert.equal(approved.structuredContent.tool.profile_url,'https://trytoolscout.org/tools/'+admitted.slug);
});
test('Finder recommends a new runtime-admitted vendor without requiring a static JSON rebuild',async()=>{
 const env=fullEnvironment();
 const r=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q='+encodeURIComponent(admitted.name)),env);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.ok(data.recommendations.some(x=>x.slug===admitted.slug),JSON.stringify(data));
 assert.ok(data.recommendations.every(x=>x.slug!==broken.slug&&x.slug!==paused.slug));
 assert.ok(data.recommendations.find(x=>x.slug===admitted.slug).tool_url.includes('/go/'));
 assert.doesNotMatch(JSON.stringify(data),/sourceUrl|knowledge\.hubspot\.com/);
});
test('MCP named lookup and AI shortlisting include the same runtime catalog, respecting quality gates',async()=>{
 const env=fullEnvironment();
 const lookup=await mcp('get_tool',{tool:admitted.slug},env);
 assert.equal(lookup.isError,false);
 assert.equal(lookup.structuredContent.tool.slug,admitted.slug);
 const search=await mcp('search_tools',{q:admitted.name},env);
 assert.equal(search.isError,false);
 assert.equal(search.structuredContent.results[0].slug,admitted.slug);
 const decision=await mcp('decide_software',{job:'CRM for a small business',limit:5},env);
 assert.equal(decision.isError,false);
 assert.ok(decision.structuredContent.shortlist.every(x=>x.slug!==paused.slug&&x.slug!==broken.slug));
 assert.equal(decision.structuredContent.decision_basis.no_pay_to_rank,true);
 assert.doesNotMatch(JSON.stringify(lookup.structuredContent),/sourceUrl|knowledge\.hubspot\.com/);
});
test('static catalog fallback remains usable when D1 is unavailable',async()=>{
 const env=fullEnvironment({withDb:false});
 const catalog=await publicMergedTools(env);
 assert.ok(catalog.length>=original.length,'catalog must not lose static entries during D1 errors');
 assert.ok(catalog.some(t=>t.slug==='hubspot'));
 // A worker may retain its last-known-good runtime snapshot while D1 is down.
 const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q=CRM'),env);
 assert.equal(response.status,200);
 const result=await response.json();
 assert.ok(result.recommendations.length>0);
 assert.ok(result.recommendations.every(x=>x.slug!==broken.slug));
});

test('runtime profile renders structured first-party editorial proof as prose without an old profile H1',async()=>{
 const response=await publicRuntimeToolResponse(fullEnvironment(),admitted.slug);
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/<h1>Runtime Evidence CRM<\/h1>/);
 assert.doesNotMatch(html,/<h1>Runtime Evidence CRM profile<\/h1>|\[object Object\]/);
 assert.ok(html.includes('ToolScout view'));
 assert.ok(typeof admitted.editorialReview?.summary==='string');
 assert.ok(html.includes(admitted.editorialReview.summary.slice(0,30)));
 assert.doesNotMatch(html,/href=["']https:\/\/(?:knowledge\.hubspot\.com|help\.zapier\.com)/);
});
test('market-gap catalog growth retains manufacturer-review objects and individual claims',()=>{
 const src=fs.readFileSync(new URL('../catalog-gap-runtime-worker.js',import.meta.url),'utf8');
 assert.match(src,/profile\.editorialReview=\{\.\.\.documentedReview,summary:clean\(documentedReview\.summary\)\}/);
 assert.match(src,/decisionClaims:Array\.isArray\(hint\?\.decisionClaims\)/);
 assert.match(src,/pricingDetails:hint\?\.pricingDetails/);
});

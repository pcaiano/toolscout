import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {businessWorkflowGuidance,verifiedPmsCandidates} from '../business-workflow-intent.js';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const intents=JSON.parse(fs.readFileSync(new URL('../data/intents.json',import.meta.url),'utf8'));
const home='https://www.sample-pms.test/';
const doc1='https://www.sample-pms.test/features/booking-channels';
const doc2='https://help.sample-pms.test/articles/reservation-management';
const proof=url=>({claimScope:'toolscout_editorial_review',sourceUrl:url,verifiedAt:'2026-10-09',method:'first_party_documentation_plus_editorial_judgment',handsOnTested:false});
const claim=(value,url)=>({type:'capability',value,status:'verified',sourceUrl:url,verifiedAt:'2026-10-09'});
function sample(){
 return {slug:'sample-pms',name:'Sample PMS',category:'vacation-rental',
  description:'Short-term rental property manager with Airbnb reservation and channel synchronization.',
  sourceUrl:home,features:['channel management','reservation management','unified inbox'],bestFor:['Airbnb hosts','vacation rental property managers'],
  pricing:'Confirm portfolio quote',freePlan:false,freePlanKnown:false,rankingEligible:true,
  scores:{price:5,ease:7,automation:8,integrations:8},editorialReview:{verificationStatus:'vendor_documented',
    sourceUrl:doc1,sourceUrls:[doc1,doc2],handsOnTested:false},
  evidence:[proof(doc1),proof(doc2)],decisionClaims:[claim('channel management',doc1),claim('reservation management',doc2)]};
}
const q='best software to manage an Airbnb business';
const env=tools=>({ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(path==='/data/tools.json')return Response.json(tools);
  if(path==='/data/intents.json')return Response.json(intents);
  return new Response('',{status:404});
}}});
async function api(tools){
 const r=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q='+encodeURIComponent(q)),env(tools));
 return {status:r.status,body:await r.json()};
}
async function mcp(tools){
 const body={jsonrpc:'2.0',id:911,method:'tools/call',params:{name:'decide_software',
   arguments:{job:q,limit:3},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28',
   'io.modelcontextprotocol/clientInfo':{name:'pms-readiness-test',version:'1'}}}};
 const r=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{method:'POST',
   headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28',
     'Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)}),env(tools),{waitUntil(){}});
 assert.equal(r.status,200);return (await r.json()).result;
}
test('Current 127-product catalog still returns truthful PMS gap guidance',()=>{
 assert.deepEqual(verifiedPmsCandidates(catalog),[]);
 const guidance=businessWorkflowGuidance(q,{},catalog);
 assert.equal(guidance.industry,'short_term_rentals');
 assert.match(guidance.explanation,/does not currently have/);
});
test('Manufacturer evidence needs two distinct first-party docs and two scoped capabilities',()=>{
 const good=sample();
 assert.equal(verifiedPmsCandidates([good]).length,1);
 assert.equal(businessWorkflowGuidance(q,{},[good]),null);
 assert.equal(verifiedPmsCandidates([{...good,evidence:[proof(doc1)]}]).length,0);
 assert.equal(verifiedPmsCandidates([{...good,decisionClaims:[claim('channel management',doc1)]}]).length,0);
 assert.equal(verifiedPmsCandidates([{...good,decisionClaims:[claim('channel management',doc1),claim('reservation management','https://third-party.test/claims')]}]).length,0);
 assert.equal(verifiedPmsCandidates([{...good,editorialReview:{...good.editorialReview,verificationStatus:'catalog_only'}}]).length,0);
 assert.equal(verifiedPmsCandidates([{...good,categoryReviewRequired:true}]).length,0);
});
test('Finder switches to qualified PMS category once actual reviewed products exist',async()=>{
 const good=sample(),unverified={...sample(),slug:'bad-pms',name:'Unsupported PMS',decisionClaims:[]};
 const {status,body}=await api([...catalog,good,unverified]);
 assert.equal(status,200);
 assert.notEqual(body.recommendation_type,'workflow_guidance');
 assert.equal(body.profile.goal,'vacation-rental');
 assert.deepEqual(body.recommendations.map(x=>x.slug),['sample-pms']);
 assert.ok(body.recommendations[0].match>66);
 assert.doesNotMatch(JSON.stringify(body),/sample-pms\.test/);
});
test('Finder still provides workflow guidance for a product with only marketing claims',async()=>{
 const {status,body}=await api([...catalog,{...sample(),evidence:[proof(doc1)]}]);
 assert.equal(status,200);
 assert.equal(body.recommendation_type,'workflow_guidance');
});
test('AI decision tool recommends verified PMS and does not confuse it with CRMs',async()=>{
 const good=sample(),unverified={...sample(),slug:'bad-pms',name:'Unsupported PMS',decisionClaims:[]};
 const out=await mcp([...catalog,good,unverified]);
 assert.equal(out.isError,false);
 assert.deepEqual(out.structuredContent.shortlist.map(x=>x.slug),['sample-pms']);
 assert.doesNotMatch(JSON.stringify(out),/sample-pms\.test/);
});
test('AI decision tool retains no-PMS guidance without catalog evidence',async()=>{
 const out=await mcp(catalog);
 assert.equal(out.structuredContent.decision_status,'needs_workflow_selection');
 assert.deepEqual(out.structuredContent.shortlist,[]);
});

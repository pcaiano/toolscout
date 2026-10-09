import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {businessWorkflowGuidance,interpretBusinessIndustry} from '../business-workflow-intent.js';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const intents=JSON.parse(fs.readFileSync(new URL('../data/intents.json',import.meta.url),'utf8'));
function env(){return {ASSETS:{async fetch(request){
  const pathname=new URL(request.url).pathname;
  if(pathname==='/data/tools.json')return Response.json(catalog);
  if(pathname==='/data/intents.json')return Response.json(intents);
  return new Response('not found',{status:404});
}}}}
async function finder(q){
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q='+encodeURIComponent(q)),env());
  return {status:response.status,data:await response.json()};
}
async function ai(q){
  const body={jsonrpc:'2.0',id:747,method:'tools/call',params:{name:'decide_software',arguments:{job:q,limit:3},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'universal-intent-benchmark',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)}),env(),{waitUntil(){}});
  assert.equal(response.status,200);
  return (await response.json()).result;
}
const sectors=[
  ['best software to manage my restaurant','restaurants',['business','crm','marketing','automation']],
  ['best software to manage an architecture studio','architecture',['business','crm','forms','automation']],
  ['best software for a marketing agency','marketing_agencies',['business','social','seo','analytics']],
  ['melhor software para gerir uma empresa de arquitetura','architecture',['business','crm','forms','automation']],
  ['software para gerir um restaurante','restaurants',['business','crm','marketing','automation']],
  ['which software should I use for a law firm','legal',['business','crm','forms','automation']],
  ['best software to run a dental clinic','healthcare',['business','crm','forms','automation']],
  ['best software for a construction company','construction',['business','crm','forms','automation']],
  ['best tools to run an accounting firm','accounting',['business','crm','forms','automation']],
  ['best software for my real estate agency','real_estate',['crm','business','forms','marketing']],
  ['best software for an ecommerce business','ecommerce',['ecommerce','marketing','analytics','support']],
  ['best software for a retail shop','retail',['ecommerce','crm','marketing','automation']],
  ['best software to run my logistics business','logistics',['business','crm','analytics','automation']],
  ['best software to manage my manufacturing company','manufacturing',['business','analytics','automation','crm']],
  ['best software to manage my gym','fitness',['crm','marketing','forms','business']],
  ['best software to run my beauty salon','beauty',['crm','forms','marketing','business']],
  ['best software to manage my hotel','hospitality',['crm','business','marketing','forms']],
  ['best software for a travel agency','travel',['crm','business','marketing','forms']],
  ['best software to run a nonprofit organisation','nonprofits',['crm','marketing','forms','business']],
  ['best software to run my consultancy','consulting',['business','crm','forms','automation']],
  ['best software for a software company','technology',['business','developer','analytics','support']],
  ['best software to run a school','education',['business','forms','marketing','automation']],
  ['best software for an events business','events',['business','crm','forms','marketing']],
  ['best software for my farming business','agriculture',['business','analytics','crm','automation']]
];
test('universal business software intent covers diverse sectors without making cross-category fake rankings',async()=>{
 for(const [query,id,categories]of sectors){
  const {status,data}=await finder(query);
  assert.equal(status,200,query);
  assert.equal(data.recommendation_type,'workflow_guidance',query);
  assert.equal(data.guidance.industry,id,query);
  assert.equal(data.guidance.decision_scope,'industry_workflows_not_product_winners',query);
  assert.deepEqual(data.guidance.workflows.map(w=>w.category),categories,query);
  assert.equal(data.recommendations.length,0,query);
  assert.equal(data.guidance.catalog_coverage.total_workflows,4,query);
  assert.ok(data.guidance.workflows.every(w=>w.catalog_coverage>=0&&w.finder_url.startsWith('https://trytoolscout.org/?q=')),query);
  assert.ok(data.guidance.specialist_requirements.length>=1,query);
  assert.doesNotMatch(JSON.stringify(data),/knowledge\.hubspot\.com|help\.zapier\.com|sourceUrl/);
 }
});
test('generic unknown businesses degrade gracefully to cross-sector job discovery',async()=>{
 for(const q of ['best software for my dog grooming business','best software to run a bakery company','melhor software para gerir a minha empresa']){
  const {status,data}=await finder(q);
  assert.equal(status,200,q);
  assert.equal(data.recommendation_type,'workflow_guidance',q);
  assert.equal(data.guidance.industry,'other_business',q);
  assert.equal(data.guidance.workflows.length,4);
 }
});
test('software jobs explicitly stated by industry buyers remain product searches',async()=>{
 const cases=[
  ['CRM for my architecture studio','crm'],
  ['SEO keyword research software for a restaurant','seo'],
  ['email marketing for my dental clinic','marketing'],
  ['project management software for a marketing agency','business']
 ];
 for(const [q,category]of cases){
  const {status,data}=await finder(q);
  assert.equal(status,200,q);
  assert.notEqual(data.recommendation_type,'workflow_guidance',q);
  assert.ok(data.recommendations.length>0,q);
  assert.ok(data.recommendations.every(x=>x.category===category),q);
 }
});
test('noisy queries remain fail-closed, unrelated tools do not acquire industry-specific proof',async()=>{
 for(const q of ['coiso','random blue banana']){
  const {status,data}=await finder(q);
  assert.equal(status,422,q);
  assert.equal(data.error,'recommendation_unresolved');
 }
 const g=businessWorkflowGuidance('best software to run my restaurant',{},catalog);
 assert.ok(g.specialist_requirements.some(x=>/POS/.test(x)));
 assert.ok(g.workflows.every(x=>/not documented suitability for this specific industry/i.test(x.evidence_scope)));
});
test('AI decision tool returns identical sector/context workflows and first-party links',async()=>{
 for(const q of ['best software for my restaurant','best software to run my architecture studio','best software for a marketing agency','best software for my dog grooming business']){
  const result=await ai(q);
  assert.equal(result.isError,false,q);
  assert.equal(result.structuredContent.decision_status,'needs_workflow_selection');
  const g=result.structuredContent.workflow_guidance;
  assert.equal(g.industry,interpretBusinessIndustry(q).id,q);
  assert.equal(g.workflows.length,4);
  assert.ok(g.workflows.every(w=>w.finder_url.includes('source=ai-agent')),q);
  assert.deepEqual(result.structuredContent.shortlist,[]);
  assert.equal(result.structuredContent.decision_basis.no_pay_to_rank,true);
 }
});
test('AI workflow links are actionable on homepage and yield task-specific category comparison',()=>{
 const homepage=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const protocol=fs.readFileSync(new URL('../agent-protocol-core-worker.js',import.meta.url),'utf8');
 const embed=fs.readFileSync(new URL('../embed/toolscout-finder.js',import.meta.url),'utf8');
 assert.match(homepage,/new URLSearchParams\(location\.search\)\.get\('q'\)/);
 assert.match(homepage,/runRecommendation\(inbound\.trim\(\)\)/);
 assert.match(homepage,/Specialist systems to assess separately/);
 assert.match(protocol,/recommendationText\(data\)/);
 assert.match(protocol,/workflow_guidance/);
 assert.match(embed,/workflow_guidance/);
});
test('documented vacation rental exception preserves no-PMS evidence boundary',()=>{
 const r=businessWorkflowGuidance('best software for my Airbnb business',{},catalog);
 assert.equal(r.industry,'short_term_rentals');
 assert.match(r.explanation,/not currently have a manufacturer-verified/i);
 assert.deepEqual(r.workflows.map(w=>w.category),['crm','business','automation','forms']);
});

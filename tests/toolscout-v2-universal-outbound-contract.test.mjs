import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalogFallbackRedirect} from '../affiliate-workflow-worker.js';
import {enforceExternalProductDestination} from '../affiliate-redirect-runtime.js';
import {candidatePage} from '../catalog-autonomy-worker.js';
import {transformPublicOutboundPolicyResponse} from '../public-redesign-runtime.js';

const load=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const staticTools=load('data/tools.json');
const wave4=load('data/catalog-wave4-decision-ready.json');
const wave5=load('data/catalog-wave5-decision-ready.json');
const affiliate=load('data/affiliate.json');
const published=['bqe-core','ezyvet','fresha','guesty','hostaway','lodgify','square-for-restaurants'];
const dynamic=[...wave4,...wave5].filter(t=>published.includes(t.slug));

function fixture({tools=staticTools,candidate=null,registry={}}={}){
 const batches=[];
 const env={
  ASSETS:{fetch:async request=>new Response(JSON.stringify(
   String(request.url).includes('/data/affiliate.json')?registry:
   String(request.url).includes('/data/tools.json')?tools:[]
  ),{status:200,headers:{'Content-Type':'application/json'}})},
  DB:{prepare(sql){
    return{bind(){
      return{first:async()=>sql.includes('catalog_runtime_candidates')&&candidate?{
        status:'published',source_status:'ok',profile_json:JSON.stringify(candidate)
      }:null};
    }};
  },batch:async statements=>{batches.push(statements);return[]}}
 };
 return {env,batches};
}
const healthyProbe=slug=>new Request('https://trytoolscout.org/go/'+slug,{
 headers:{'X-ToolScout-Health-Check':'affiliate-route','User-Agent':'ToolScout-Outbound-Probe/1.0'}
});
function assertExternal(response,slug){
 assert.equal(response?.status,302,slug+' not a redirect to its manufacturer');
 const target=new URL(response.headers.get('Location'));
 assert.equal(target.protocol,'https:',slug+' redirect must be secure');
 assert.notEqual(target.hostname,'trytoolscout.org',slug+' loops inside ToolScout');
 assert.doesNotMatch(target.pathname,/^\/(?:tools|go)(?:\/|$)/i,'No back to Tools');
}
test('every one of the 127 indexed catalog entries has a working external manufacturer fallback',async()=>{
 assert.equal(staticTools.length,127);
 for(const tool of staticTools){
  const {env,batches}=fixture();
  const response=await catalogFallbackRedirect(healthyProbe(tool.slug),env,tool.slug);
  assertExternal(response,tool.slug);
  const official=new URL(String(tool.sourceUrl).replaceAll('&amp;','&'));
  assert.equal(new URL(response.headers.get('Location')).hostname,official.hostname,tool.slug+' uses manufacturer website');
  assert.equal(batches.length,0,'Automated health probes must not create real clicks');
 }
});
test('all seven first-party documented dynamic admissions have external manufacturer fallbacks',async()=>{
 assert.equal(dynamic.length,7);
 for(const tool of dynamic){
  const {env,batches}=fixture({tools:[],candidate:tool});
  const response=await catalogFallbackRedirect(healthyProbe(tool.slug),env,tool.slug);
  assertExternal(response,tool.slug);
  assert.equal(new URL(response.headers.get('Location')).hostname,new URL(tool.sourceUrl).hostname);
  assert.equal(batches.length,0);
  const html=candidatePage(tool,{monetized:false});
  assert.match(html,new RegExp('href="/go/'+tool.slug+'"'));
  assert.match(html,/data-commercial-status="non-affiliate"/);
  const publicHtml=await transformPublicOutboundPolicyResponse(
    new Request('https://trytoolscout.org/tools/'+tool.slug),
    new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
  assert.match(await publicHtml.text(),new RegExp('href="/go/'+tool.slug+'"'));
 }
});
test('approved affiliate destination wins; sponsored label appears only for verified affiliate route',async()=>{
 const slug='systeme-io';
 const entry=affiliate[slug];
 assert.equal(entry.enabled,true);
 const {env,batches}=fixture({registry:{[slug]:entry}});
 const response=await catalogFallbackRedirect(healthyProbe(slug),env,slug);
 assertExternal(response,slug);
 assert.equal(response.headers.get('Location'),entry.url);
 assert.equal(batches.length,0);
});
test('unknown slugs cannot become counterfeit manufacturer links or internal Tools loops',async()=>{
 const {env}=fixture();
 assert.equal(await catalogFallbackRedirect(healthyProbe('fictional-not-in-catalog'),env,'fictional-not-in-catalog'),null);
 const page=fs.readFileSync(new URL('../tools.html',import.meta.url),'utf8');
 assert.doesNotMatch(page,/loadJson\('\/data\/pending-affiliate-tools\.json'/);
 assert.match(page,/loadJson\('\/data\/tools\.json'/);
 assert.match(page,/data-commercial-status=/);
 const worker=fs.readFileSync(new URL('../affiliate-workflow-worker.js',import.meta.url),'utf8');
 assert.match(worker,/Product destination unavailable/);
 assert.match(worker,/url\.pathname!=='\/go\/embed'/);
});
test('official documentation root belongs to the manufacturer, but external review sites never become verified AI evidence',()=>{
 const n8n=staticTools.find(t=>t.slug==='n8n');
 assert.ok(n8n.aiIntegration.sources.includes('https://docs.n8n.io/'));
 assert.match(candidatePage(n8n),/AI compatibility:<\/strong> Manufacturer-confirmed, verified 2026-10-05/);
 const external={...n8n,aiIntegration:{...n8n.aiIntegration,sources:['https://reviewer.example.com/']}};
 assert.doesNotMatch(candidatePage(external),/Manufacturer-confirmed/);
});

test('DECLARED production /go owner repairs every static and published D1 redirect that points back to Tools',async()=>{
 const tools=[...staticTools,...dynamic];
 assert.equal(tools.length,134);
 for(const tool of tools){
  const {env,batches}=fixture({tools:staticTools,candidate:staticTools.some(t=>t.slug===tool.slug)?null:tool});
  const req=healthyProbe(tool.slug),url=new URL(req.url);
  const legacy=Response.redirect('https://trytoolscout.org/tools.html',302);
  const corrected=await enforceExternalProductDestination(req,env,url,legacy);
  assertExternal(corrected,tool.slug);
  assert.equal(batches.length,0);
 }
 const unknown=healthyProbe('unlisted-nonexistent-program');
 const fail=await enforceExternalProductDestination(unknown,fixture().env,new URL(unknown.url),
   Response.redirect('https://trytoolscout.org/tools',302));
 assert.equal(fail.status,404,'unknown product must not route to internal Tools');
 const affiliateReq=healthyProbe('systeme-io');
 const approved=Response.redirect('https://partner.example.com/legitimate?ref=123',302);
 const passthrough=await enforceExternalProductDestination(affiliateReq,fixture().env,new URL(affiliateReq.url),approved);
 assert.equal(passthrough,approved,'valid external affiliate redirect must remain untouched');
 const embed=healthyProbe('embed'),embedResponse=new Response('widget',{status:200});
 assert.equal(await enforceExternalProductDestination(embed,fixture().env,new URL(embed.url),embedResponse),embedResponse);
});

test('live /go readiness uses a release marker absent from earlier deployments',()=>{
 const owner=fs.readFileSync(new URL('../affiliate-redirect-runtime.js',import.meta.url),'utf8');
 const probe=fs.readFileSync(new URL('../scripts/probe-live-catalog-outbound.mjs',import.meta.url),'utf8');
 assert.match(owner,/X-ToolScout-Outbound-Release','live-external-only-v2-20261010/);
 assert.match(probe,/probe\.headers\.get\('X-ToolScout-Outbound-Release'\)==='live-external-only-v2-20261010'/);
 assert.match(probe,/for\(let i=1;i<=30;i\+\+\)/);
});

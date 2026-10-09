import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));

async function run(name,args,tools=catalog){
  const env={ASSETS:{fetch:async req=>new URL(req.url).pathname==='/data/tools.json'?Response.json(tools):new Response('',{status:404})}};
  const request=new Request('https://trytoolscout.org/mcp',{
    method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},
    body:JSON.stringify({jsonrpc:'2.0',id:99,method:'tools/call',params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'decision-coverage',version:'1.0'}}}})
  });
  const response=await handleAgentProtocolRoute(request,env,{waitUntil(){}});
  assert.equal(response.status,200);
  return (await response.json()).result;
}

test('all 127 current profiles have at least one dated decision-specific first-party claim',()=>{
  assert.equal(catalog.length,127);
  const unclaimed=catalog.filter(t=>!Array.isArray(t.decisionClaims)||!t.decisionClaims.length);
  assert.deepEqual(unclaimed.map(t=>t.slug),[]);
  let count=0,withCapacity=0;
  for(const t of catalog){
    const vendor=new URL(t.sourceUrl).hostname.replace(/^www\./,'');
    const reviewed=new Set([t.editorialReview?.sourceUrl,...(t.editorialReview?.sourceUrls||[]),t.pricingDetails?.sourceUrl].filter(Boolean));
    for(const claim of t.decisionClaims){
      assert.equal(claim.status,'verified',t.slug);
      assert.ok(['capability','integration','plan_limit','price_eur_month','price_quote'].includes(claim.type),t.slug);
      assert.ok(claim.value&&claim.sourceUrl&&/^\d{4}-\d{2}-\d{2}$/.test(claim.verifiedAt),t.slug);
      const host=new URL(claim.sourceUrl).hostname.replace(/^www\./,'');
      assert.ok(host===vendor||host.endsWith('.'+vendor)||reviewed.has(claim.sourceUrl),t.slug+' claim has no recorded manufacturer provenance');
      if(claim.type==='plan_limit'){
        withCapacity++;
        assert.ok(claim.plan&&claim.unit&&Number.isFinite(claim.quantity)&&claim.quantity>0,t.slug);
        assert.ok((t.pricingDetails?.limits||[]).length>0,t.slug+' plan limit not grounded in reviewed pricing limits');
      }
      count++;
    }
  }
  assert.ok(count>=140,'expected materially expanded claim coverage');
  assert.ok(withCapacity>=15,'expected sourced plan-capacity coverage');
});

test('strict buyer requirements match curated manufacturer claims without publishing documentary source URLs',async()=>{
 const result=await run('decide_software',{job:'seo',must_have:['position tracking'],limit:5});
 assert.equal(result.isError,false);
 const semrush=result.structuredContent.shortlist.find(x=>x.slug==='semrush');
 assert.ok(semrush);
 assert.equal(semrush.requirement_evidence[0].status,'verified');
 assert.ok(!JSON.stringify(result.structuredContent).includes('www.semrush.com/kb'));
});

test('unverified Free-tier capability does not qualify even when product has a verified Free plan',async()=>{
 const paid=await run('decide_software',{job:'marketing',must_have:['automation'],budget:'free',limit:5});
 if(!paid.isError)for(const t of paid.structuredContent.shortlist){
   assert.ok(t.requirement_evidence.every(x=>x.plan==='Free'),t.slug+' must not be qualified from a generic capability claim');
 }
 const beehiiv=await run('compare_for_use_case',{
   tools:['beehiiv','mailchimp'],use_case:'marketing',must_have:['automation'],budget:'free'
 });
 assert.equal(beehiiv.isError,false);
 assert.equal(beehiiv.structuredContent.verdict.type,'no_qualified_winner');
});

test('free plan capacity proofs respect monthly caps and unknown tiers',async()=>{
 const yes=await run('decide_software',{job:'automation',budget:'free',constraints:['at least 100 tasks per month'],limit:5});
 assert.equal(yes.isError,false);
 const zapier=yes.structuredContent.shortlist.find(x=>x.slug==='zapier');
 assert.ok(zapier);
 assert.equal(zapier.constraint_evidence[0].status,'verified');
 assert.equal(zapier.constraint_evidence[0].plan,'Free');
 const no=await run('decide_software',{job:'automation',budget:'free',constraints:['at least 101 tasks per month'],limit:5});
 assert.equal(no.isError,true);
 assert.equal(no.structuredContent.decision_status,'no_qualified_candidate');
});

test('named integration constraints do not use generic score; free-plan entitlement is not presumed',async()=>{
 const integration=await run('decide_software',{job:'crm',constraints:['must integrate with Gmail'],limit:5});
 assert.equal(integration.isError,false);
 const hubspot=integration.structuredContent.shortlist.find(x=>x.slug==='hubspot');
 assert.ok(hubspot);
 assert.equal(hubspot.constraint_evidence[0].status,'verified');
 const free=await run('decide_software',{job:'crm',constraints:['must integrate with Gmail'],budget:'free',limit:5});
 assert.equal(free.isError,true);
 assert.equal(free.structuredContent.decision_status,'no_qualified_candidate');
});

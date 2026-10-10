import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const tools=[
  {slug:'crm-alpha',name:'CRM Alpha',category:'crm',description:'CRM',
    sourceUrl:'https://alpha.example',features:['crm'],bestFor:['sales teams'],
    scores:{ease:8,integrations:7,price:8}},
  {slug:'crm-beta',name:'CRM Beta',category:'crm',description:'CRM',
    sourceUrl:'https://beta.example',features:['crm'],bestFor:['sales teams'],
    scores:{ease:8,integrations:7,price:7}}
];
function envWithCatalog(){
  return {ASSETS:{async fetch(request){
    return new URL(request.url).pathname==='/data/tools.json'
      ?Response.json(tools):new Response('Not found',{status:404});
  }}};
}
async function a2a(data,env=envWithCatalog()){
  const request=new Request('https://trytoolscout.org/a2a',{
    method:'POST',headers:{'Content-Type':'application/json','A2A-Version':'1.0'},
    body:JSON.stringify({jsonrpc:'2.0',id:61,method:'SendMessage',
      params:{message:{role:'ROLE_USER',parts:[{text:'CRM',mediaType:'text/plain'},
        {data,mediaType:'application/json'}]}}})
  });
  const response=await handleAgentProtocolRoute(request,env,{waitUntil(){}});
  return {status:response.status,body:await response.json()};
}

test('A2A returns an actionable no-qualified decision instead of a 500',async()=>{
  const {status,body}=await a2a({must_have:['verified SSO'],limit:3});
  assert.equal(status,200);
  assert.equal(body.error,undefined);
  const parts=body.result.message.parts;
  assert.equal(parts[1].data.decision_status,'no_qualified_candidate');
  assert.deepEqual(parts[1].data.shortlist,[]);
  assert.match(parts[0].text,/no evidence-qualified recommendation/i);
  assert.match(parts[0].text,/may lack a relevant product/i);
  assert.doesNotMatch(parts[0].text,/because missing manufacturer evidence is not proof/i);
  assert.doesNotMatch(JSON.stringify(body),/DECISION_UNAVAILABLE/);
});

test('A2A does not convert a catalog outage into misleading buyer guidance',async()=>{
  const {status,body}=await a2a({must_have:['verified SSO']},
    {ASSETS:{async fetch(){throw Error('fixture outage')}}});
  assert.equal(status,500);
  assert.equal(body.error.data[0].reason,'DECISION_UNAVAILABLE');
});

test('A2A explains absent category coverage without alleging a missing manufacturer claim',async()=>{
  const {status,body}=await a2a({job:'marine sonar fleet management platform',limit:3});
  assert.equal(status,200);
  assert.equal(body.result.message.parts[1].data.decision_status,'no_qualified_candidate');
  const summary=body.result.message.parts[0].text;
  assert.match(summary,/catalog may lack a relevant product/i);
  assert.doesNotMatch(summary,/supplied mandatory requirements|No product is shortlisted because missing/i);
});

test('A2A does not misdiagnose verified free-plan conflicts as undocumented must-haves',async()=>{
  const paid=tools.map(t=>({...t,freePlan:false,freePlanKnown:true}));
  const env={ASSETS:{async fetch(req){
    return new URL(req.url).pathname==='/data/tools.json'
      ?Response.json(paid):new Response('',{status:404});
  }}};
  const {status,body}=await a2a({budget:'free',limit:3},env);
  assert.equal(status,200);
  assert.equal(body.result.message.parts[1].data.decision_status,'no_qualified_candidate');
  assert.match(body.result.message.parts[0].text,/documented product constraints may exclude candidates/i);
  assert.doesNotMatch(body.result.message.parts[0].text,/because missing manufacturer evidence is not proof/i);
});

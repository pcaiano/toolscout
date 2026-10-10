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
  assert.match(parts[0].text,/cannot verify a qualified software recommendation/i);
  assert.match(parts[0].text,/manufacturer evidence/i);
  assert.doesNotMatch(JSON.stringify(body),/DECISION_UNAVAILABLE/);
});

test('A2A does not convert a catalog outage into misleading buyer guidance',async()=>{
  const {status,body}=await a2a({must_have:['verified SSO']},
    {ASSETS:{async fetch(){throw Error('fixture outage')}}});
  assert.equal(status,500);
  assert.equal(body.error.data[0].reason,'DECISION_UNAVAILABLE');
});

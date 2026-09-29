import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAnalyticsChairmanRoute} from '../analytics-chairman-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';
import fs from 'node:fs';

async function sessionCookie(secret){
  const bucket=Math.floor(Date.now()/(86400*1000));
  const value=`toolscout-command-center:${secret}:${bucket}`;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `toolscout_cc=${hex}`;
}

function fakeEnv(){
  let writes=0;
  const db={
    prepare(sql){
      const text=String(sql);
      return {
        bind(){return this},
        async all(){
          if(text.includes('FROM affiliate_workflow w'))return {results:[
            {tool_slug:'apollo',status:'ready_to_apply',program_name:'Apollo',application_url:'https://partner.example/apollo',program_url:null,blocker:null,notes:null,pack_json:'{"company":"ToolScout"}',pack_status:'prepared',prepared_at:'2026-09-29 12:00:00'},
            {tool_slug:'airtable',status:'ready_to_apply',program_name:'Airtable',application_url:'https://partner.example/airtable',program_url:null,blocker:null,notes:null,pack_json:'{}',pack_status:'prepared',prepared_at:'2026-09-29 12:00:00'}
          ]};
          if(text.includes("FROM affiliate_workflow WHERE status IN ('watchlist'"))return {results:[{tool_slug:'airtable'}]};
          if(text.includes('FROM affiliate_program_discovery'))return {results:[
            {tool_slug:'apollo',status:'ready_to_apply',application_url:'https://partner.example/apollo',automation_mode:'human',confidence:95,evidence_json:'official_publisher_affiliate_program'}
          ]};
          if(text.includes("FROM affiliate_workflow WHERE status='approved_needs_link'"))return {results:[]};
          return {results:[]};
        },
        async first(){return null},
        async run(){writes++;throw new Error('chairman_read_attempted_write')}
      };
    }
  };
  return {env:{DB:db,ADMIN_TOKEN:'secret'},get writes(){return writes}};
}

test('Chairman Queue has a direct Phase 3 owner',()=>{
  assert.equal(routeOwner('/analytics/api/chairman-queue',{method:'GET'}).owner,'analytics_chairman');
  assert.equal(routeOwner('/analytics/api/stats',{method:'GET'}).owner,'analytics_stats');
});

test('Chairman Queue direct route preserves session protection',async()=>{
  const state=fakeEnv();
  const response=await handleAnalyticsChairmanRoute(
    new Request('https://trytoolscout.org/analytics/api/chairman-queue'),
    state.env,
    {}
  );
  assert.equal(response.status,401);
  assert.equal(state.writes,0);
});

test('Chairman Queue direct route is read-only and preserves affiliate quality filter',async()=>{
  const state=fakeEnv();
  const cookie=await sessionCookie('secret');
  const response=await handleAnalyticsChairmanRoute(
    new Request('https://trytoolscout.org/analytics/api/chairman-queue',{headers:{Cookie:cookie}}),
    state.env,
    {}
  );
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Read-Mode'),'read-only');
  const body=await response.json();
  assert.equal(body.status,'connected');
  assert.equal(body.total,1);
  assert.equal(body.items[0].id,'apollo');
  assert.equal(body.items[0].source_of_truth,'affiliate_workflow+affiliate_application_packs');
  assert.equal(state.writes,0);
});

test('Chairman Queue owner ignores unrelated analytics routes',async()=>{
  const state=fakeEnv();
  const response=await handleAnalyticsChairmanRoute(
    new Request('https://trytoolscout.org/analytics/api/stats'),
    state.env,
    {}
  );
  assert.equal(response,null);
  assert.equal(state.writes,0);
});


test('resilient analytics no longer creates schema during GET reads',()=>{
  const src=fs.readFileSync(new URL('../command-center-resilient-worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(src,/strict_human_analytics_schema_not_migrated/);
});

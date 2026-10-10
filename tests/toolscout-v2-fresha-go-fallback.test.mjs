import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalogFallbackRedirect} from '../affiliate-workflow-worker.js';

const fresha=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave4-decision-ready.json',import.meta.url),'utf8')).find(x=>x.slug==='fresha');

function envWithProfile(profile,{affiliate={}}={}){
  const sqlCalls=[],batches=[];
  return{
    sqlCalls,batches,
    ASSETS:{fetch:async request=>new Response(JSON.stringify(String(request.url).includes('/data/affiliate.json')?affiliate:[]),
      {status:200,headers:{'Content-Type':'application/json'}})},
    DB:{
      prepare(sql){
        return{bind(...args){
          sqlCalls.push({sql,args});
          return{first:async()=>{
            if(sql.includes('FROM affiliate_workflow'))return null;
            if(sql.includes('FROM catalog_runtime_candidates'))return profile?{
              profile_json:JSON.stringify(profile),status:'published',source_status:'ok'
            }:null;
            return null;
          }};
        }};
      },
      batch:async statements=>{batches.push(statements);return statements.map(()=>({success:true}))}
    }
  };
}

test('Fresha /go fallback reaches actual manufacturer and is recorded as non-affiliate',async()=>{
  const env=envWithProfile(fresha);
  const request=new Request('https://trytoolscout.org/go/fresha',{
    headers:{Referer:'https://trytoolscout.org/tools/fresha','User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0'}
  });
  const response=await catalogFallbackRedirect(request,env,'fresha');
  assert.equal(response?.status,302);
  assert.equal(response.headers.get('Location'),'https://www.fresha.com/');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.ok(env.sqlCalls.some(x=>x.sql.includes('catalog_runtime_candidates')));
});

test('unverified Fresha and other dynamic tools cannot use the explicit exception',async()=>{
  const invalid=envWithProfile({...fresha,sourceUrl:'https://fresha.com.evil.example'});
  const req=new Request('https://trytoolscout.org/go/fresha');
  assert.equal(await catalogFallbackRedirect(req,invalid,'fresha'),null);
  const noProof=envWithProfile({...fresha,decisionClaims:[]});
  assert.equal(await catalogFallbackRedirect(req,noProof,'fresha'),null);
  const other=envWithProfile({...fresha,slug:'other'});
  assert.equal(await catalogFallbackRedirect(new Request('https://trytoolscout.org/go/other'),other,'other'),null);
  const monetized=envWithProfile(fresha,{affiliate:{fresha:{enabled:true,url:'https://affiliate.example.com/approved'}}});
  assert.equal(await catalogFallbackRedirect(req,monetized,'fresha'),null,'approved commercial routes remain primary');
});

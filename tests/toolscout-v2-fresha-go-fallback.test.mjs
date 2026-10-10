import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalogFallbackRedirect} from '../affiliate-workflow-worker.js';
import {candidatePage} from '../catalog-autonomy-worker.js';
import {transformPublicOutboundPolicyResponse} from '../public-redesign-runtime.js';

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

test('unverified manufacturer evidence is held, other documented tools also reach their manufacturer',async()=>{
  const invalid=envWithProfile({...fresha,sourceUrl:'https://fresha.com.evil.example'});
  const req=new Request('https://trytoolscout.org/go/fresha');
  assert.equal(await catalogFallbackRedirect(req,invalid,'fresha'),null);
  const noProof=envWithProfile({...fresha,decisionClaims:[]});
  assert.equal(await catalogFallbackRedirect(req,noProof,'fresha'),null);
  const ezyvet=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave5-decision-ready.json',import.meta.url),'utf8')).find(t=>t.slug==='ezyvet');
  const other=envWithProfile(ezyvet);
  const otherResponse=await catalogFallbackRedirect(new Request('https://trytoolscout.org/go/ezyvet'),other,'ezyvet');
  assert.equal(otherResponse?.status,302);
  assert.equal(otherResponse.headers.get('Location'),'https://www.ezyvet.com/');
  const monetized=envWithProfile(fresha,{affiliate:{fresha:{enabled:true,url:'https://affiliate.example.com/approved'}}});
  const affiliateResponse=await catalogFallbackRedirect(req,monetized,'fresha');
  assert.equal(affiliateResponse?.status,302);
  assert.equal(affiliateResponse.headers.get('Location'),'https://affiliate.example.com/approved');
  const fromThirdParty=envWithProfile({...fresha,sourceUrl:'https://competitor.example.com/'});
  assert.equal(await catalogFallbackRedirect(req,fromThirdParty,'fresha'),null);
});

test('canonical public outbound policy retains the tracked Fresha CTA and never exposes documentary sources',async()=>{
  const request=new Request('https://trytoolscout.org/tools/fresha');
  const before=candidatePage(fresha,{monetized:false});
  const response=await transformPublicOutboundPolicyResponse(request,new Response(before,{
    headers:{'Content-Type':'text/html; charset=UTF-8'}
  }));
  const html=await response.text();
  assert.match(html,/href="\/go\/fresha"/);
  assert.match(html,/data-commercial-status="non-affiliate"/);
  assert.doesNotMatch(html,/href="https:\/\/www\.fresha\.com\/for-business/);
  assert.doesNotMatch(html,/href="https:\/\/www\.fresha\.com\/" target=/);
});

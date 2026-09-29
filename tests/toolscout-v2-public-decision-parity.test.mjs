import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPublicDecisionCandidate,publicDecisionRoute} from '../public-decision-runtime.js';
import {comparePublicParity,publicPageFingerprint} from '../public-page-parity-contract.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function contentType(file){
  if(file.endsWith('.json'))return'application/json; charset=UTF-8';
  if(file.endsWith('.xml'))return'application/xml; charset=UTF-8';
  if(file.endsWith('.html'))return'text/html; charset=UTF-8';
  return'text/plain; charset=UTF-8';
}
function assetPath(pathname){
  const clean=decodeURIComponent(String(pathname||'/')).replace(/^\//,'');
  const candidates=[];
  if(!clean)candidates.push('index.html');
  else{
    candidates.push(clean);
    if(!path.extname(clean))candidates.push(clean+'.html');
  }
  for(const rel of candidates){
    const full=path.join(ROOT,rel);
    if(full.startsWith(ROOT)&&fs.existsSync(full)&&fs.statSync(full).isFile())return full;
  }
  return null;
}
function env(){
  return{
    DB:{
      prepare(sql){
        let bindings=[];
        return{
          bind(...args){bindings=args;return this},
          async first(){
            if(String(sql).includes('sqlite_master'))return{n:bindings.length};
            return null;
          },
          async all(){return{results:[]}},
          async run(){throw new Error('public_parity_candidate_attempted_write')}
        };
      },
      async batch(){throw new Error('public_parity_candidate_attempted_batch_write')}
    },
    ASSETS:{
      async fetch(request){
        const u=new URL(request.url);
        const file=assetPath(u.pathname);
        if(!file)return new Response('not found',{status:404});
        return new Response(fs.readFileSync(file),{status:200,headers:{'Content-Type':contentType(file),'Cache-Control':'public, max-age=300'}});
      }
    }
  };
}

const cases=[
  {pathname:'/best-seo-tools-for-agencies',file:'best-seo-tools-for-agencies.html'},
  {pathname:'/best-social-media-management-tools',file:'best-social-media-management-tools.html'},
  {pathname:'/best-project-management-tools',file:'best-project-management-tools.html'},
  {pathname:'/tools/airtable',file:'tools/airtable.html'},
  {pathname:'/tools/semrush',file:'tools/semrush.html'},
  {pathname:'/tools/klaviyo',file:'tools/klaviyo.html'},
  {pathname:'/tools/moz-pro',file:'tools/moz-pro.html'},
  {pathname:'/tools/tally',file:'tools/tally.html'}
];

test('verified decision owner serves only tool profiles and best guides',()=>{
  assert.equal(publicDecisionRoute('/tools/airtable')?.kind,'tool');
  assert.equal(publicDecisionRoute('/best-seo-tools-for-agencies')?.kind,'guide');
  assert.equal(publicDecisionRoute('/compare') ,null);
  assert.equal(publicDecisionRoute('/go/airtable'),null);
});

for(const row of cases){
  test(`verified public decision preserves ${row.pathname}`,async()=>{
    const before=fs.readFileSync(path.join(ROOT,row.file),'utf8');
    const response=await renderPublicDecisionCandidate(new Request('https://trytoolscout.org'+row.pathname),env());
    assert.ok(response instanceof Response);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('X-ToolScout-Public-Plane'),'decision-v1');
    assert.equal(response.headers.get('X-ToolScout-Public-Parity'),'verified-v1');
    const after=await response.text();
    const parity=comparePublicParity(before,after);
    assert.equal(parity.ok,true,JSON.stringify(parity.errors));
    assert.equal(parity.after.canonical,'https://trytoolscout.org'+row.pathname);
    assert.equal(parity.after.hasEditorialEvidence,true);
  });
}

test('verified renderer does not replace static guide with runtime ranking',async()=>{
  const response=await renderPublicDecisionCandidate(new Request('https://trytoolscout.org/best-seo-tools-for-agencies'),env());
  const html=await response.text();
  assert.match(html,/Official source/i);
  assert.doesNotMatch(html,/New catalog tools compete under the same eligibility/i);
});

test('verified tool renderer preserves monetized outbound route and editorial evidence',async()=>{
  const response=await renderPublicDecisionCandidate(new Request('https://trytoolscout.org/tools/airtable'),env());
  const html=await response.text();
  const fp=publicPageFingerprint(html);
  assert.ok(fp.monetizedLinks.includes('/go/airtable'));
  assert.equal(fp.hasEditorialEvidence,true);
  assert.equal(fp.hasAffiliateDisclosure,true);
});

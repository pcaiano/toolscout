import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPublicNavigationCandidate,publicNavigationHub} from '../public-navigation-runtime.js';
import {comparePublicParity} from '../public-page-parity-contract.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CASES=[
  ['/tools','tools.html'],
  ['/guides','guides.html'],
  ['/compare','compare.html'],
  ['/categories','categories.html'],
  ['/crm-tools','crm-tools.html'],
  ['/seo-tools','seo-tools.html']
];

function contentType(file){
  if(file.endsWith('.json'))return'application/json; charset=UTF-8';
  if(file.endsWith('.html'))return'text/html; charset=UTF-8';
  return'text/plain; charset=UTF-8';
}
function env(){
  return{
    DB:{
      prepare(sql){
        const text=String(sql);
        let bindings=[];
        return{
          bind(...args){bindings=args;return this},
          async first(){
            if(text.includes('sqlite_master')&&text.includes('seo_execution_contract'))return{n:1};
            if(text.includes('sqlite_master'))return{n:bindings.length};
            return null;
          },
          async all(){return{results:[]}},
          async run(){throw new Error('public_navigation_candidate_attempted_write')}
        };
      },
      async batch(){throw new Error('public_navigation_candidate_attempted_batch_write')}
    },
    ASSETS:{
      async fetch(request){
        const pathname=decodeURIComponent(new URL(request.url).pathname).replace(/^\//,'');
        const file=path.join(ROOT,pathname);
        if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('not found',{status:404});
        return new Response(fs.readFileSync(file),{status:200,headers:{'Content-Type':contentType(file),'Cache-Control':'public, max-age=300'}});
      }
    }
  };
}

test('navigation candidate recognizes only audited hubs',()=>{
  for(const [pathname] of CASES)assert.equal(publicNavigationHub(pathname),pathname);
  assert.equal(publicNavigationHub('/compare.html'),'/compare');
  assert.equal(publicNavigationHub('/tools/airtable'),null);
  assert.equal(publicNavigationHub('/blog/'),null);
  assert.equal(publicNavigationHub('/go/airtable'),null);
});

for(const [pathname,file] of CASES){
  test(`verified navigation preserves ${pathname}`,async()=>{
    const before=fs.readFileSync(path.join(ROOT,file),'utf8');
    const response=await renderPublicNavigationCandidate(new Request('https://trytoolscout.org'+pathname),env());
    assert.ok(response instanceof Response);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('X-ToolScout-Public-Plane'),'navigation-v1');
    assert.equal(response.headers.get('X-ToolScout-Public-Parity'),'verified-v1');
    const after=await response.text();
    const parity=comparePublicParity(before,after);
    assert.equal(parity.ok,true,JSON.stringify(parity.errors));
    assert.match(after,new RegExp('rel=["\\\']canonical["\\\'][^>]+href=["\\\']https://trytoolscout\\.org'+pathname.replace(/[.*+?^$()|[\]{}]/g,'\\$&')+'["\\\']','i'));
  });
}

test('compare hub preserves client-side decision behavior with query parameters',async()=>{
  const response=await renderPublicNavigationCandidate(
    new Request('https://trytoolscout.org/compare?a=airtable&b=semrush&source=phase12-test'),
    env()
  );
  const html=await response.text();
  assert.match(html,/URLSearchParams\(location\.search\)/);
  assert.match(html,/\/api\/events/);
  assert.match(html,/data\/tools\.json/);
  assert.match(html,/data\/tool-assets\.json/);
  assert.match(html,/\/go\//);
  assert.match(html,/history\.replaceState/);
});

test('tools hub preserves live catalog loading behavior',async()=>{
  const response=await renderPublicNavigationCandidate(new Request('https://trytoolscout.org/tools'),env());
  const html=await response.text();
  assert.match(html,/\/data\/tools\.json/);
  assert.match(html,/\/data\/pending-affiliate-tools\.json/);
  assert.match(html,/\/data\/tool-assets\.json/);
});

test('navigation candidate is read-only',async()=>{
  let writes=0;
  const e=env();
  const original=e.DB.prepare;
  e.DB.prepare=(sql)=>{
    const q=original.call(e.DB,sql);
    const originalRun=q.run;
    q.run=async()=>{writes++;return originalRun()};
    return q;
  };
  await renderPublicNavigationCandidate(new Request('https://trytoolscout.org/guides'),e);
  assert.equal(writes,0);
});

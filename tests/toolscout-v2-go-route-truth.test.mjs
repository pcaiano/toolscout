import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dynamic from '../dynamic-worker.js';

const tools=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const affiliates=JSON.parse(fs.readFileSync(new URL('../data/affiliate.json',import.meta.url),'utf8'));
const responseFor=path=>path==='/data/tools.json'?Response.json(tools):path==='/data/affiliate.json'?Response.json(affiliates):new Response('not found',{status:404});
function envFor(d1={}){
  return {
    ASSETS:{fetch:async req=>responseFor(new URL(req.url).pathname)},
    DB:{prepare(sql){
      return {
        bind(...args){this.args=args;return this},
        async first(){return sql.includes('affiliate_workflow WHERE tool_slug')?d1[this.args?.[0]]||null:null},
        async all(){return {results:[]}}
      };
    }}
  };
}
async function click(slug,env){
  return dynamic.fetch(
    new Request('https://trytoolscout.org/go/'+slug,{headers:{'X-ToolScout-Health-Check':'affiliate-route'}}),
    env,{waitUntil(){}}
  );
}

test('Buffer Visit link resolves to Buffer manufacturer instead of ToolScout Tools',async()=>{
  assert.equal(affiliates.buffer,undefined,'Buffer has no static affiliate route');
  const res=await click('buffer',envFor());
  assert.equal(res.status,302);
  assert.equal(new URL(res.headers.get('Location')).hostname,'buffer.com');
  assert.equal(res.headers.get('Cache-Control'),'no-store');
});

test('all catalog /go routes preserve a real destination, never a ToolScout index loop',async()=>{
  const env=envFor(),failed=[];
  for(const tool of tools){
    const res=await click(tool.slug,env);
    const loc=res.headers.get('Location');
    let valid=false;
    try{
      const destination=new URL(loc);
      valid=res.status===302&&/^https?:$/.test(destination.protocol)
        &&destination.hostname!=='trytoolscout.org';
    }catch{}
    if(!valid)failed.push({slug:tool.slug,status:res.status,location:loc});
  }
  assert.deepEqual(failed,[]);
  assert.equal(tools.length,127);
});

test('verified dynamic affiliate always outranks bundled affiliate and non-monetized public fallback',async()=>{
  const res=await click('buffer',envFor({buffer:{status:'active',affiliate_url:'https://partner.example/verified-buffer?ref=abc',network:'example'}}));
  assert.equal(res.status,302);
  assert.match(res.headers.get('Location'),/^https:\/\/partner\.example\/verified-buffer\?ref=abc/);
});

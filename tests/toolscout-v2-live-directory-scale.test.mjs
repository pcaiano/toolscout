import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicMergedTools,publicCatalogInventory} from '../catalog-autonomy-worker.js';

function catalogEnv(){
 const legacy={slug:'legacy',name:'Legacy',category:'crm',description:'Existing reviewed software',sourceUrl:'https://vendor.example/'};
 const ready={...legacy,slug:'runtime-ready',name:'Runtime Ready'};
 const held={...legacy,slug:'runtime-quality-hold',name:'Runtime Quality Hold'};
 const candidates=[
  {tool_slug:ready.slug,profile_json:JSON.stringify(ready),status:'published',source_status:'ok',verified_at:'2026-10-10'},
  {tool_slug:held.slug,profile_json:JSON.stringify(held),status:'quality_hold',source_status:'source_warning',verified_at:'2026-10-10'}
 ];
 return {DB:{prepare(sql){return{async all(){
   if(sql.includes('FROM catalog_runtime_state'))return{results:[]};
   if(sql.includes('FROM catalog_runtime_candidates'))return{results:candidates};
   if(sql.includes('FROM affiliate_workflow'))return{results:[]};
   throw Error('Unknown catalog query '+sql);
 }};}},ASSETS:{async fetch(request){
   const path=new URL(request.url).pathname;
   if(path==='/data/tools.json')return Response.json([legacy]);
   if(path==='/data/affiliate.json')return Response.json({});
   return new Response('not found',{status:404});
 }}};
}
test('canonical catalog excludes quality-held runtime records from directory, Finder and inventory',async()=>{
 const env=catalogEnv();
 const tools=await publicMergedTools(env);
 assert.deepEqual(tools.map(t=>t.slug),['legacy','runtime-ready']);
 const inventory=await publicCatalogInventory(env);
 assert.equal(inventory.total,2);
 assert.deepEqual(inventory.tools.map(t=>t.slug),['legacy','runtime-ready']);
 assert.equal(inventory.runtime_unique,1);
});
test('public Tools directory paginates live inventory and never shows unpublished candidate profiles',async()=>{
 const html=fs.readFileSync(new URL('../tools.html',import.meta.url),'utf8');
 const start=html.lastIndexOf('<script>'),end=html.indexOf('</script>',start);
 assert.ok(start>=0&&end>start);
 const js=html.slice(start+8,end);
 const entries=Array.from({length:122},(_,i)=>({
  slug:'tool-'+i,name:'Tool '+i,category:'automation',
  description:i===0?'<script>unsafe</script>':'Reviewed workflow software',
  sourceUrl:'https://vendor.example/',bestFor:['teams'],features:['workflows'],
  freePlanKnown:false,pricing:'Compare current plans'
 }));
 const admitted=entries.slice(0,120);
 const data={
  '/data/tools.json':entries,
  '/api/catalog-inventory':{ok:true,tools:admitted.map((x,i)=>({slug:x.slug,affiliate_active:i===0}))},
  '/data/affiliate.json':{},
  '/data/tool-assets.json':{assets:{}}
 };
 const elements=new Map(['grid','q','resultCount','catalogCount','catalogFilterState','loadMore'].map(id=>
  [id,{innerHTML:'',textContent:'',hidden:true,value:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn}}]));
 const context={document:{getElementById:id=>elements.get(id)},URL,fetch:async path=>({ok:true,json:async()=>data[path]})};
 vm.runInNewContext(js,context);
 await new Promise(resolve=>setTimeout(resolve,0));
 const grid=elements.get('grid'),button=elements.get('loadMore');
 assert.equal(elements.get('catalogCount').textContent,'120 tools in catalog');
 assert.equal((grid.innerHTML.match(/<article class="tool">/g)||[]).length,60);
 assert.equal(button.hidden,false);
 assert.ok(grid.innerHTML.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
 assert.ok(!grid.innerHTML.includes('<script>unsafe</script>'));
 assert.ok(grid.innerHTML.includes('data-commercial-status="affiliate"'));
 assert.ok(grid.innerHTML.includes('rel="noopener nofollow sponsored"'));
 assert.ok(!grid.innerHTML.includes('tool-120'));
 button.handlers.click();
 assert.equal((grid.innerHTML.match(/<article class="tool">/g)||[]).length,120);
 assert.equal(button.hidden,true);
 assert.ok(!grid.innerHTML.includes('/tools/tool-120'));
 const search=elements.get('q');
 search.value='Tool 119';search.handlers.input();
 assert.equal((grid.innerHTML.match(/<article class="tool">/g)||[]).length,1);
 assert.ok(grid.innerHTML.includes('/tools/tool-119'));
 assert.equal(elements.get('catalogFilterState').textContent,'1 match');
});

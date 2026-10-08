#!/usr/bin/env node
/* Materialize all configured guide and comparison decision analyses surgically.
   Existing canonical, structured data, navigation and /go/ paths are unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const root=process.cwd();
const ed=JSON.parse(fs.readFileSync(path.join(root,'data/organic-growth-engine.json'),'utf8')).editorialQuality;
const intents=JSON.parse(fs.readFileSync(path.join(root,'data/intents.json'),'utf8'));
const pairs=JSON.parse(fs.readFileSync(path.join(root,'data/comparisons.json'),'utf8'));
const bySlug=new Map(JSON.parse(fs.readFileSync(path.join(root,'data/tools.json'),'utf8')).map(x=>[x.slug,x]));
const holds=new Set((JSON.parse(fs.readFileSync(path.join(root,'reports/seo-publication-holds.json'),'utf8')).items||[]).map(x=>x.intent));
const esc=v=>String(v??'').replace(/[\u2014\u2013]/g,'-').replace(/\s+/g,' ').trim()
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const g=/(<h2>ToolScout analysis<\/h2><p>)[\s\S]*?(<\/p><\/section>)/;
const c=/(<h2>What this comparison means in practice<\/h2><p>)[\s\S]*?(<\/p><p class="decision"><strong>Decision:<\/strong> )[\s\S]*?(<\/p><h3>How this comparison works<\/h3>)/;
let changed=0;
const only=process.argv.includes('--write');
function materialize(slug,type,analysis,decision){
  const file=path.join(root,slug+'.html');
  if(!fs.existsSync(file))throw Error('Missing public HTML '+slug);
  const before=fs.readFileSync(file,'utf8');
  const canonical=before.match(/<link rel="canonical" href="[^"]+">/)?.[0];
  if(!canonical)throw Error('Missing canonical '+slug);
  const regex=type==='guide'?g:c;
  if(!regex.test(before))throw Error('Missing editorial section '+slug);
  let after=before.replace(regex,(_,a,b,d)=>type==='guide'?a+esc(analysis)+b:a+esc(analysis)+b+esc(decision)+d);
  if(type==='guide'){
    after=after.replace(/<article class="card">[\s\S]*?<\/article>/g,block=>{
      const slug=block.match(/href="\/go\/([a-z0-9-]+)"/)?.[1];
      const tool=bySlug.get(slug);
      if(!tool)throw Error('Unmapped guide card '+slug+' on '+path.basename(file));
      if(tool.categoryReviewRequired)throw Error('Category review candidate appears in published guide: '+slug+' on '+path.basename(file));
      if(tool.editorialReview?.verificationStatus!=='catalog_only')return block;
      return block
        .replace('first-party vendor source recorded and checked in the ToolScout catalog.','Catalog-based editorial assessment; vendor facts and plan limits not independently verified.')
        .replace(/ · Free plan/g,tool.freePlanKnown===true?' · Verified free plan':'')
        .replace(/ · Checked \d{4}-\d{2}-\d{2}/g,'');
    });
  }
  if(after.match(/<link rel="canonical" href="[^"]+">/)?.[0]!==canonical)throw Error('Canonical drift '+slug);
  if(after!==before){
    changed++;
    if(only)fs.writeFileSync(file,after,'utf8');
  }
}
for(const intent of intents){
  const analysis=ed.guideOverrides[intent.slug];if(!analysis||analysis.length<220)throw Error('Missing guide editorial '+intent.slug);
  if(holds.has(intent.slug)){
    if(fs.existsSync(path.join(root,intent.slug+'.html')))throw Error('Held guide must not be publicly indexed: '+intent.slug);
    continue;
  }
  materialize(intent.slug,'guide',analysis,null);
}
for(const [a,b] of pairs){
  const override=ed.comparisonOverrides[[a,b].sort().join('|')];
  if(!override?.analysis||!override?.decision)throw Error('Missing comparison '+a+'|'+b);
  materialize(a+'-vs-'+b,'comparison',override.analysis,override.decision);
}
console.log(JSON.stringify({guides:intents.length,comparisons:pairs.length,changed,write:only}));

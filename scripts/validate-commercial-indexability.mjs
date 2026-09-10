import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntents } from './seo-intent-loader.mjs';

const ROOT=process.cwd(),BASE='https://trytoolscout.org';
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const intents=loadSeoIntents(ROOT);
const pairs=JSON.parse(fs.readFileSync(path.join(ROOT,'data','comparisons.json'),'utf8'));
const holdsPath=path.join(ROOT,'reports','seo-publication-holds.json');
const holds=fs.existsSync(holdsPath)?JSON.parse(fs.readFileSync(holdsPath,'utf8')):{items:[]};
const heldIntents=new Set((holds.items||[]).map(x=>x.intent).filter(Boolean));
const toolHoldsPath=path.join(ROOT,'reports','tool-profile-holds.json');
const toolHolds=fs.existsSync(toolHoldsPath)?JSON.parse(fs.readFileSync(toolHoldsPath,'utf8')):{items:[]};
const heldTools=new Set((toolHolds.items||[]).map(x=>x.slug).filter(Boolean));
const sitemap=fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8');
const errors=[];
const check=(ok,message)=>{if(!ok)errors.push(message)};
let publishedProfiles=0,publishedGuides=0;

for(const tool of tools){
  const rel=`tools/${tool.slug}.html`,file=path.join(ROOT,rel),canonical=`${BASE}/${rel}`;
  if(heldTools.has(tool.slug)){
    check(!fs.existsSync(file),`${rel}: held profile is still published`);
    check(!sitemap.includes(`<loc>${canonical}</loc>`),`${rel}: held profile is still in sitemap`);
    continue;
  }
  check(fs.existsSync(file),`${rel}: missing profile`);
  if(!fs.existsSync(file))continue;
  publishedProfiles++;
  const html=fs.readFileSync(file,'utf8');
  check(html.includes(`<link rel="canonical" href="${canonical}">`),`${rel}: bad canonical`);
  check(html.includes('<h1>'),`${rel}: missing H1`);
  check(html.includes('BreadcrumbList'),`${rel}: missing breadcrumb schema`);
  check(html.includes('FAQPage'),`${rel}: missing FAQ schema`);
  check(html.includes(`/go/${tool.slug}`),`${rel}: missing tracked CTA`);
  check(sitemap.includes(`<loc>${canonical}</loc>`),`${rel}: absent from sitemap`);
}

for(const intent of intents){
  const rel=`${intent.slug}.html`,file=path.join(ROOT,rel),canonical=`${BASE}/${rel}`;
  if(heldIntents.has(intent.slug)){
    check(!fs.existsSync(file),`${rel}: held guide is still published`);
    check(!sitemap.includes(`<loc>${canonical}</loc>`),`${rel}: held guide is still in sitemap`);
    continue;
  }
  check(fs.existsSync(file),`${rel}: missing published guide`);
  if(!fs.existsSync(file))continue;
  publishedGuides++;
  const html=fs.readFileSync(file,'utf8');
  check(html.includes('/tools/'),`${rel}: no tool-profile link`);
  check(sitemap.includes(`<loc>${canonical}</loc>`),`${rel}: absent from sitemap`);
}

for(const [a,b] of pairs){
  const rel=`${a}-vs-${b}.html`,file=path.join(ROOT,rel),canonical=`${BASE}/${rel}`;
  check(fs.existsSync(file),`${rel}: missing comparison`);
  if(!fs.existsSync(file))continue;
  const html=fs.readFileSync(file,'utf8');
  check(html.includes(`/tools/${a}.html`)&&html.includes(`/tools/${b}.html`),`${rel}: comparison/profile links incomplete`);
  check(sitemap.includes(`<loc>${canonical}</loc>`),`${rel}: comparison absent from sitemap`);
}

for(const file of ['tools.html','compare.html']){
  const html=fs.readFileSync(path.join(ROOT,file),'utf8');
  check(!html.includes('tool.html?tool=${encodeURIComponent(t.slug)}'),`${file}: still emits query-string profiles`);
}

if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`Commercial indexability passed: ${publishedProfiles} published profiles, ${publishedGuides} published guides, ${heldTools.size} held profiles, ${heldIntents.size} held guides and ${pairs.length} comparisons.`);

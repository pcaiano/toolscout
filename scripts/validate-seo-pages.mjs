import fs from 'node:fs';
import path from 'node:path';
import { eligibleTools as getEligibleTools, editorialEligibility } from './seo-eligibility.mjs';

const ROOT=process.cwd();
const intents=JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'data','organic-growth-engine.json'),'utf8'));
const gates=config.editorialGates||{},MIN_TOOLS=Number(gates.minimumEligibleToolsPerGuide||2),MAX_TOOLS=Number(gates.maximumRankedToolsPerGuide||3),MIN_RELEVANCE=Number(gates.minimumLexicalRelevance||0.75);
const toolBySlug=new Map(tools.map(tool=>[tool.slug,tool]));
const consolidationsPath=path.join(ROOT,'data','seo-consolidations.json'),consolidations=fs.existsSync(consolidationsPath)?JSON.parse(fs.readFileSync(consolidationsPath,'utf8')):{};
const holdsPath=path.join(ROOT,'reports','seo-publication-holds.json'),holds=fs.existsSync(holdsPath)?JSON.parse(fs.readFileSync(holdsPath,'utf8')):{items:[]},heldSlugs=new Set((holds.items||[]).map(x=>x.intent));
const failures=[],seenCanonicals=new Set();
let published=0,withheld=0;

for(const intent of intents){
  if(!intent?.slug)continue;
  const filename=`${intent.slug}.html`,file=path.join(ROOT,filename),eligible=getEligibleTools(tools,intent,MIN_RELEVANCE);
  if(eligible.length<MIN_TOOLS){
    withheld++;
    if(!heldSlugs.has(intent.slug))failures.push(`${filename}: insufficient editorial coverage is not recorded in seo-publication-holds.json`);
    if(fs.existsSync(file))failures.push(`${filename}: insufficient editorial coverage but page is still published`);
    continue;
  }
  if(heldSlugs.has(intent.slug))failures.push(`${filename}: publication hold remains despite sufficient eligible coverage`);
  if(!fs.existsSync(file)){failures.push(`${filename}: missing despite sufficient editorial coverage`);continue;}
  published++;
  const html=fs.readFileSync(file,'utf8');
  if(!/<title>[^<]+<\/title>/i.test(html))failures.push(`${filename}: missing title`);
  if(!/<meta[^>]+name=["']description["'][^>]*>/i.test(html))failures.push(`${filename}: missing meta description`);
  if(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html))failures.push(`${filename}: eligible guide is unexpectedly noindex`);
  const canonical=html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  if(!canonical)failures.push(`${filename}: missing canonical`);else if(seenCanonicals.has(canonical))failures.push(`${filename}: duplicate canonical ${canonical}`);else seenCanonicals.add(canonical);
  const selected=[...html.matchAll(/href=["']\/tools\/([a-z0-9-]+)\.html["']/gi)].map(m=>m[1]).filter((slug,index,all)=>all.indexOf(slug)===index).slice(0,MAX_TOOLS);
  const expected=Math.min(MAX_TOOLS,eligible.length);
  if(selected.length!==expected)failures.push(`${filename}: expected ${expected} ranked eligible tools but found ${selected.length}`);
  for(const slug of selected){
    const tool=toolBySlug.get(slug);
    if(!tool){failures.push(`${filename}: ranked tool ${slug} missing from catalog`);continue;}
    const verdict=editorialEligibility(tool,intent,MIN_RELEVANCE);
    if(!verdict.eligible)failures.push(`${filename}: ${slug} failed editorial eligibility category=${verdict.categoryMatch} capability=${verdict.capabilityMatch} relevance=${verdict.relevance.toFixed(2)}`);
  }
  if(/[—–]/.test(html))failures.push(`${filename}: forbidden long dash character in public copy`);
  if(/verify (?:current )?pricing before publication|verify before publication|pending verification/i.test(html))failures.push(`${filename}: exposes internal verification language in public copy`);
}

const intentSlugs=new Set(intents.map(x=>x?.slug).filter(Boolean));
for(const [source,target] of Object.entries(consolidations)){
  if(source===target)failures.push(`${source}: consolidation cannot target itself`);
  if(!intentSlugs.has(target))failures.push(`${source}: consolidation target ${target} is not a curated intent`);
  if(consolidations[target])failures.push(`${source}: consolidation chain through ${target} is not allowed`);
  if(fs.existsSync(path.join(ROOT,`${source}.html`)))failures.push(`${source}.html: consolidated page must not remain published`);
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`SEO validation passed: ${published} published guides and ${withheld} deliberately withheld intents checked against shared category, capability and semantic gates.`);

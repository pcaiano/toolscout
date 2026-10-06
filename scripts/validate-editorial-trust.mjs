import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntents } from './seo-intent-loader.mjs';
import { editorialEligibility } from './seo-eligibility.mjs';
import { editorialTrust } from './editorial-trust.mjs';

const ROOT=process.cwd();
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const tools=read('data/tools.json',[]);
const freshness=read('data/catalog-freshness-state.json',{tools:{}});
const engine=read('data/organic-growth-engine.json',{editorialGates:{}});
const minRelevance=Number(engine?.editorialGates?.minimumLexicalRelevance||0.75);
const editorialQuality=engine?.editorialQuality||{};
const toolBySlug=new Map(tools.map(x=>[x.slug,x]));
const errors=[];
const warnings=[];
const catalogOnly=process.env.EDITORIAL_TRUST_CATALOG_ONLY==='1';

function trust(tool,{strict=false}={}){
  return editorialTrust(tool,freshness?.tools?.[tool?.slug]||null,{maxFactualAgeDays:45,strictSource:strict,maxSourceCheckAgeDays:10});
}
function error(code,detail){errors.push({code,detail});}
function rankedToolSlugs(html){return [...new Set([...String(html||'').matchAll(/href=["']\/tools\/([a-z0-9-]+)(?:\.html)?(?:[?#][^"']*)?["']/gi)].map(m=>m[1]))];}
function plain(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();}
function wordSet(text){return new Set(plain(text).toLowerCase().match(/[a-z0-9]+/g)||[]);}
function jaccard(a,b){const A=wordSet(a),B=wordSet(b);if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/(A.size+B.size-hit);}

for(const tool of tools){
  const t=trust(tool);
  if(String(tool?.provenance?.mode||'')==='auto_generated_official_source')error('synthetic_catalog_record_present',tool.slug);
  if(!t.trusted)warnings.push({code:'catalog_record_not_editorial_trusted',slug:tool.slug,reasons:t.reasons});
}

if(!catalogOnly){
  const intents=loadSeoIntents(ROOT);
  const intentBySlug=new Map(intents.map(x=>[x.slug,x]));
  for(const intent of intents){
    if(!intent?.slug)continue;
    const file=path.join(ROOT,`${intent.slug}.html`);
    if(!fs.existsSync(file))continue;
    const html=fs.readFileSync(file,'utf8');
    const slugs=rankedToolSlugs(html);
    const valid=[];
    for(const slug of slugs){
      const tool=toolBySlug.get(slug);
      if(!tool){error('published_tool_missing_from_catalog',`${intent.slug}:${slug}`);continue;}
      const t=trust(tool);
      if(!t.trusted){error('published_tool_failed_trust_gate',`${intent.slug}:${slug}:${t.reasons.join(',')}`);continue;}
      const fit=editorialEligibility(tool,intent,minRelevance);
      if(!fit.eligible){
        error('published_tool_failed_intent_gate',`${intent.slug}:${slug}:category=${fit.categoryMatch}:capability=${fit.capabilityMatch}:attribute=${fit.attributeMatch}:relevance=${fit.relevance}:trust=${fit.trusted}`);
        continue;
      }
      valid.push(slug);
    }
    if(valid.length<Number(engine?.editorialGates?.minimumEligibleToolsPerGuide||2))error('published_guide_insufficient_verified_tools',`${intent.slug}:${valid.length}`);
  }

  const toolDir=path.join(ROOT,'tools');
  if(fs.existsSync(toolDir))for(const file of fs.readdirSync(toolDir).filter(x=>x.endsWith('.html'))){
    const slug=file.replace(/\.html$/,'');
    const tool=toolBySlug.get(slug);
    if(!tool){error('public_profile_missing_catalog_record',slug);continue;}
    const t=trust(tool);
    if(!t.trusted)error('public_profile_failed_trust_gate',`${slug}:${t.reasons.join(',')}`);
  }

  const trendsPath=path.join(ROOT,'software-trends-index.json');
  const trendsHtmlPath=path.join(ROOT,'software-trends-index.html');
  if(fs.existsSync(trendsPath)){
    const trends=read('software-trends-index.json',{});
    if(!/ToolScout first-party (?:observations|editorial dataset)/i.test(String(trends.scope||'')))error('trends_scope_disclaimer_missing','software-trends-index.json');
    if(!/not a measure of global market share/i.test(String(trends.scope||'')))error('trends_market_scope_limit_missing','software-trends-index.json');
    for(const row of trends.shortlistLeaders||[]){
      const tool=toolBySlug.get(row.slug);
      if(!tool){error('trends_named_tool_missing',row.slug);continue;}
      const t=trust(tool,{strict:true});
      if(!t.trusted)error('trends_named_tool_failed_strict_gate',`${row.slug}:${t.reasons.join(',')}`);
      for(const intentSlug of row.eligibleGuides||[]){
        const intent=intentBySlug.get(intentSlug);
        if(!intent||!editorialEligibility(tool,intent,minRelevance).eligible)error('trends_shortlist_claim_not_reproducible',`${row.slug}:${intentSlug}`);
      }
    }
    if(String(trends?.searchVisibility?.impressions??'')!==String(read('reports/growth-priority.json',{})?.gsc?.siteTotals?.impressions??''))error('trends_gsc_total_not_reproducible','impressions');
  }
  if(fs.existsSync(trendsHtmlPath)){
    const html=fs.readFileSync(trendsHtmlPath,'utf8');
    const positiveUnsupported=[
      /\b(?:has|holds|commands|captures|leads with)\b[^.]{0,90}\bmarket share\b/i,
      /\bfastest[- ]growing\b/i,
      /\b(?:is|are|remains?|became)\s+(?:the\s+)?market leader\b/i,
      /\bmost popular software\b/i,
      /\bindustry[- ]wide popularity ranking\b/i,
      /\bglobal software market (?:leader|share|ranking)\b/i
    ];
    for(const pattern of positiveUnsupported)if(pattern.test(html))error('unsupported_market_claim',String(pattern));
    if(/[\u2013\u2014]/.test(html))error('forbidden_long_dash','software-trends-index.html');
  }
  if(editorialQuality.rollout==='pilot'){
    const forbidden=editorialQuality?.validation?.rejectGenericAnalysisPhrases||[];
    for(const rel of editorialQuality.pilotPaths||[]){
      const file=path.join(ROOT,rel);
      if(!fs.existsSync(file)){error('editorial_quality_pilot_missing',rel);continue;}
      const html=fs.readFileSync(file,'utf8');
      if(!html.includes('data-editorial-quality="pilot"'))error('editorial_quality_marker_missing',rel);
      if(/[\u2013\u2014]/.test(html))error('editorial_quality_forbidden_long_dash',rel);
      for(const phrase of forbidden)if(plain(html).toLowerCase().includes(String(phrase).toLowerCase()))error('editorial_quality_generic_phrase',`${rel}:${phrase}`);
      if(rel.startsWith('news/')){
        const lead=html.match(/<p class="lead">([\s\S]*?)<\/p>/i)?.[1]||'';
        const changed=html.match(/<\/header>\s*<h2[^>]*>[^<]*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]||'';
        if(!lead||!changed)error('editorial_quality_news_structure_missing',rel);
        else if(jaccard(lead,changed)>=0.72)error('editorial_quality_news_lead_repetition',`${rel}:${jaccard(lead,changed).toFixed(2)}`);
      }
    }
  }

}

fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','editorial-trust-audit.json'),JSON.stringify({generatedAt:new Date().toISOString(),catalogOnly,errors,warnings,summary:{catalogRecords:tools.length,errors:errors.length,warnings:warnings.length}},null,2)+'\n');
if(errors.length){console.error(JSON.stringify({ok:false,errors:errors.slice(0,50),warnings:warnings.slice(0,20)},null,2));process.exitCode=1;}else console.log(JSON.stringify({ok:true,catalogRecords:tools.length,warnings:warnings.length,catalogOnly}));

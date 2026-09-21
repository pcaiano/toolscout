const BASE='https://trytoolscout.org';
const TIMEOUT=12000;
const OFFICIAL=Object.freeze({
  'character-ai':{name:'Character.AI',url:'https://character.ai/about',category:'ai-assistant'},
  'google-ai-studio':{name:'Google AI Studio',url:'https://aistudio.google.com/',category:'developer'},
  'kling-ai':{name:'Kling AI',url:'https://kling.ai/',category:'content'},
  'otter-ai':{name:'Otter.ai',url:'https://otter.ai/transcription',category:'content'},
  'perplexity-ai':{name:'Perplexity',url:'https://www.perplexity.ai/',category:'ai-research'}
});
const BLOCKED=['alternativeto.net','futurepedia.io','g2.com','capterra.com','saashub.com','facebook.com','instagram.com','linkedin.com','x.com','twitter.com','youtube.com','reddit.com'];
const CAPABILITIES=[
  ['AI assistant',['ai assistant','assistant']],
  ['interactive characters',['characters','character ai']],
  ['conversations',['conversation','conversations','chat']],
  ['storytelling',['storytelling','stories']],
  ['research',['research']],
  ['citations',['citations','sources']],
  ['web search',['web search','answer engine','search the web']],
  ['analysis',['analysis','analyze']],
  ['API',[' api ','api platform','gemini api','sdk']],
  ['image generation',['image generation','generate images']],
  ['video generation',['video generation','generate videos']],
  ['video editing',['video editing','video editor']],
  ['sound generation',['sound generation','audio generation']],
  ['text to speech',['text-to-speech','text to speech','tts']],
  ['transcription',['transcription','transcribe']],
  ['meeting notes',['meeting notes','notetaker','meeting notetaker']],
  ['summaries',['summaries','summary']],
  ['action items',['action items']],
  ['integrations',['integrations','google meet','microsoft teams','zoom']]
];
const CATEGORY_RULES={
  'ai-research':['citations','research','web search','answer engine'],
  'ai-assistant':['ai assistant','characters','conversation','chat'],
  developer:['api platform','gemini api','sdk','developer'],
  content:['video generation','video editor','image generation','transcription','meeting notes','notetaker'],
  design:['image generation','visual design']
};
const clean=v=>String(v??'').replace(/[\u2013\u2014]/g,'-').replace(/\s+/g,' ').trim();
const strip=html=>clean(String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ')).slice(0,50000);
const meta=(html,name)=>{
  const h=String(html||''),n=String(name||'');
  const a=new RegExp('<meta[^>]+(?:name|property)=["\\\']'+n+'["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']','i');
  const b=new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:name|property)=["\\\']'+n+'["\\\']','i');
  return clean(h.match(a)?.[1]||h.match(b)?.[1]||'');
};
const blocked=host=>{host=String(host||'').toLowerCase().replace(/^www\./,'');return BLOCKED.some(x=>host===x||host.endsWith('.'+x))};
async function fetchPage(url){
  let u;try{u=new URL(url)}catch{return null}
  if(u.protocol!=='https:')return null;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),TIMEOUT);
  try{
    const r=await fetch(u.href,{redirect:'follow',headers:{'User-Agent':'ToolScout-Catalog-Gap/1.0 (+https://trytoolscout.org/)','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'},signal:ctl.signal});
    if(!r.ok)return null;
    const html=(await r.text()).slice(0,600000);
    return{url:r.url||u.href,html,title:clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),description:meta(html,'description')||meta(html,'og:description'),text:strip(html)};
  }catch{return null}finally{clearTimeout(timer)}
}
function linkScore(url,label,slug){
  let u;try{u=new URL(url)}catch{return-100}
  if(blocked(u.hostname))return-100;
  const tokens=String(slug).split('-').filter(x=>x.length>=3&&x!=='app'&&x!=='tool');
  const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/[^a-z0-9]/g,'');
  const path=u.pathname.toLowerCase().replace(/[^a-z0-9]/g,'');
  let score=0;
  for(const t of tokens){if(host.includes(t))score+=5;else if(path.includes(t))score+=1}
  if(/official|website|visit|open/i.test(label))score+=3;
  return score;
}
async function discover(slug,examples){
  const hint=OFFICIAL[slug];
  if(hint){const page=await fetchPage(hint.url);if(page&&!blocked(new URL(page.url).hostname))return{...page,hint}}
  const candidates=new Map();
  for(const src of (examples||[]).slice(0,3)){
    const page=await fetchPage(src);if(!page)continue;
    const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
    while((m=re.exec(page.html))){
      let u;try{u=new URL(m[1],page.url)}catch{continue}
      if(u.protocol!=='https:'||blocked(u.hostname))continue;
      const score=linkScore(u.toString(),strip(m[2]).slice(0,120),slug);if(score<4)continue;
      const row=candidates.get(u.origin)||{url:u.toString(),score:0};row.score=Math.max(row.score,score);candidates.set(u.origin,row);
    }
  }
  for(const row of [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,5)){const page=await fetchPage(row.url);if(page)return page}
  return null;
}
function capabilities(text){
  const corpus=' '+String(text||'').toLowerCase().replace(/\s+/g,' ')+' ';
  return CAPABILITIES.filter(([,terms])=>terms.some(t=>corpus.includes(t))).map(([label])=>label).slice(0,10);
}
function category(text,fallback){
  if(fallback)return fallback;
  const corpus=String(text||'').toLowerCase();let best={name:'business',score:0};
  for(const [name,terms] of Object.entries(CATEGORY_RULES)){const score=terms.filter(t=>corpus.includes(t)).length;if(score>best.score)best={name,score}}
  return best.name;
}
function humanName(slug){return String(slug).split('-').map(x=>x==='ai'?'AI':x.charAt(0).toUpperCase()+x.slice(1)).join(' ')}
async function event(env,slug,detail,evidence){
  await env.DB.prepare("INSERT INTO catalog_runtime_events(event_id,tool_slug,event_type,status,detail,evidence_json,created_at) VALUES(?,?,?,?,?,?,datetime('now'))")
    .bind('cat_'+crypto.randomUUID(),slug,'catalog_growth_admitted','completed',detail,JSON.stringify(evidence).slice(0,8000)).run();
}
export async function executeCatalogGrowthTask(env,task={}){
  const slug=String(task.subject_key||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(task.subject_type!=='catalog_gap'||!slug)return{ok:false,verified:false,reason:'unsupported_catalog_task'};
  const existing=await env.DB.prepare("SELECT profile_json FROM catalog_runtime_candidates WHERE tool_slug=? AND status='admitted_coverage'").bind(slug).first();
  if(existing){
    await env.DB.prepare("UPDATE catalog_market_gaps SET status='admitted_coverage',updated_at=datetime('now') WHERE tool_slug=?").bind(slug).run();
    let profile=null;try{profile=JSON.parse(existing.profile_json)}catch{}
    return{ok:true,verified:true,admitted:false,already_admitted:true,slug,profile,toolscoutUrl:BASE+'/tools/'+slug};
  }
  const gap=await env.DB.prepare("SELECT signals,sources_json,examples_json FROM catalog_market_gaps WHERE tool_slug=?").bind(slug).first();
  if(!gap)return{ok:false,verified:false,reason:'catalog_gap_not_found',slug};
  if(Number(gap.signals||0)<2)return{ok:true,verified:false,reason:'insufficient_independent_market_signals',slug};
  let examples=[],sources=[];try{examples=JSON.parse(gap.examples_json||'[]')}catch{}try{sources=JSON.parse(gap.sources_json||'[]')}catch{}
  const official=await discover(slug,examples);
  if(!official)return{ok:true,verified:false,reason:'official_source_not_resolved',slug};
  const corpus=official.title+' '+official.description+' '+official.text,features=capabilities(corpus);
  if(features.length<2)return{ok:true,verified:false,reason:'first_party_capabilities_too_thin',slug,sourceUrl:official.url,capabilities:features.length};
  const hint=OFFICIAL[slug],name=hint?.name||humanName(slug),cat=category(corpus,hint?.category);
  const description=official.description.length>=60?official.description:(name+' provides '+features.slice(0,4).join(', ')+'. ToolScout verified these capabilities directly from the product official first-party website before adding this coverage profile.');
  const profile={slug,name,category:cat,description,pricing:'See the official vendor site for current pricing.',freePlan:null,features,bestFor:[],sourceUrl:official.url,lastVerified:new Date().toISOString().slice(0,10),scores:{},catalogTier:'coverage',rankingEligible:false,comparisonEligible:false,directOfficialCta:true,provenance:{mode:'verified_competitive_gap_runtime',admittedAt:new Date().toISOString(),marketSignals:{count:Number(gap.signals||0),sources},affiliateNeutral:true,competitorContentUsedForEditorialFacts:false,rankingNote:'Catalog inclusion does not imply recommendation. Ranking and comparison eligibility require separate editorial evidence.'}};
  await env.DB.prepare("INSERT INTO catalog_runtime_candidates(tool_slug,profile_json,status,source_status,verified_at,updated_at) VALUES(?,?,'admitted_coverage','ok',datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET profile_json=excluded.profile_json,status='admitted_coverage',source_status='ok',verified_at=datetime('now'),updated_at=datetime('now')").bind(slug,JSON.stringify(profile)).run();
  await env.DB.prepare("INSERT INTO catalog_runtime_state(tool_slug,source_url,source_status,http_status,final_url,quality_status,static_last_verified,last_checked_at,updated_at) VALUES(?,?,'ok',200,?,'healthy',date('now'),datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET source_url=excluded.source_url,source_status='ok',http_status=200,final_url=excluded.final_url,quality_status='healthy',static_last_verified=date('now'),last_checked_at=datetime('now'),updated_at=datetime('now')").bind(slug,official.url,official.url).run().catch(()=>{});
  await env.DB.prepare("UPDATE catalog_market_gaps SET status='admitted_coverage',updated_at=datetime('now') WHERE tool_slug=?").bind(slug).run();
  const toolscoutUrl=BASE+'/tools/'+slug;
  await event(env,slug,name+' added automatically from a verified market-demand coverage gap after first-party source validation.',{slug,name,source_url:official.url,toolscout_url:toolscoutUrl,category:cat,market_signals:Number(gap.signals||0),verified_capabilities:features});
  return{ok:true,verified:true,admitted:true,slug,profile,toolscoutUrl};
}

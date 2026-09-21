const BASE='https://trytoolscout.org';
const TIMEOUT=12000;
const PROFILE_HINTS=Object.freeze({
  'character-ai':{
    name:'Character.AI',
    verificationUrl:'https://character.ai/about',
    sourceUrl:'https://character.ai/',
    category:'ai-assistant',
    description:'AI character platform for interactive conversations, character creation, storytelling and personalized entertainment.',
    features:['AI assistant','AI character conversations','character creation','interactive storytelling','personas','memory','creative conversation'],
    bestFor:['interactive storytelling','character creators','roleplay and creative conversation','casual AI users','entertainment'],
    pricing:'Free plan available; paid plans are available. See vendor for current regional pricing.',
    freePlan:true,
    scores:{price:9,ease:9,automation:5,integrations:4,sales:2,ai:9,marketing:5,seo:2,research:4,content:9,agency:4}
  },
  'google-ai-studio':{
    name:'Google AI Studio',
    verificationUrl:'https://aistudio.google.com/',
    sourceUrl:'https://aistudio.google.com/',
    category:'developer',
    features:['Gemini model prototyping','prompt development','multimodal testing','API development','structured output','developer workflows'],
    bestFor:['software developers','AI prototyping','technical founders','product teams','Gemini API evaluation'],
    scores:{price:8,ease:8,automation:8,integrations:8,sales:2,ai:10,marketing:3,seo:2,research:8,content:6,agency:6}
  },
  'kling-ai':{
    name:'Kling AI',
    verificationUrl:'https://kling.ai/',
    sourceUrl:'https://kling.ai/',
    category:'content',
    features:['AI video generation','image generation','text to video','image to video','creative generation'],
    bestFor:['video creators','marketing teams','social content teams','creative professionals','agencies'],
    scores:{price:7,ease:8,automation:7,integrations:5,sales:3,ai:10,marketing:8,seo:2,research:2,content:10,agency:8}
  },
  'otter-ai':{
    name:'Otter.ai',
    verificationUrl:'https://otter.ai/transcription',
    sourceUrl:'https://otter.ai/',
    category:'content',
    features:['meeting transcription','AI meeting notes','summaries','action items','speaker identification','meeting integrations'],
    bestFor:['meeting-heavy teams','sales teams','researchers','consultants','remote teams'],
    scores:{price:8,ease:9,automation:9,integrations:9,sales:7,ai:8,marketing:5,seo:2,research:7,content:7,agency:7}
  },
  'perplexity-ai':{
    name:'Perplexity',
    verificationUrl:'https://www.perplexity.ai/',
    sourceUrl:'https://www.perplexity.ai/',
    category:'ai-research'
  }
});
const STATIC_ALIASES=Object.freeze({'perplexity-ai':'perplexity'});
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
  const hint=PROFILE_HINTS[slug];
  if(hint){const page=await fetchPage(hint.verificationUrl||hint.sourceUrl);if(page&&!blocked(new URL(page.url).hostname))return{...page,hint}}
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
const SCORE_KEYS=['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency'];
const CATEGORY_SCORES={
  'ai-assistant':{price:7,ease:8,automation:6,integrations:6,sales:3,ai:9,marketing:6,seo:3,research:7,content:8,agency:6},
  'ai-research':{price:7,ease:8,automation:6,integrations:6,sales:3,ai:9,marketing:6,seo:6,research:10,content:8,agency:6},
  developer:{price:7,ease:7,automation:9,integrations:8,sales:2,ai:8,marketing:2,seo:2,research:7,content:4,agency:6},
  content:{price:7,ease:8,automation:7,integrations:6,sales:3,ai:8,marketing:8,seo:3,research:3,content:10,agency:7},
  design:{price:7,ease:8,automation:6,integrations:6,sales:3,ai:7,marketing:7,seo:2,research:2,content:10,agency:8},
  business:{price:7,ease:8,automation:7,integrations:7,sales:5,ai:5,marketing:5,seo:2,research:4,content:4,agency:7}
};
const CATEGORY_AUDIENCES={
  'ai-assistant':['knowledge workers','creators','students','teams'],
  'ai-research':['researchers','knowledge workers','analysts','students','content teams'],
  developer:['software developers','engineering teams','technical founders','product teams'],
  content:['content creators','marketing teams','creative teams','agencies'],
  design:['designers','creative teams','marketers','agencies'],
  business:['small businesses','operations teams','growing teams','consultants']
};
function clampScore(v){return Math.max(1,Math.min(10,Math.round(Number(v)||0)))}
function fullScores(cat,features,hintScores){
  const base={price:6,ease:7,automation:5,integrations:5,sales:4,ai:4,marketing:4,seo:3,research:4,content:5,agency:5,...(CATEGORY_SCORES[cat]||{}),...(hintScores||{})};
  const text=(features||[]).join(' ').toLowerCase();
  const boost=(key,value)=>{base[key]=Math.max(Number(base[key]||0),value)};
  if(/automation|workflow|agent/.test(text))boost('automation',8);
  if(/integration|api|sdk/.test(text))boost('integrations',8);
  if(/research|search|citation|source synthesis/.test(text))boost('research',9);
  if(/video|image|writing|content|storytelling|transcription|summar/.test(text))boost('content',8);
  if(/marketing|campaign|social|creative/.test(text))boost('marketing',7);
  if(/sales|crm|prospect|lead/.test(text))boost('sales',7);
  if(/ai |gemini|model|generation|assistant|character/.test(' '+text))boost('ai',9);
  return Object.fromEntries(SCORE_KEYS.map(k=>[k,clampScore(base[k])]));
}
function deriveBestFor(cat,features,hintBestFor){
  if(Array.isArray(hintBestFor)&&hintBestFor.length)return [...new Set(hintBestFor)].slice(0,6);
  const out=[...(CATEGORY_AUDIENCES[cat]||['small businesses','teams','professionals'])],text=(features||[]).join(' ').toLowerCase();
  if(/video/.test(text))out.unshift('video creators');
  if(/meeting|transcription/.test(text))out.unshift('meeting-heavy teams');
  if(/developer|api|sdk|coding/.test(text))out.unshift('software developers');
  if(/research|citation|web search/.test(text))out.unshift('researchers');
  if(/character|storytelling/.test(text))out.unshift('interactive storytelling');
  return [...new Set(out)].slice(0,6);
}
function detectFreePlan(text,hint){
  if(typeof hint?.freePlan==='boolean')return{freePlan:hint.freePlan,freePlanKnown:true};
  const t=String(text||'').toLowerCase();
  if(/\bfree plan\b|\bfree tier\b|\bfree version\b/.test(t))return{freePlan:true,freePlanKnown:true};
  return{freePlan:false,freePlanKnown:false};
}
function editorialReview(profile){
  const entries=Object.entries(profile.scores||{}).filter(([,v])=>Number.isFinite(Number(v))).sort((a,b)=>Number(b[1])-Number(a[1]));
  const label={price:'value for money',ease:'ease of use',automation:'automation',integrations:'integrations',sales:'sales capability',ai:'AI capability',marketing:'marketing capability',seo:'SEO capability',research:'research capability',content:'content capability',agency:'agency fit'};
  const strengths=entries.slice(0,2).map(([k])=>label[k]||k),weak=entries.at(-1),aud=(profile.bestFor||[]).slice(0,3),caps=(profile.features||[]).slice(0,3);
  const fit=profile.name+' is a practical fit for '+(aud.length?aud.join(', '):'buyers whose workflow matches its core capabilities')+', especially when '+(caps.length?caps.join(', '):'its core workflow')+' matter most.';
  const strong=strengths.length?' In ToolScout scoring, '+strengths.join(' and ')+' are its strongest recorded dimensions.':'';
  const trade=weak&&Number(entries[0]?.[1]||0)-Number(weak[1])>=3?' '+(label[weak[0]]||weak[0])+' is the clearest recorded trade-off, so compare alternatives if that requirement is central.':'';
  const commercial=profile.freePlanKnown===false?' The current free-plan position is not verified.':profile.freePlan?' A recorded free plan makes it easier to test before committing.':' Validate the use case and current pricing before committing.';
  return clean(fit+strong+trade+commercial+' Check current vendor limits, integrations and pricing before purchase.');
}
function isFullParityProfile(p){
  return Boolean(p&&p.rankingEligible!==false&&p.comparisonEligible!==false&&Array.isArray(p.bestFor)&&p.bestFor.length&&p.scores&&SCORE_KEYS.every(k=>Number.isFinite(Number(p.scores[k])))&&p.editorialReview);
}
async function staticTools(env){try{const r=await env.ASSETS.fetch(new Request(BASE+'/data/tools.json'));return r.ok?await r.json():[]}catch{return[]}}
function normalizedName(v){return String(v||'').toLowerCase().replace(/\b(ai|app|software|platform)\b/g,'').replace(/[^a-z0-9]/g,'')}
async function existingCatalogAlias(env,slug,hint){
  const tools=await staticTools(env),alias=STATIC_ALIASES[slug];
  if(alias&&tools.some(t=>t.slug===alias))return tools.find(t=>t.slug===alias);
  const target=normalizedName(hint?.name||humanName(slug));
  return tools.find(t=>normalizedName(t.name)===target)||null;
}
async function event(env,slug,detail,evidence){
  await env.DB.prepare("INSERT INTO catalog_runtime_events(event_id,tool_slug,event_type,status,detail,evidence_json,created_at) VALUES(?,?,?,?,?,?,datetime('now'))")
    .bind('cat_'+crypto.randomUUID(),slug,'catalog_growth_admitted','completed',detail,JSON.stringify(evidence).slice(0,8000)).run();
}
export async function executeCatalogGrowthTask(env,task={}){
  const slug=String(task.subject_key||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(task.subject_type!=='catalog_gap'||!slug)return{ok:false,verified:false,reason:'unsupported_catalog_task'};
  const hint=PROFILE_HINTS[slug]||null;
  const alias=await existingCatalogAlias(env,slug,hint);
  if(alias){
    await env.DB.prepare("UPDATE catalog_market_gaps SET status='covered_existing',updated_at=datetime('now') WHERE tool_slug=?").bind(slug).run();
    await event(env,slug,(hint?.name||humanName(slug))+' resolved to existing catalog tool '+alias.name+'. No duplicate profile was created.',{slug,existing_slug:alias.slug,toolscout_url:BASE+'/tools/'+alias.slug});
    return{ok:true,verified:true,admitted:false,already_present:true,slug:alias.slug,profile:alias,toolscoutUrl:BASE+'/tools/'+alias.slug};
  }
  const existing=await env.DB.prepare("SELECT profile_json FROM catalog_runtime_candidates WHERE tool_slug=? AND status='admitted_coverage'").bind(slug).first();
  if(existing){
    let profile=null;try{profile=JSON.parse(existing.profile_json)}catch{}
    if(isFullParityProfile(profile)){
      await env.DB.prepare("UPDATE catalog_market_gaps SET status='admitted_coverage',updated_at=datetime('now') WHERE tool_slug=?").bind(slug).run();
      return{ok:true,verified:true,admitted:false,already_admitted:true,slug,profile,toolscoutUrl:BASE+'/tools/'+slug};
    }
  }
  const gap=await env.DB.prepare("SELECT signals,sources_json,examples_json FROM catalog_market_gaps WHERE tool_slug=?").bind(slug).first();
  if(!gap)return{ok:false,verified:false,reason:'catalog_gap_not_found',slug};
  if(Number(gap.signals||0)<2)return{ok:true,verified:false,reason:'insufficient_independent_market_signals',slug};
  let examples=[],sources=[];try{examples=JSON.parse(gap.examples_json||'[]')}catch{}try{sources=JSON.parse(gap.sources_json||'[]')}catch{}
  const official=await discover(slug,examples);
  if(!official)return{ok:true,verified:false,reason:'official_source_not_resolved',slug};
  const corpus=official.title+' '+official.description+' '+official.text,features=capabilities(corpus);
  if(features.length<2)return{ok:true,verified:false,reason:'first_party_capabilities_too_thin',slug,sourceUrl:official.url,capabilities:features.length};
  const name=hint?.name||humanName(slug),cat=category(corpus,hint?.category);
  const verifiedFeatures=[...new Set(Array.isArray(hint?.features)&&hint.features.length?hint.features:features)].filter(Boolean).slice(0,10);
  const description=clean(hint?.description||(official.description.length>=60?official.description:(name+' provides '+verifiedFeatures.slice(0,4).join(', ')+'.')));
  const free=detectFreePlan(corpus,hint);
  const profile={
    slug,name,category:cat,description,
    pricing:hint?.pricing||(free.freePlan?'Free plan available; paid plans may vary. See vendor for current pricing.':'See vendor for current pricing.'),
    freePlan:free.freePlan,freePlanKnown:free.freePlanKnown,
    features:verifiedFeatures,bestFor:deriveBestFor(cat,verifiedFeatures,hint?.bestFor),
    sourceUrl:hint?.sourceUrl||official.url,verificationUrl:official.url,
    lastVerified:new Date().toISOString().slice(0,10),
    scores:fullScores(cat,verifiedFeatures,hint?.scores),
    rankingEligible:true,comparisonEligible:true,directOfficialCta:false,
    provenance:{mode:'verified_catalog_runtime',admittedAt:new Date().toISOString(),marketSignals:{count:Number(gap.signals||0),sources},affiliateNeutral:true,competitorContentUsedForEditorialFacts:false,reviewMethod:'first_party_verified_structured_profile_v2'}
  };
  profile.editorialReview=editorialReview(profile);
  await env.DB.prepare("INSERT INTO catalog_runtime_candidates(tool_slug,profile_json,status,source_status,verified_at,updated_at) VALUES(?,?,'admitted_coverage','ok',datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET profile_json=excluded.profile_json,status='admitted_coverage',source_status='ok',verified_at=datetime('now'),updated_at=datetime('now')").bind(slug,JSON.stringify(profile)).run();
  await env.DB.prepare("INSERT INTO catalog_runtime_state(tool_slug,source_url,source_status,http_status,final_url,quality_status,static_last_verified,last_checked_at,updated_at) VALUES(?,?,'ok',200,?,'healthy',date('now'),datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET source_url=excluded.source_url,source_status='ok',http_status=200,final_url=excluded.final_url,quality_status='healthy',static_last_verified=date('now'),last_checked_at=datetime('now'),updated_at=datetime('now')").bind(slug,official.url,official.url).run().catch(()=>{});
  await env.DB.prepare("UPDATE catalog_market_gaps SET status='admitted_coverage',updated_at=datetime('now') WHERE tool_slug=?").bind(slug).run();
  const toolscoutUrl=BASE+'/tools/'+slug;
  await event(env,slug,name+' added automatically as a full ToolScout catalog profile after first-party verification and scoring.',{slug,name,source_url:official.url,toolscout_url:toolscoutUrl,category:cat,market_signals:Number(gap.signals||0),verified_capabilities:features});
  return{ok:true,verified:true,admitted:true,slug,profile,toolscoutUrl};
}

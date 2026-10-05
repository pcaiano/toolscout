import base from './distribution-command-worker.js';
import { prioritizedDistributionFeed } from './distribution-feed-priority.js';
import {recentDistributionAssets,handleMachineDiscoveryCatalogRoute} from './machine-discovery-catalog-runtime.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=120','Access-Control-Allow-Origin':'*'};
const EVENT_H={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const JS_H={'Content-Type':'application/javascript; charset=UTF-8','Cache-Control':'public, max-age=3600','Access-Control-Allow-Origin':'*'};
const SVG_H={'Content-Type':'image/svg+xml; charset=UTF-8','Cache-Control':'public, max-age=86400'};
const XML_H={'Content-Type':'application/rss+xml; charset=UTF-8','Cache-Control':'public, max-age=900'};
const safe=(v,n=500)=>String(v??'').slice(0,n);
const normalize=v=>String(v||'').toLowerCase();
const tokenize=v=>normalize(v).split(/[^a-z0-9]+/).filter(x=>x.length>2);
const escXml=v=>String(v??'').replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'}[c]));
const OBSERVED_STOPWORDS=new Set(['what','are','you','looking','for','the','a','an','and','or','with','to','of','in','on','how','can','i','my','me','need','want','please','find','best','good']);
const EMBED_EVENTS=new Set(['impression','interaction','click','search','results','unresolved','profile_click','vendor_click','error']);
const EMBED_TYPES=new Set(['finder','compare','pick']);

function hostOf(v){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function safeToken(v,n=120){return String(v||'').replace(/[^A-Za-z0-9._:-]/g,'').slice(0,n)}
function toolscoutTarget(sourceHost,placement='widget'){
  const u=new URL('https://trytoolscout.org/');
  u.searchParams.set('utm_source',sourceHost||'embedded');
  u.searchParams.set('utm_medium','distribution');
  u.searchParams.set('utm_campaign','embedded_distribution');
  u.searchParams.set('utm_content',placement);
  return u.toString();
}
async function assetJson(request,env,path){
  const u=new URL(path,request.url);
  const r=await env.ASSETS.fetch(new Request(u.toString(),{method:'GET',headers:{Accept:'application/json'}}));
  if(!r.ok)throw new Error(`asset_${r.status}`);
  return r.json();
}

function inferredProfile(query,profile={}){
  const q=normalize(query),p={...profile};
  if(!p.team&&/\bagenc(?:y|ies)\b/.test(q))p.team='agency';
  if(!p.goal&&/\bcrm\b|sales|customer/.test(q))p.goal='crm';
  if(!p.goal&&/seo|search visibility|keywords|organic/.test(q))p.goal='seo';
  if(!p.goal&&/forms?|surveys?|lead capture/.test(q))p.goal='forms';
  if(!p.goal&&/automation|automate|workflow/.test(q))p.goal='automation';
  if(!p.goal&&/prospect|cold email|outbound|sales engagement|lead database/.test(q))p.goal='sales';
  if(!p.goal&&/support|helpdesk|ticketing|customer service/.test(q))p.goal='support';
  if(!p.goal&&/social media|social scheduling|instagram|linkedin content/.test(q))p.goal='social';
  if(!p.goal&&/website builder|build a website|webflow|framer|website platform/.test(q))p.goal='website';
  if(!p.goal&&/analytics|funnels|retention|session replay|user behavior/.test(q))p.goal='analytics';
  if(!p.goal&&/ai assistant|chatbot|research assistant/.test(q))p.goal='ai-assistant';
  if(!p.goal&&/developer|coding|code editor|devops|deployment/.test(q))p.goal='developer';
  if(!p.goal&&/ecommerce|online store|sell online|commerce/.test(q))p.goal='ecommerce';
  if(!p.goal&&/design|graphic|ui design|visual content/.test(q))p.goal='design';
  if(!p.goal&&/project|team collaboration|productivity|whiteboard/.test(q))p.goal='business';
  if(!p.goal&&/marketing|email|ads?/.test(q))p.goal='marketing';
  if(!p.budget&&/free|budget|cheap|affordable/.test(q))p.budget='free';
  if(!p.priority&&/automation|automate|workflow/.test(q))p.priority='automation';
  if(!p.priority&&/integration|integrate|apps?/.test(q))p.priority='integrations';
  if(!p.priority&&/simple|easy|ease/.test(q))p.priority='ease';
  return p;
}
function detectIntent(query,intents){
  const q=normalize(query);let best=null,bs=0;
  for(const i of intents){
    let s=0;
    for(const k of i.keywords||[])if(q.includes(normalize(k)))s+=2;
    if(i.slug.includes('free')&&/free|budget|cheap|affordable/.test(q))s+=5;
    if(i.slug.includes('crm')&&/crm|sales|customer/.test(q))s+=4;
    if(i.slug.includes('agency')&&/agency|agencies|client/.test(q))s+=6;
    if(i.slug.includes('seo')&&/seo|keywords|organic|search/.test(q))s+=4;
    if(i.category==='sales'&&/prospect|cold email|outbound|sales engagement|lead database/.test(q))s+=5;
    if(i.category==='support'&&/support|helpdesk|ticketing|customer service/.test(q))s+=5;
    if(i.category==='social'&&/social media|social scheduling|instagram|linkedin content/.test(q))s+=5;
    if(i.category==='website'&&/website builder|build a website|website platform|landing page/.test(q))s+=5;
    if(i.category==='analytics'&&/analytics|funnels|retention|session replay|user behavior/.test(q))s+=5;
    if(i.category==='ai-research'&&/ai research|research assistant|source synthesis/.test(q))s+=5;
    if(i.category==='ai-assistant'&&/ai assistant|chatbot|general ai/.test(q))s+=5;
    if(i.category==='developer'&&/developer|coding|code editor|devops|deployment/.test(q))s+=5;
    if(i.category==='ecommerce'&&/ecommerce|online store|sell online|commerce/.test(q))s+=5;
    if(i.category==='design'&&/design|graphic|ui design|visual content/.test(q))s+=5;
    if(i.category==='content'&&/video editing|screen recording|video content|podcast/.test(q))s+=5;
    if(s>bs){best=i;bs=s}
  }
  return bs>=6?best:null;
}
function deriveObservedIntent(query){
  const tokens=tokenize(query).filter(x=>!OBSERVED_STOPWORDS.has(x));
  if(tokens.length<2)return null;
  const hasCommercialSignal=/\b(crm|seo|marketing|automation|email|project|form|forms|sales|software|platform|tool|tools|agency|agencies|lead|leads|workflow|workflows)\b/.test(normalize(query));
  if(!hasCommercialSignal)return null;
  return `observed-${tokens.slice(0,8).join('-').slice(0,92)}`;
}
function querySignal(query,intent,profile,tools){
  const q=normalize(query).trim(),words=tokenize(q).filter(x=>!OBSERVED_STOPWORDS.has(x)),hasProfile=Object.values(profile||{}).some(Boolean);
  let directTool=false,corpusHits=0;
  for(const t of tools){
    const name=normalize(t.name);
    if(q===name||(q.length>=4&&name.includes(q)))directTool=true;
  }
  for(const w of words){
    if(w.length<3)continue;
    const found=tools.some(t=>[t.name,t.category,t.description,...(t.features||[]),...(t.bestFor||[])].map(normalize).join(' ').includes(w));
    if(found)corpusHits++;
  }
  return {recognized:Boolean(intent||directTool||hasProfile||corpusHits>0),directTool,corpusHits,words};
}
function broadCategoryQuery(profile={},signal={}){
  return Boolean(profile.goal&&!profile.budget&&!profile.team&&!profile.priority&&!signal.directTool&&(signal.words||[]).length<=2);
}
function scoreTool(t,q,intent,p={}){
  p=inferredProfile(q,p);
  const words=tokenize(q),h=[t.name,t.category,t.description,...(t.features||[]),...(t.bestFor||[])].map(normalize).join(' '),s=t.scores||{};
  const relevance=Math.min(10,words.reduce((v,w)=>v+(h.includes(w)?2:0)+(normalize(t.category).includes(w)?2:0),0));
  const categoryFit=intent&&intent.category===t.category?12:0;
  const goalFit=p.goal&&normalize(t.category)===normalize(p.goal)?10:0;
  const budgetFit=p.budget==='free'&&t.freePlan?8:p.budget==='low'&&(s.price||0)>=7?5:p.budget==='mid'&&(s.price||0)>=5?4:0;
  let priorityFit=0;
  if(p.priority==='ease')priorityFit=Math.min(8,(s.ease||0)*.8);
  if(p.priority==='automation')priorityFit=Math.min(10,s.automation||0);
  if(p.priority==='integrations')priorityFit=Math.min(10,s.integrations||0);
  if(p.priority==='features')priorityFit=Math.min(8,s.features||0);
  let teamFit=0;
  if(p.team==='agency')teamFit=Math.min(10,s.agency||0);
  if(p.team==='solo')teamFit=Math.min(5,(s.ease||0)*.5);
  if(p.team==='small'||p.team==='team')teamFit=Math.min(5,(s.agency||0)*.5);
  if(p.team==='large')teamFit=Math.min(6,(s.agency||0)*.6);
  let intentFit=0;
  if(intent){
    const w=intent.weights||{};
    if(w.freePlan&&t.freePlan)intentFit+=Math.min(4,w.freePlan);
    if(w.automation)intentFit+=Math.min(4,(s.automation||0)*w.automation/10);
    if(w.integrations)intentFit+=Math.min(4,(s.integrations||0)*w.integrations/10);
    if(w.features)intentFit+=Math.min(4,(s.features||0)*w.features/10);
  }
  const nq=normalize(q).trim(),name=normalize(t.name);
  const exactNameFit=nq===name?24:(nq.length>=4&&name.includes(nq)?16:0);
  const categoryDepth=p.goal&&normalize(t.category)===normalize(p.goal)?Math.min(10,Number(s[p.goal]||0)):0;
  const raw=42+relevance+categoryFit+goalFit+categoryDepth+budgetFit+priorityFit+teamFit+intentFit+exactNameFit;
  return Math.round(Math.min(95,raw));
}
function fitReasons(t,q,intent,p={}){
  p=inferredProfile(q,p);
  const s=t.scores||{},r=[];
  if(p.team==='agency'&&(s.agency||0)>=8)r.push('Strong fit for agencies');
  if(p.goal&&normalize(t.category)===normalize(p.goal))r.push(`Strong ${p.goal} fit`);
  if(p.budget==='free'&&t.freePlan)r.push('Free plan available');
  if(p.priority==='automation'&&(s.automation||0)>=7)r.push('Strong automation fit');
  if(p.priority==='integrations'&&(s.integrations||0)>=7)r.push('Strong integration coverage');
  if(p.priority==='ease'&&(s.ease||0)>=8)r.push('Easy to use');
  if(p.priority==='features'&&(s.features||0)>=7)r.push('Strong feature depth');
  if(p.team==='solo'&&(s.ease||0)>=8)r.push('Well suited to solo users');
  if(p.team==='small'&&(s.agency||0)>=7)r.push('Strong fit for small teams');
  if(p.team==='team'&&(s.agency||0)>=7)r.push('Scales well for growing teams');
  if(p.team==='large'&&(s.agency||0)>=8)r.push('Built for larger organisations');
  if(!r.length)r.push(`Best for ${(t.bestFor||[])[0]||'this software need'}`);
  return [...new Set(r)].slice(0,3);
}
function categoryLabel(score){
  if(score>=82)return 'Very strong category fit';
  if(score>=74)return 'Strong category fit';
  return 'Relevant category fit';
}
async function recommend(request,env){
  const u=new URL(request.url),q=safe(u.searchParams.get('q')||'',300).trim();
  if(q.length<2)return Response.json({error:'query_required',message:'Provide ?q= describing the software job or need.'},{status:400,headers:JSON_H});
  const allowed=(value,set)=>set.includes(value)?value:undefined;
  const profile={
    goal:safe(u.searchParams.get('goal')||'',40)||undefined,
    budget:allowed(safe(u.searchParams.get('budget')||'',20),['free','low','mid','high']),
    team:allowed(safe(u.searchParams.get('team')||'',20),['solo','small','team','large','agency']),
    priority:allowed(safe(u.searchParams.get('priority')||'',30),['ease','automation','integrations','features'])
  };
  const limit=Math.max(1,Math.min(5,Number.parseInt(u.searchParams.get('limit')||'3',10)||3));
  try{
    const [tools,intents]=await Promise.all([assetJson(request,env,'/data/tools.json'),assetJson(request,env,'/data/intents.json')]);
    const p=inferredProfile(q,profile),intent=detectIntent(q,intents),signal=querySignal(q,intent,p,tools);
    if(!signal.recognized){
      return Response.json({error:'recommendation_unresolved',message:'ToolScout could not identify a reliable software need. Add the job, team size, budget or a must-have feature.'},{status:422,headers:{...JSON_H,'Cache-Control':'no-store'}});
    }
    const broad=broadCategoryQuery(p,signal),observed=intent?null:deriveObservedIntent(q);
    const ranked=tools.map(t=>({...t,match:scoreTool(t,q,intent,p)})).filter(t=>t.match>=50).sort((a,b)=>b.match-a.match).slice(0,limit);
    if(!ranked.length){
      return Response.json({error:'recommendation_unresolved',message:'ToolScout understood part of the request, but not strongly enough to rank tools. Add more decision context.'},{status:422,headers:{...JSON_H,'Cache-Control':'no-store'}});
    }
    const results=ranked.map(t=>({
      slug:t.slug,
      name:t.name,
      category:t.category,
      description:t.description,
      pricing:t.pricing,
      free_plan:Boolean(t.freePlan),
      match:broad?null:t.match,
      match_type:broad?'category_fit':'personalized',
      match_label:broad?categoryLabel(t.match):`${t.match}% match`,
      reasons:fitReasons(t,q,intent,p),
      best_for:t.bestFor||[],
      features:(t.features||[]).slice(0,6),
      profile_url:`https://trytoolscout.org/tools/${encodeURIComponent(t.slug)}`,
      tool_url:`https://trytoolscout.org/go/${encodeURIComponent(t.slug)}`
    }));
    return Response.json({
      query:q,
      profile:p,
      intent:intent?{slug:intent.slug,title:intent.title,category:intent.category}:null,
      observed_intent:observed,
      recommendation_type:broad?'category':'personalized',
      count:results.length,
      recommendations:results,
      ranking:'ToolScout fit model with Finder quality gates',
      affiliate_disclosure:'ToolScout may earn a commission from some outbound links. Affiliate relationships do not influence ranking.'
    },{headers:JSON_H});
  }catch{
    return Response.json({error:'recommendation_unavailable'},{status:503,headers:{...JSON_H,'Cache-Control':'no-store'}});
  }
}

async function embedEvent(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:EVENT_H});
  if(request.method!=='POST')return null;
  let payload;
  try{payload=JSON.parse(await request.text())}catch{return Response.json({error:'invalid_json'},{status:400,headers:{...EVENT_H,'Content-Type':'application/json; charset=UTF-8'}})}
  const embedType=safeToken(payload?.embed_type,30),eventType=safeToken(payload?.event,40);
  if(!EMBED_TYPES.has(embedType)||!EMBED_EVENTS.has(eventType)){
    return Response.json({error:'invalid_event'},{status:400,headers:{...EVENT_H,'Content-Type':'application/json; charset=UTF-8'}});
  }
  const originHost=hostOf(request.headers.get('Origin')||''),refererHost=hostOf(request.headers.get('Referer')||'');
  const sourceHost=safeToken(originHost||refererHost||payload?.publisher_host||'',120)||null;
  const publisherId=safeToken(payload?.publisher_id||sourceHost||'embedded',120)||'embedded';
  const assetId=safeToken(payload?.asset_id||embedType,120)||embedType;
  const intentSlug=safeToken(payload?.intent_slug||'',100)||null;
  const resultSlug=safeToken(payload?.result_slug||'',100)||null;
  const mode=['mini','full'].includes(String(payload?.mode||''))?String(payload.mode):null;
  const resultCount=Number.isFinite(Number(payload?.result_count))?Math.max(0,Math.min(20,Number(payload.result_count))):null;
  try{
    await env.DB.prepare(`INSERT INTO distribution_embed_events(event_id,embed_type,event_type,publisher_id,source_host,asset_id,intent_slug,result_slug,result_count,mode,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind(`embevt_${crypto.randomUUID()}`,embedType,eventType,publisherId,sourceHost,assetId,intentSlug,resultSlug,resultCount,mode).run();
  }catch(error){
    return Response.json({error:'embed_telemetry_unavailable',detail:safe(error?.message||error,160)},{status:503,headers:{...EVENT_H,'Content-Type':'application/json; charset=UTF-8'}});
  }
  return new Response(null,{status:204,headers:EVENT_H});
}

async function embedAsset(request,env){
  if(!env.ASSETS)return new Response('Not found',{status:404,headers:JS_H});
  const response=await env.ASSETS.fetch(request);
  if(!response.ok)return response;
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/javascript; charset=UTF-8');
  headers.set('Cache-Control','public, max-age=3600');
  headers.set('Access-Control-Allow-Origin','*');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function widgetScript(){return `(function(){
var d=document,host='';try{host=(new URL(d.referrer||location.href)).hostname.replace(/^www\\./,'')}catch(e){}
function target(p){var u=new URL('https://trytoolscout.org/go/embed');u.searchParams.set('source',host||'embedded');u.searchParams.set('type','widget');u.searchParams.set('placement',p||'widget');return u.toString()}
function mount(el){var mode=el.getAttribute('data-toolscout-embed')||'card',label=el.getAttribute('data-toolscout-label')||'Find the right tool. Faster.',a=d.createElement('a');a.href=target(mode);a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;a.setAttribute('aria-label','Open ToolScout');a.style.cssText='display:inline-flex;align-items:center;gap:8px;font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-decoration:none;color:#111;border:1px solid #d9d9d9;border-radius:12px;padding:10px 14px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)';var dot=d.createElement('span');dot.style.cssText='width:10px;height:10px;border:2px solid currentColor;border-radius:50%;display:inline-block;box-sizing:border-box';a.prepend(dot);el.replaceChildren(a)}
function run(){d.querySelectorAll('[data-toolscout-embed]').forEach(mount)}if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',run);else run();
})();`}
function badgeSvg(){return `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="36" viewBox="0 0 190 36" role="img" aria-label="Powered by ToolScout"><rect x=".5" y=".5" width="189" height="35" rx="10" fill="white" stroke="#d8d8d8"/><circle cx="20" cy="18" r="7" fill="none" stroke="#111" stroke-width="2"/><circle cx="20" cy="18" r="2" fill="#111"/><text x="35" y="22" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="600" fill="#111">Powered by ToolScout</text></svg>`}
async function logEmbedClick(request,env){
  const u=new URL(request.url),placement=safe(u.searchParams.get('placement')||'widget',80),embedType=safe(u.searchParams.get('type')||'widget',80),ref=request.headers.get('Referer')||'',source=hostOf(ref)||safe(u.searchParams.get('source')||'embedded',120),target=toolscoutTarget(source,placement);
  try{await env.DB.prepare(`INSERT INTO distribution_embed_clicks(click_id,embed_type,source_host,placement,target_url,referrer,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(`emb_${crypto.randomUUID()}`,embedType,source,placement,target,safe(ref,800)).run();}catch{}
  return Response.redirect(target,302);
}
async function feedJson(env){
  const items=await recentDistributionAssets(env,30);
  return Response.json({name:'ToolScout Distribution Feed',home:'https://trytoolscout.org',updated_at:new Date().toISOString(),items:items.map(x=>({url:x.asset_url,type:x.asset_type,last_seen_at:x.last_seen_at}))},{headers:JSON_H});
}
async function feedRss(env){
  const items=await recentDistributionAssets(env,30);
  const xml=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ToolScout Distribution Feed</title><link>https://trytoolscout.org/</link><description>Recent ToolScout decision assets for syndication and discovery.</description>${items.map(x=>`<item><title>${escXml(x.asset_type||'ToolScout decision asset')}</title><link>${escXml(x.asset_url)}</link><guid>${escXml(x.asset_url)}</guid><pubDate>${new Date((x.last_seen_at||'').replace(' ','T')+'Z').toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  return new Response(xml,{headers:XML_H});
}
function publisherKit(){
  const body=`<!doctype html><html lang="en" data-toolscout-redesign="2" data-toolscout-surface="publisher-kit"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout Software Finder for Publishers</title><meta name="description" content="Add ToolScout's free software discovery Finder to your site with one script tag."><link rel="canonical" href="https://trytoolscout.org/distribution/publisher-kit"><style>
:root{--ink:#0B0D0C;--lime:#B7FF3C;--paper:#F3F5F1;--muted:#A8B0A6;--line:#2C332D;--panel:#141814}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--paper);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.ts2-global-nav{position:sticky;top:0;z-index:1000;background:var(--ink);border-bottom:1px solid rgba(243,245,241,.10)}.nav-shell{max-width:1120px;height:76px;margin:auto;padding:0 22px;display:flex;align-items:center;justify-content:space-between;gap:24px}.ts2-brand{display:inline-flex;align-items:center;gap:10px;color:var(--paper);font-size:21px;font-weight:850;letter-spacing:-.04em;text-decoration:none}.ts2-brand img{width:23px;height:23px}.nav-links{display:flex;gap:22px;font-size:13px}.nav-links a{color:#CDD2CC;text-decoration:none}.nav-links a:hover{color:#fff}main{max-width:1120px;margin:auto;padding:56px 22px 88px}.eyebrow{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--lime);font-weight:850}.hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:44px;align-items:start;padding:34px 0 54px;border-bottom:1px solid var(--line)}h1{font-size:clamp(46px,7vw,82px);line-height:.94;letter-spacing:-.055em;margin:12px 0 22px;max-width:820px}h2{font-size:30px;letter-spacing:-.035em;margin:0 0 12px}h3{font-size:18px;margin:0 0 8px}.lead{font-size:18px;line-height:1.6;color:#C9D0C7;max-width:700px}.pill{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:8px 11px;margin:6px 6px 0 0;color:#C9D0C7;font-size:12px}.card{border:1px solid var(--line);border-radius:22px;padding:22px;background:var(--panel)}.demo{min-height:300px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}.section{padding:46px 0;border-bottom:1px solid var(--line)}p,li{color:#C9D0C7;line-height:1.65}.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:20px}.step{border:1px solid var(--line);border-radius:18px;padding:18px}.num{color:var(--lime);font-size:11px;font-weight:850;letter-spacing:.1em}pre{white-space:pre-wrap;overflow:auto;background:#080A09;border:1px solid var(--line);border-radius:14px;padding:15px;color:#DDE4DB;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}.small{font-size:12px;color:var(--muted)}.cta{display:inline-block;background:var(--lime);color:var(--ink);font-weight:850;text-decoration:none;border-radius:12px;padding:13px 16px;margin-top:8px}@media(max-width:800px){.nav-shell{height:66px}.nav-links{display:none}main{padding-top:30px}.hero,.grid,.steps{grid-template-columns:1fr}h1{font-size:48px}}
</style></head><body><header class="ts2-global-nav"><div class="nav-shell"><a class="ts2-brand" href="/" aria-label="ToolScout home"><img src="/favicon.svg" alt="">ToolScout</a><nav class="nav-links" aria-label="Primary"><a href="/tools">Tools</a><a href="/guides">Guides</a><a href="/compare">Compare</a><a href="/whats-new">What's new</a></nav></div></header><main>
<section class="hero"><div><div class="eyebrow">ToolScout for publishers</div><h1>Add software discovery to your site.</h1><p class="lead">ToolScout Finder is a free embeddable software discovery service. Your readers describe the job they need software to do and get a focused shortlist inside your site, powered by ToolScout's independent decision engine.</p><div><span class="pill">One script tag</span><span class="pill">No pay to rank</span><span class="pill">No reciprocal link required</span><span class="pill">Full and Mini modes</span></div><a class="cta" href="#install">Get the embed code</a></div><div class="card demo"><div class="eyebrow">Live demo</div><p class="small">This demo does not write publisher telemetry.</p><script async src="https://trytoolscout.org/embed/toolscout-finder.js" data-publisher="toolscout-publisher-kit" data-mode="full" data-track="false"></script></div></section>
<section class="section"><div class="eyebrow">Why publishers use it</div><h2>Useful before it is promotional.</h2><div class="steps"><div class="step"><div class="num">01</div><h3>Reader utility</h3><p>Give visitors a concrete software discovery tool instead of another static directory link.</p></div><div class="step"><div class="num">02</div><h3>Independent logic</h3><p>Affiliate relationships do not influence ranking. Broad searches are labelled as category fit rather than fake personalised precision.</p></div><div class="step"><div class="num">03</div><h3>Measured partnerships</h3><p>A publisher ID lets ToolScout measure widget adoption and referral quality so useful partnerships can be expanded.</p></div></div></section>
<section class="section" id="install"><div class="eyebrow">Install</div><h2>Copy one line.</h2><div class="grid"><div class="card"><h3>Finder Full</h3><p>Three recommendations with decision reasons and links to ToolScout analysis and the vendor.</p><pre>&lt;script async src="https://trytoolscout.org/embed/toolscout-finder.js" data-publisher="YOUR-SITE" data-mode="full"&gt;&lt;/script&gt;</pre></div><div class="card"><h3>Finder Mini</h3><p>A compact single-result version for sidebars, resource pages and newsletters with web embeds.</p><pre>&lt;script async src="https://trytoolscout.org/embed/toolscout-finder.js" data-publisher="YOUR-SITE" data-mode="mini"&gt;&lt;/script&gt;</pre></div></div><p class="small">Use a stable publisher ID such as your site or publication slug. The widget uses Shadow DOM so host-site CSS does not change its layout.</p></section>
<section class="section"><div class="eyebrow">Measurement and privacy</div><h2>Attribution without storing raw searches.</h2><p>Embed telemetry records the publisher, source host, widget mode and interaction type. Result counts and clicked tool slugs may be recorded. ToolScout does not store the visitor's raw Finder query in embed telemetry. Vendor clicks continue through ToolScout's tracked <code>/go/</code> routes so commercial measurement remains separate from ranking.</p></section>
<section class="section"><div class="eyebrow">Press and partner copy</div><h2>A ready-made description.</h2><div class="card"><p><strong>ToolScout Software Finder</strong> is a free embeddable software discovery widget that lets a site's visitors describe the job they need software to do and receive a focused shortlist powered by ToolScout's independent recommendation model. It installs with one script tag and does not require paid placement, exclusivity or a reciprocal link.</p></div></section>
<section class="section"><div class="eyebrow">Developer options</div><h2>Use the widget or the API.</h2><div class="grid"><div class="card"><h3>Recommendation API</h3><pre>GET https://trytoolscout.org/api/recommend?q=CRM+for+a+5-person+sales+team</pre><p class="small">Broad category requests return qualitative category fit. Context-rich requests can return personalised match scores.</p></div><div class="card"><h3>Other embeds</h3><pre>&lt;script async src="https://trytoolscout.org/embed/toolscout-compare.js" data-a="TOOL-A" data-b="TOOL-B"&gt;&lt;/script&gt;

&lt;script async src="https://trytoolscout.org/embed/toolscout-pick.js" data-tool="TOOL-SLUG"&gt;&lt;/script&gt;</pre></div></div><p class="small"><a href="https://trytoolscout.org/openapi.json">OpenAPI</a> · <a href="https://trytoolscout.org/.well-known/toolscout-distribution.json">Distribution manifest</a> · <a href="https://trytoolscout.org/distribution/feed.xml">RSS feed</a></p></section>
<section class="section"><div class="eyebrow">Editorial principles</div><h2>Free to embed. Independent by design.</h2><p>No paid placement. No reciprocal link requirement. No exclusivity requirement. ToolScout may earn commissions from some vendor links, but affiliate status does not determine inclusion or ranking.</p></section>
</main></body></html>`;
  return new Response(body,{headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=300'}});
}

export async function handleDistributionEmbedRoute(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/distribution/publisher-kit'&&request.method==='GET')return publisherKit();
  if(u.pathname==='/api/recommend'&&request.method==='GET')return recommend(request,env);
  if(u.pathname==='/api/distribution/embed-event'&&(request.method==='POST'||request.method==='OPTIONS'))return embedEvent(request,env);
  if(['/embed/toolscout-finder.js','/embed/toolscout-compare.js','/embed/toolscout-pick.js'].includes(u.pathname)&&request.method==='GET')return embedAsset(request,env);
  if(u.pathname==='/embed/toolscout.js'&&request.method==='GET')return new Response(widgetScript(),{headers:JS_H});
  if(u.pathname==='/embed/badge.svg'&&request.method==='GET')return new Response(badgeSvg(),{headers:SVG_H});
  if(u.pathname==='/distribution/feed.xml'&&request.method==='GET')return prioritizedDistributionFeed(request,env,'xml');
  return null;
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    const owned=await handleDistributionEmbedRoute(request,env);
    if(owned)return owned;
    if(u.pathname==='/api/distribution/feed.json'&&request.method==='GET')return prioritizedDistributionFeed(request,env,'json');
    const discovery=await handleMachineDiscoveryCatalogRoute(request,env);
    if(discovery)return discovery;
    if(u.pathname==='/go/embed'&&request.method==='GET')return logEmbedClick(request,env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};

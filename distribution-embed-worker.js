import {businessWorkflowGuidance} from './business-workflow-intent.js';
import base from './distribution-command-worker.js';
import { prioritizedDistributionFeed } from './distribution-feed-priority.js';
import {recentDistributionAssets,handleMachineDiscoveryCatalogRoute} from './machine-discovery-catalog-runtime.js';

const TOOLSCOUT_DESCRIPTOR='Independent Software Discovery & Decision Engine';
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=120','Access-Control-Allow-Origin':'*'};
const JS_H={'Content-Type':'application/javascript; charset=UTF-8','Cache-Control':'public, max-age=3600','Access-Control-Allow-Origin':'*'};
const SVG_H={'Content-Type':'image/svg+xml; charset=UTF-8','Cache-Control':'public, max-age=86400'};
const XML_H={'Content-Type':'application/rss+xml; charset=UTF-8','Cache-Control':'public, max-age=900'};
const safe=(v,n=500)=>String(v??'').slice(0,n);
const normalize=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const tokenize=v=>normalize(v).split(/[^a-z0-9]+/).filter(x=>x.length>2);
const escXml=v=>String(v??'').replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'}[c]));
const OBSERVED_STOPWORDS=new Set(['what','are','you','looking','for','the','a','an','and','or','with','to','of','in','on','how','can','i','my','me','need','want','please','find','best','good']);

function hostOf(v){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
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
  if(!p.budget&&/\b(free|gratuito|gratuita|sem custos|sem pagar)\b/.test(q))p.budget='free';
  else if(!p.budget&&/\b(cheap|affordable|low cost|economico|barato|budget)\b/.test(q))p.budget='low';
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
function decisionDimensions(intent,profile){
  const weights=intent?.weights||{},priority=profile.priority==='features'?'content':profile.priority;
  const keys=priority?[priority]:Object.keys(weights).filter(x=>['price','ease','automation','integrations','sales','marketing','seo','research','content','agency','ai'].includes(x));
  return keys.length?keys:['ease','integrations','automation','price'];
}
function scoreTool(t,q,intent,p={}){
  p=inferredProfile(q,p);
  const nq=normalize(q).replace(/[^a-z0-9]+/g,' ').trim(),name=normalize(t.name).replace(/[^a-z0-9]+/g,' ').trim();
  const exactName=nq===name;
  const category=p.goal||intent?.category||null,categoryMatches=category===t.category;
  if(t.rankingEligible===false||t.categoryReviewRequired===true)return -1;
  if(p.budget==='free'&&!(t.freePlanKnown===true&&t.freePlan===true))return -1;
  if(category&&!categoryMatches&&!exactName)return -1;
  const phrases=[t.name,t.category,t.description,...(t.features||[]),...(t.bestFor||[])].map(x=>normalize(x).replace(/[^a-z0-9]+/g,' '));
  const words=tokenize(q).filter(w=>!['software','tools','tool','best','need','want','small','team','business','company','free','cheap','affordable','with','for','the','and','good','what','which','manage','managing','my','para','melhor','gerir','negocio','empresa','gestao'].includes(w));
  const hits=words.filter(w=>phrases.some(x=>(' '+x+' ').includes(' '+w+' '))).length;
  if(!categoryMatches&&!exactName&&hits===0)return -1;
  const coverage=words.length?hits/words.length:0;
  const dims=decisionDimensions(intent,p),signals=dims.map(x=>Number(t.scores?.[x])).filter(Number.isFinite);
  const weighted=signals.length?signals.reduce((a,v)=>a+Math.max(0,Math.min(10,v)),0)/signals.length:5;
  const proof=t.editorialReview?.verificationStatus==='vendor_documented'?4:0;
  const taskFit=(categoryMatches?70:36)+(exactName?40:0);
  const directStrength=categoryMatches?coverage*7:coverage*4;
  const context=(p.priority?2:0)+(p.team==='agency'?Number(t.scores?.agency||0)*.35:0)
    +(p.budget==='low'?Number(t.scores?.price||0)*.35:0);
  const quality=weighted*1.15;
  return Math.min(97,Math.max(0,Math.round((taskFit+directStrength+quality+proof+context)*10)/10));
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
    const p=inferredProfile(q,profile),guidance=businessWorkflowGuidance(q,p);
    if(guidance)return Response.json({query:q,profile:p,intent:null,recommendation_type:'workflow_guidance',
      guidance,count:0,recommendations:[],ranking:'Workflow decomposition before vendor ranking',
      affiliate_disclosure:'ToolScout may earn a commission from some outbound links. Affiliate relationships do not influence recommendations.'},{headers:JSON_H});
    const intent=detectIntent(q,intents),signal=querySignal(q,intent,p,tools);
    if(!signal.recognized){
      return Response.json({error:'recommendation_unresolved',message:'ToolScout could not identify a reliable software need. Add the job, team size, budget or a must-have feature.'},{status:422,headers:{...JSON_H,'Cache-Control':'no-store'}});
    }
    const broad=broadCategoryQuery(p,signal),observed=intent?null:deriveObservedIntent(q);
    const ranked=tools.map(t=>({...t,match:scoreTool(t,q,intent,p)})).filter(t=>t.match>=68).sort((a,b)=>b.match-a.match||String(a.name).localeCompare(String(b.name))).slice(0,limit);
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
      match_label:broad?categoryLabel(t.match):`${t.match}/100 fit score`,
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
      ranking:'Evidence-aware editorial fit score, not a probability, with category, price and documented product gates. No paid ranking.',
      affiliate_disclosure:'ToolScout may earn a commission from some outbound links. Affiliate relationships do not influence ranking.'
    },{headers:JSON_H});
  }catch{
    return Response.json({error:'recommendation_unavailable'},{status:503,headers:{...JSON_H,'Cache-Control':'no-store'}});
  }
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
  return Response.json({name:'ToolScout Distribution Feed',description:`ToolScout | ${TOOLSCOUT_DESCRIPTOR} | trytoolscout.org.`,home:'https://trytoolscout.org',updated_at:new Date().toISOString(),items:items.map(x=>({url:x.asset_url,type:x.asset_type,last_seen_at:x.last_seen_at}))},{headers:JSON_H});
}
async function feedRss(env){
  const items=await recentDistributionAssets(env,30);
  const xml=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ToolScout Distribution Feed</title><link>https://trytoolscout.org/</link><description>ToolScout | ${TOOLSCOUT_DESCRIPTOR} | trytoolscout.org. Recent ToolScout decision assets for syndication and discovery.</description>${items.map(x=>`<item><title>${escXml(x.asset_type||'ToolScout decision asset')}</title><link>${escXml(x.asset_url)}</link><guid>${escXml(x.asset_url)}</guid><pubDate>${new Date((x.last_seen_at||'').replace(' ','T')+'Z').toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  return new Response(xml,{headers:XML_H});
}
async function publisherKit(request,env){
  if(!env?.ASSETS?.fetch)return new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=UTF-8'}});
  const u=new URL(request.url);u.pathname='/distribution/publisher-kit.html';u.search='';
  const response=await env.ASSETS.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}));
  if(!response?.ok)return response;
  const headers=new Headers(response.headers);
  headers.set('Content-Type','text/html; charset=UTF-8');
  headers.set('Cache-Control','public, max-age=300');
  headers.delete('Content-Length');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export async function handleDistributionEmbedRoute(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/distribution/publisher-kit'&&request.method==='GET')return publisherKit(request,env);
  if(u.pathname==='/api/recommend'&&request.method==='GET')return recommend(request,env);
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

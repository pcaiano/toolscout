import base from './lemlist-profile-correction-worker.js';

const TIME_ZONE='Europe/Lisbon';
const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const AI_HOSTS=['chatgpt.com','chat.openai.com','perplexity.ai','claude.ai','gemini.google.com','copilot.microsoft.com','poe.com','you.com','grok.com'];
const SEARCH_HOSTS=['google.','bing.com','search.yahoo.com','duckduckgo.com','search.brave.com','ecosia.org','yandex.','baidu.com'];
const DISTRIBUTION_HOSTS=['uneed.best','producthunt.com','saashub.com','peerlist.io','tinylaunch.com','betalist.com','indiehackers.com'];
const SOCIAL_HOSTS=['linkedin.com','lnkd.in','x.com','twitter.com','t.co','bsky.app','facebook.com','instagram.com','reddit.com','threads.net'];

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
function parseSqliteUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
function zonedDayKey(value){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value instanceof Date?value:new Date(value));const map=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${map.year}-${map.month}-${map.day}`}
function hostMatches(host,patterns){const h=String(host||'').toLowerCase();return patterns.some(p=>p.endsWith('.')?h.startsWith(p)||h.includes('.'+p):h===p||h.endsWith('.'+p))}
function sourceText(row){return String(row?.source||'direct').toLowerCase()}
function sourceParam(source,key){try{return new URLSearchParams(String(source||'').replace(/^utm_/,'utm_')).get(key)||''}catch{return ''}}
function sourceMentions(source,names){const s=String(source||'').toLowerCase();return names.some(name=>s.includes(`utm_source=${name}`)||s===name||s.includes(`source=${name}`))}
function isHome(path){return String(path||'/')==='/' || String(path||'')==='/index.html'}

function classifyEntry(row){
  const source=sourceText(row);
  const host=String(row?.referrer_host||'').toLowerCase();
  if(hostMatches(host,AI_HOSTS)||sourceMentions(source,['chatgpt','openai','perplexity','claude','gemini','copilot','poe','you','grok']))return {key:'ai_referral',label:'AI referrals',confidence:'known'};
  if(hostMatches(host,SEARCH_HOSTS)||source.startsWith('ref:google.')||source.startsWith('ref:bing.com')||source.startsWith('ref:duckduckgo.com')||source.startsWith('ref:search.brave.com')||source.startsWith('ref:search.yahoo.com'))return {key:'search',label:'Search',confidence:'known'};
  if(hostMatches(host,DISTRIBUTION_HOSTS)||sourceMentions(source,['uneed','producthunt','saashub','peerlist','tinylaunch','betalist','indiehackers','rss','websub']))return {key:'distribution',label:'Distribution',confidence:'known'};
  if(hostMatches(host,SOCIAL_HOSTS)||sourceMentions(source,['linkedin','x','twitter','bluesky','facebook','instagram','reddit','threads']))return {key:'social',label:'Social and community',confidence:'known'};
  if(source==='direct'&&!host)return isHome(row?.path)?{key:'direct_home',label:'Direct homepage',confidence:'unattributed'}:{key:'dark_direct_deep',label:'Unattributed deep entry',confidence:'inferred'};
  if(source.includes('utm_source=')||source!=='direct')return {key:'tracked_campaign',label:'Other tracked source',confidence:'known'};
  if(host||source.startsWith('ref:'))return {key:'other_referral',label:'Other referral',confidence:'known'};
  return {key:'unattributed',label:'Unattributed',confidence:'unattributed'};
}

function firstTouches(rows,windowStart){
  const first=new Map();
  for(const row of rows){
    const at=parseSqliteUtc(row.created_at);
    if(!at||at<windowStart)continue;
    const id=String(row.visitor_id||'');
    if(!id||first.has(id))continue;
    first.set(id,{...row,_at:at});
  }
  return [...first.values()];
}

function summarize(entries){
  const order=['search','ai_referral','distribution','social','dark_direct_deep','direct_home','tracked_campaign','other_referral','unattributed'];
  const counts=new Map(order.map(k=>[k,0]));
  const labels={};
  const deepPages=new Map();
  const referrers=new Map();
  for(const row of entries){
    const c=classifyEntry(row);
    counts.set(c.key,(counts.get(c.key)||0)+1);
    labels[c.key]=c.label;
    if(c.key==='dark_direct_deep')deepPages.set(row.path,(deepPages.get(row.path)||0)+1);
    if(row.referrer_host)referrers.set(row.referrer_host,(referrers.get(row.referrer_host)||0)+1);
  }
  return {
    total:entries.length,
    buckets:order.map(key=>({key,label:labels[key]||({search:'Search',ai_referral:'AI referrals',distribution:'Distribution',social:'Social and community',dark_direct_deep:'Unattributed deep entry',direct_home:'Direct homepage',tracked_campaign:'Other tracked source',other_referral:'Other referral',unattributed:'Unattributed'}[key]),visitors:counts.get(key)||0})).filter(x=>x.visitors>0),
    topUnattributedDeepPages:[...deepPages.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8).map(([path,visitors])=>({path,visitors})),
    topReferrers:[...referrers.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8).map(([host,visitors])=>({host,visitors}))
  };
}

async function attributionSnapshot(env){
  if(!env.DB)return {status:'unavailable'};
  let result;
  try{result=await env.DB.prepare(`SELECT visitor_id,path,source,referrer_host,created_at FROM visitor_events WHERE created_at>=datetime('now','-36 hours') ORDER BY created_at ASC,id ASC`).all()}catch{return {status:'unavailable'}}
  const rows=result?.results||[];
  const now=new Date();
  const todayKey=zonedDayKey(now);
  const todayRows=rows.filter(row=>{const at=parseSqliteUtc(row.created_at);return at&&zonedDayKey(at)===todayKey});
  const todayStart=todayRows.length?parseSqliteUtc(todayRows[0].created_at):now;
  const last24Start=new Date(now.getTime()-86400000);
  return {
    status:'observed',
    timezone:TIME_ZONE,
    definition:'Known sources use referrer or campaign evidence. Unattributed deep entry means a direct first entry on a non-home page and is a dark direct pattern, not a proven channel.',
    today:summarize(firstTouches(todayRows,todayStart)),
    last24:summarize(firstTouches(rows,last24Start)),
    generatedAt:now.toISOString()
  };
}

async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const discoveryAttribution=await attributionSnapshot(env);
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify({...data,discoveryAttribution}),{status:response.status,statusText:response.statusText,headers});
}

function widget(){return `<section class="widget" data-widget="discovery-attribution" style="--w:8;--h:5"><div class="widgetHead"><div><div class="widgetKicker">First-party attribution</div><div class="widgetTitle">Discovery Attribution</div></div><div class="widgetMeta" id="discoveryAttributionMeta">Today</div></div><div class="widgetBody" id="discoveryAttributionBody"><div class="empty">Refresh to load discovery signals.</div></div><div class="resizeHandle"></div></section>`}
function script(){return `<script data-toolscout-discovery-attribution="1">(function(){function draw(d){var a=d&&d.discoveryAttribution,root=document.getElementById('discoveryAttributionBody');if(!root)return;if(!a||a.status!=='observed'){root.innerHTML='<div class="empty">Discovery attribution unavailable.</div>';return}var x=a.today||{},m={};(x.buckets||[]).forEach(function(b){m[b.key]=b});function v(k){return m[k]?m[k].visitors:0}var deep=(x.topUnattributedDeepPages||[]).slice(0,5).map(function(p){return p.path+' ('+p.visitors+')'}).join(', ');root.innerHTML='<div class="metricGrid">'+metric('Search',num(v('search')),'Known search referrer')+metric('AI referrals',num(v('ai_referral')),'Known AI referrer or campaign')+metric('Distribution',num(v('distribution')),'Known launch, directory or syndication source')+metric('Social and community',num(v('social')),'Known social referrer or campaign')+metric('Unattributed deep',num(v('dark_direct_deep')),'Dark direct pattern, source not proven')+metric('Direct homepage',num(v('direct_home')),'No referrer or campaign')+'</div><div class="note" style="margin-top:10px">'+esc(a.definition)+(deep?'<br><br><strong>Top unattributed deep landings:</strong> '+esc(deep):'')+'</div>'}var prev=window.render;if(typeof prev==='function')window.render=function(d){prev(d);draw(d)};try{if(typeof snapshot!=='undefined'&&snapshot)draw(snapshot)}catch(e){}})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  const anchor='<section class="widget" data-widget="traffic-truth"';
  if(!html.includes('data-widget="discovery-attribution"'))html=html.includes(anchor)?html.replace(anchor,widget()+'\n\n    '+anchor):html.replace(/<\/body>/i,widget()+'</body>');
  if(!html.includes('data-toolscout-discovery-attribution="1"'))html=html.replace(/<\/body>/i,script()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')response=await augmentStats(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))response=await decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
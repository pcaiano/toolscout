import base from './distribution-network-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=300','Access-Control-Allow-Origin':'*'};
const FETCH_TIMEOUT=6500;
const MAX_PROFILE_SCANS=10;
const MAX_POLICY_SCANS=8;
let schemaReady=null;

const safe=(v,n=2400)=>String(v??'').slice(0,n);
const lower=v=>String(v||'').toLowerCase();
function hostOf(v){try{return new URL(String(v||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function cleanHandle(v){const s=String(v||'').trim().replace(/^@/,'');return /^[a-z0-9_.-]{1,80}$/i.test(s)?s:null}
function publicUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u:null}catch{return null}}
async function fetchText(url){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),FETCH_TIMEOUT);try{const r=await fetch(url,{headers:{'User-Agent':'ToolScout Content Intelligence/2.1 (+https://trytoolscout.org)','Accept':'text/html,text/plain'},redirect:'follow',signal:ctl.signal});if(!r.ok)return null;const t=(r.headers.get('content-type')||'').toLowerCase();if(!t.includes('text/html')&&!t.includes('text/plain'))return null;return {url:r.url,html:(await r.text()).slice(0,500000)}}catch{return null}finally{clearTimeout(timer)}}
function stripHtml(v){return String(v||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').slice(0,240000)}
function socialLinks(html,baseHost){
  const out={x:null,bluesky:null,linkedin:null};
  for(const m of String(html||'').matchAll(/href=["']([^"']+)["']/ig)){
    let u;try{u=new URL(m[1])}catch{continue}
    const h=u.hostname.toLowerCase().replace(/^www\./,'');
    if((h==='x.com'||h==='twitter.com')&&!out.x){const p=u.pathname.split('/').filter(Boolean);if(p[0]&&!['share','intent','home','search'].includes(lower(p[0])))out.x=cleanHandle(p[0])}
    if(h==='bsky.app'&&!out.bluesky){const p=u.pathname.split('/').filter(Boolean);const i=p.indexOf('profile');if(i>=0&&p[i+1])out.bluesky=cleanHandle(p[i+1])}
    if(h==='linkedin.com'&&!out.linkedin&&/\/company\//i.test(u.pathname))out.linkedin=u.href.split('?')[0];
  }
  return out;
}
function termsLinks(html,base){
  const out=[];
  for(const m of String(html||'').matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig)){
    try{
      const u=new URL(m[1],base),label=(stripHtml(m[2])+' '+u.pathname).toLowerCase();
      if(/affiliate.*terms|program.*terms|terms.*affiliate|terms.*partner|affiliate.*agreement|marketing.*guidelines/.test(label))out.push(u.href);
    }catch{}
  }
  return [...new Set(out)].slice(0,2);
}
const SOCIAL_ALLOW=/(social media|social channels|social networks|social posts?|instagram|linkedin|twitter|\bx\b|facebook|tiktok|youtube).{0,160}(affiliate link|referral link|tracking link|unique link|promotion|promote|share)|(?:affiliate link|referral link|tracking link|unique link).{0,160}(social media|social channels|social networks|instagram|linkedin|twitter|facebook|tiktok|youtube)/i;
const SOCIAL_GENERAL=/(social media|social channels|social networks|influencer|creator|content creator)/i;
const SOCIAL_ALL_BAN=/(may not|must not|prohibited|not permitted|do not).{0,120}(post|promote|share|advertise).{0,80}(social media|social networks|social channels)|(?:social media|social networks|social channels).{0,100}(prohibited|not permitted|forbidden)/i;
const PAID_ONLY_BAN=/(paid social|paid advertising|social ads|facebook ads|instagram ads|twitter ads|linkedin ads|ppc).{0,140}(prohibited|not permitted|may not|must not|forbidden)/i;
const CLOAK_BAN=/(cloak|mask|hide|obscure|redirect|link shortener|shorten).{0,120}(affiliate|referral|tracking|link)|(?:affiliate|referral|tracking).{0,120}(cloak|mask|hide|obscure|redirect|link shortener|shorten)/i;
const DISCLOSURE=/(disclos|#ad|advertis|affiliate relationship|affiliate link)/i;

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS content_social_profiles(
      tool_slug TEXT PRIMARY KEY,tool_name TEXT NOT NULL,source_url TEXT,x_handle TEXT,bluesky_handle TEXT,linkedin_url TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,last_checked_at TEXT,verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliate_social_policy(
      tool_slug TEXT PRIMARY KEY,organic_social_allowed INTEGER,direct_affiliate_link_allowed INTEGER,redirect_allowed INTEGER,
      disclosure_required INTEGER NOT NULL DEFAULT 1,policy_status TEXT NOT NULL DEFAULT 'unknown',evidence_url TEXT,evidence_detail TEXT,
      last_checked_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_affiliate_redirects(
      redirect_id TEXT PRIMARY KEY,tool_slug TEXT NOT NULL,platform TEXT,utm_campaign TEXT,user_agent_hash TEXT,country TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_social_affiliate_redirects_created ON social_affiliate_redirects(created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_social_affiliate_redirects_tool_created ON social_affiliate_redirects(tool_slug,created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS content_engine_briefs(
      brief_id TEXT PRIMARY KEY,family TEXT NOT NULL,commercial_mode TEXT NOT NULL,selected_tool_slug TEXT,mention_json TEXT,target_json TEXT,
      policy_status TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_content_profiles_status ON content_social_profiles(status,last_checked_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_affiliate_social_policy_status ON affiliate_social_policy(policy_status,last_checked_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_content_briefs_created ON content_engine_briefs(created_at DESC)`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
async function assetJson(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}

async function refreshProfiles(env){
  await ensureSchema(env);
  const arr=await assetJson(env,'/data/tools.json',[]);
  const existing=await env.DB.prepare(`SELECT tool_slug,last_checked_at,status FROM content_social_profiles`).all();
  const by=new Map((existing.results||[]).map(x=>[x.tool_slug,x]));
  const due=arr.filter(x=>x?.slug&&x?.sourceUrl).filter(x=>{const r=by.get(x.slug);if(!r?.last_checked_at)return true;const t=Date.parse(String(r.last_checked_at).replace(' ','T')+'Z');return !Number.isFinite(t)||Date.now()-t>14*86400000}).slice(0,MAX_PROFILE_SCANS);
  let scanned=0,verified=0;
  for(const tool of due){
    scanned++;
    const page=await fetchText(tool.sourceUrl);
    if(!page){
      await env.DB.prepare(`INSERT INTO content_social_profiles(tool_slug,tool_name,source_url,status,attempts,last_error,last_checked_at,created_at,updated_at) VALUES(?,?,?,'fetch_failed',1,'official_site_fetch_failed',datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET attempts=content_social_profiles.attempts+1,last_error='official_site_fetch_failed',last_checked_at=datetime('now'),updated_at=datetime('now')`).bind(tool.slug,safe(tool.name,160),tool.sourceUrl).run();continue;
    }
    const s=socialLinks(page.html,hostOf(page.url)),ok=Boolean(s.x||s.bluesky||s.linkedin);
    if(ok)verified++;
    await env.DB.prepare(`INSERT INTO content_social_profiles(tool_slug,tool_name,source_url,x_handle,bluesky_handle,linkedin_url,status,attempts,last_error,last_checked_at,verified_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,1,NULL,datetime('now'),CASE WHEN ? THEN datetime('now') ELSE NULL END,datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET tool_name=excluded.tool_name,source_url=excluded.source_url,x_handle=COALESCE(excluded.x_handle,content_social_profiles.x_handle),bluesky_handle=COALESCE(excluded.bluesky_handle,content_social_profiles.bluesky_handle),linkedin_url=COALESCE(excluded.linkedin_url,content_social_profiles.linkedin_url),status=excluded.status,attempts=content_social_profiles.attempts+1,last_error=NULL,last_checked_at=datetime('now'),verified_at=CASE WHEN excluded.status='verified' THEN datetime('now') ELSE content_social_profiles.verified_at END,updated_at=datetime('now')`)
      .bind(tool.slug,safe(tool.name,160),tool.sourceUrl,s.x,s.bluesky,s.linkedin,ok?'verified':'no_official_social_link',ok?1:0).run();
  }
  return {scanned,verified};
}

async function policySourceMap(env){
  const pipe=await assetJson(env,'/data/affiliate-pipeline.json',[]);
  const out=new Map();
  for(const row of Array.isArray(pipe)?pipe:[]){
    if(!row?.slug)continue;
    out.set(row.slug,{source:row.source||row.application_url||row.program_url||null,status:row.status||null});
  }
  return out;
}
async function refreshPolicies(env){
  await ensureSchema(env);
  const affiliate=await assetJson(env,'/data/affiliate.json',{}),sources=await policySourceMap(env);
  const active=Object.entries(affiliate||{}).filter(([,v])=>v?.enabled&&v?.url).map(([slug,v])=>({slug,...v,source:sources.get(slug)?.source||v.publicUrl}));
  const rows=await env.DB.prepare(`SELECT tool_slug,last_checked_at FROM affiliate_social_policy`).all(),by=new Map((rows.results||[]).map(x=>[x.tool_slug,x]));
  const due=active.filter(x=>{const r=by.get(x.slug);if(!r?.last_checked_at)return true;const t=Date.parse(String(r.last_checked_at).replace(' ','T')+'Z');return !Number.isFinite(t)||Date.now()-t>14*86400000}).slice(0,MAX_POLICY_SCANS);
  let scanned=0,allowed=0,unknown=0,blocked=0;
  for(const item of due){
    scanned++;
    const u=publicUrl(item.source)||publicUrl(item.publicUrl);
    let pages=[];
    if(u){const p=await fetchText(u.href);if(p){pages.push(p);for(const link of termsLinks(p.html,p.url)){const t=await fetchText(link);if(t)pages.push(t)}}}
    const text=pages.map(p=>stripHtml(p.html)).join(' ').slice(0,400000);
    const socialBan=SOCIAL_ALL_BAN.test(text),explicit=SOCIAL_ALLOW.test(text),socialGeneral=SOCIAL_GENERAL.test(text),paidBan=PAID_ONLY_BAN.test(text),cloakBan=CLOAK_BAN.test(text),disclosure=DISCLOSURE.test(text);
    let organic=null,direct=null,redirect=null,status='unknown',detail='No explicit organic-social affiliate permission found in the checked official programme material.';
    if(socialBan){organic=0;direct=0;redirect=0;status='blocked';detail='Official programme material appears to prohibit social promotion.';blocked++}
    else if(explicit){
      organic=1;direct=1;redirect=cloakBan?0:1;status=cloakBan?'social_allowed_direct_only':'verified_social_allowed';
      detail=`Explicit social + affiliate/referral-link language found. Paid-social restriction: ${paidBan?'yes':'no'}. Redirect/cloaking restriction: ${cloakBan?'yes':'no'}.`;allowed++;
    }else{unknown++;if(socialGeneral)detail='Social/creator language exists, but explicit permission to distribute affiliate/referral links on organic social was not verified.'}
    await env.DB.prepare(`INSERT INTO affiliate_social_policy(tool_slug,organic_social_allowed,direct_affiliate_link_allowed,redirect_allowed,disclosure_required,policy_status,evidence_url,evidence_detail,last_checked_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET organic_social_allowed=excluded.organic_social_allowed,direct_affiliate_link_allowed=excluded.direct_affiliate_link_allowed,redirect_allowed=excluded.redirect_allowed,disclosure_required=excluded.disclosure_required,policy_status=excluded.policy_status,evidence_url=excluded.evidence_url,evidence_detail=excluded.evidence_detail,last_checked_at=datetime('now'),updated_at=datetime('now')`)
      .bind(item.slug,organic,direct,redirect,disclosure?1:1,status,pages[0]?.url||u?.href||null,safe(detail,1200)).run();
  }
  return {scanned,allowed,unknown,blocked};
}

function pickIndex(seed,length){if(!length)return 0;let h=0;for(const c of seed)h=(h*31+c.charCodeAt(0))>>>0;return h%length}
function targets(slug){
  const base=`https://trytoolscout.org/go/${encodeURIComponent(slug)}`;
  const common='utm_medium=organic_social&utm_campaign=content_engine_v21_affiliate&ts_affiliate=1';
  return {
    linkedin:`${base}?utm_source=linkedin&${common}`,
    x:`${base}?utm_source=x&${common}`,
    bluesky:`${base}?utm_source=bluesky&${common}`
  };
}
function editorialTargets(family){
  const content=encodeURIComponent(family);
  return {
    linkedin:`https://trytoolscout.org/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=content_engine_v21&utm_content=${content}`,
    x:`https://trytoolscout.org/?utm_source=x&utm_medium=organic_social&utm_campaign=content_engine_v21&utm_content=${content}`,
    bluesky:`https://trytoolscout.org/?utm_source=bluesky&utm_medium=organic_social&utm_campaign=content_engine_v21&utm_content=${content}`
  };
}
async function buildBrief(env,family){
  await ensureSchema(env);
  const profiles=await env.DB.prepare(`SELECT tool_slug,tool_name,x_handle,bluesky_handle,linkedin_url,verified_at FROM content_social_profiles WHERE status='verified' ORDER BY tool_name`).all();
  const commercial=await env.DB.prepare(`SELECT p.tool_slug,p.tool_name,p.x_handle,p.bluesky_handle,p.linkedin_url,a.policy_status,a.redirect_allowed
    FROM content_social_profiles p JOIN affiliate_social_policy a ON a.tool_slug=p.tool_slug
    WHERE p.status='verified' AND a.organic_social_allowed=1 AND a.direct_affiliate_link_allowed=1 AND a.redirect_allowed=1 AND a.policy_status='verified_social_allowed'
    ORDER BY p.tool_name`).all();
  const date=new Date().toISOString().slice(0,10),all=profiles.results||[],eligible=commercial.results||[];
  const mentionStart=pickIndex(family+date,Math.max(1,all.length));
  const mentions=all.length?[all[mentionStart],all[(mentionStart+1)%all.length]].filter((x,i,a)=>x&&a.findIndex(y=>y.tool_slug===x.tool_slug)===i).map(x=>({tool_slug:x.tool_slug,name:x.tool_name,x_handle:x.x_handle?('@'+x.x_handle):null,bluesky_handle:x.bluesky_handle?('@'+x.bluesky_handle):null,linkedin_url:x.linkedin_url||null,verified_from_official_site:true})):[];
  const commercialAllowed=family==='friday_practical'&&eligible.length>0;
  const selected=commercialAllowed?eligible[pickIndex('commercial'+date,eligible.length)]:null;
  const mode=selected?'affiliate_social_verified':'editorial';
  const t=selected?targets(selected.tool_slug):editorialTargets(family);
  const briefId=`brief_${crypto.randomUUID()}`;
  const prompt=[
    `CONTENT ENGINE INTELLIGENCE BRIEF (${family})`,
    `Commercial mode: ${mode}.`,
    selected?`Commercial candidate: ${selected.tool_name} (${selected.tool_slug}). Its official affiliate programme material explicitly permits organic-social affiliate/referral-link promotion and no redirect/cloaking prohibition was detected in the checked material. Use the exact platform target supplied below and include a clear affiliate disclosure. Never change editorial ranking or make the post a recommendation solely because it is monetized.`:'Do not publish a direct affiliate link in this run. Use an editorial ToolScout URL only.',
    mentions.length?`Verified manufacturer/profile candidates discovered from links on their official websites: ${mentions.map(m=>`${m.name} | X ${m.x_handle||'none'} | Bluesky ${m.bluesky_handle||'none'} | LinkedIn company URL ${m.linkedin_url||'none'}`).join(' ; ')}. Mention only when genuinely relevant to the topic. Never invent or guess a handle.`:'No verified social handles are currently available. Do not invent mentions.',
    'Mention guardrail: maximum 2 relevant manufacturers in an editorial post and maximum 1 in a commercial affiliate post. Never tag unrelated people or companies. No engagement bait.',
    selected?'Disclosure required. Use plain, conspicuous wording such as "Affiliate link: ToolScout may earn a commission if you buy through this link. This does not affect our recommendations." For X/Bluesky, "Affiliate link" is the minimum short disclosure when space is constrained.':'No affiliate disclosure is needed unless the post contains an affiliate target.',
    `LinkedIn target: ${t.linkedin}`,
    `X target: ${t.x}`,
    `Bluesky target: ${t.bluesky}`
  ].join('\n');
  await env.DB.prepare(`INSERT INTO content_engine_briefs(brief_id,family,commercial_mode,selected_tool_slug,mention_json,target_json,policy_status,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`).bind(briefId,family,mode,selected?.tool_slug||null,JSON.stringify(mentions),JSON.stringify(t),selected?.policy_status||'editorial').run();
  return {brief_id:briefId,family,commercial_mode:mode,selected_tool:selected?{slug:selected.tool_slug,name:selected.tool_name}:null,mentions,linkedin_target_url:t.linkedin,x_target_url:t.x,bluesky_target_url:t.bluesky,affiliate_disclosure_required:Boolean(selected),prompt_context:prompt};
}

async function metrics(env){
  await ensureSchema(env);
  const [profiles,policies,briefs,socialRedirects]=await Promise.all([
    env.DB.prepare(`SELECT status,COUNT(*) n FROM content_social_profiles GROUP BY status`).all(),
    env.DB.prepare(`SELECT policy_status,COUNT(*) n FROM affiliate_social_policy GROUP BY policy_status`).all(),
    env.DB.prepare(`SELECT commercial_mode,COUNT(*) n,MAX(created_at) last_created_at FROM content_engine_briefs WHERE created_at>=datetime('now','-30 days') GROUP BY commercial_mode`).all(),
    env.DB.prepare(`SELECT platform,COUNT(*) n,MAX(created_at) last_created_at FROM social_affiliate_redirects WHERE created_at>=datetime('now','-30 days') GROUP BY platform`).all()
  ]);
  return {profiles:Object.fromEntries((profiles.results||[]).map(x=>[x.status,Number(x.n||0)])),affiliateSocialPolicies:Object.fromEntries((policies.results||[]).map(x=>[x.policy_status,Number(x.n||0)])),briefs:Object.fromEntries((briefs.results||[]).map(x=>[x.commercial_mode,{count:Number(x.n||0),lastCreatedAt:x.last_created_at||null}])),socialAffiliateRedirects:Object.fromEntries((socialRedirects.results||[]).map(x=>[x.platform||'unknown',{count:Number(x.n||0),lastCreatedAt:x.last_created_at||null}]))};
}

async function cycle(env){
  const profiles=await refreshProfiles(env),policies=await refreshPolicies(env);
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`contentintel_${crypto.randomUUID()}`,'content_social_intelligence_refresh','completed','content_engine',`Content social intelligence: ${profiles.scanned} profile sites scanned, ${profiles.verified} verified social profiles, ${policies.scanned} affiliate policies checked, ${policies.allowed} verified for organic-social affiliate use.`).run().catch(()=>{});
  return {ok:true,profiles,policies};
}

async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function recordSocialAffiliateRedirect(request,env,u,response){
  if(request.method!=='GET'||!u.pathname.startsWith('/go/')||u.searchParams.get('ts_affiliate')!=='1'||response.status<300||response.status>=400||!response.headers.get('Location'))return;
  const platform=lower(u.searchParams.get('utm_source')||'unknown').replace(/[^a-z0-9_-]/g,'').slice(0,40),tool=u.pathname.slice(4).toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!tool)return;
  await ensureSchema(env);
  const ua=request.headers.get('User-Agent')||'',hash=await sha256(ua),bucket=Math.floor(Date.now()/300000);
  const id=await sha256(`${tool}|${platform}|${hash}|${bucket}`);
  await env.DB.prepare(`INSERT OR IGNORE INTO social_affiliate_redirects(redirect_id,tool_slug,platform,utm_campaign,user_agent_hash,country,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(id,tool,platform,safe(u.searchParams.get('utm_campaign'),120)||null,hash,String(request.cf?.country||'').slice(0,8)||null).run();
}
export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/content-engine/brief'&&request.method==='GET'){
      const family=['monday_discovery','wednesday_comparison','friday_practical'].includes(u.searchParams.get('family'))?u.searchParams.get('family'):'monday_discovery';
      try{return Response.json(await buildBrief(env,family),{headers:JSON_H})}catch(error){return Response.json({error:'content_intelligence_unavailable',message:safe(error?.message||error,500)},{status:503,headers:{...JSON_H,'Cache-Control':'no-store'}})}
    }
    if(u.pathname==='/api/content-engine/intelligence/metrics'&&request.method==='GET'){
      try{return Response.json(await metrics(env),{headers:JSON_H})}catch(error){return Response.json({error:'content_intelligence_metrics_unavailable',message:safe(error?.message||error,500)},{status:503,headers:{...JSON_H,'Cache-Control':'no-store'}})}
    }
    const response=await base.fetch(request,env,ctx);
    if(u.pathname.startsWith('/go/')&&u.searchParams.get('ts_affiliate')==='1'){try{await recordSocialAffiliateRedirect(request,env,u,response)}catch{}}
    return response;
  },
  async scheduled(event,env,ctx){
    const result=base.scheduled?await base.scheduled(event,env,ctx):undefined;
    ctx.waitUntil(cycle(env).catch(async error=>{
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`contentintel_fail_${crypto.randomUUID()}`,'content_social_intelligence_refresh','failed','content_engine',safe(error?.message||error,1800)).run().catch(()=>{});
    }));
    return result;
  }
};

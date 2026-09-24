import base from './distribution-network-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=300','Access-Control-Allow-Origin':'*'};
const FETCH_TIMEOUT=6500;
const MAX_PROFILE_SCANS=10;
const MAX_POLICY_SCANS=8;
const CONTENT_PROOF_SHA256='87c22cb2e3aab0b81431781fb86df292ca8e6a1dfab309ab73413c5c532ba718';
const HUMAN_ACQUISITION_SPRINT_START=Date.parse('2026-09-18T23:00:00.000Z');
const HUMAN_ACQUISITION_SPRINT_END=Date.parse('2026-09-28T23:00:00.000Z');
function humanAcquisitionSprintActive(now=Date.now()){return now>=HUMAN_ACQUISITION_SPRINT_START&&now<HUMAN_ACQUISITION_SPRINT_END;}
const HUMAN_ACQUISITION_FALLBACK_TARGETS=Object.freeze([
  {subject_key:'/best-project-management-tools',priority_score:98,opportunity_key:'sprint-search:project-management',signals:{title:'Best Project Management Tools',impressions:93,position:38.66,cluster:'project_management'}},
  {subject_key:'/best-seo-tools-for-agencies',priority_score:96,opportunity_key:'sprint-search:seo-agencies',signals:{title:'Best SEO Tools for Agencies',impressions:727,position:76.02,cluster:'seo_agencies'}},
  {subject_key:'/best-no-code-automation-tools',priority_score:94,opportunity_key:'sprint-search:no-code-automation',signals:{title:'Best No Code Automation Tools',impressions:254,position:74.05,cluster:'no_code_automation'}},
  {subject_key:'/tools/semrush',priority_score:92,opportunity_key:'sprint-search:semrush-profile',signals:{title:'Semrush',impressions:303,position:55.77,cluster:'semrush_airtable_profiles',tool_slug:'semrush'}},
  {subject_key:'/tools/airtable',priority_score:90,opportunity_key:'sprint-search:airtable-profile',signals:{title:'Airtable',impressions:234,position:73.82,cluster:'semrush_airtable_profiles',tool_slug:'airtable'}},
  {subject_key:'/best-funnel-builder',priority_score:88,opportunity_key:'sprint-search:funnel-builders',signals:{title:'Best Funnel Builder',impressions:176,position:76.46,cluster:'funnel_builders'}}
]);
let schemaReady=null;

const safe=(v,n=2400)=>String(v??'').slice(0,n);
const lower=v=>String(v||'').toLowerCase();
function hostOf(v){try{return new URL(String(v||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function cleanHandle(v){const s=String(v||'').trim().replace(/^@/,'');return /^[a-z0-9_.-]{1,80}$/i.test(s)?s:null}
function linkedinVanity(v){try{const u=new URL(String(v||''));const p=u.pathname.split('/').filter(Boolean);const i=p.indexOf('company');return i>=0&&p[i+1]?cleanHandle(p[i+1]):null}catch{return null}}
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
async function resolveBlueskyDid(handle){
  const h=cleanHandle(handle);if(!h)return null;
  try{
    const r=await fetch('https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle='+encodeURIComponent(h),{headers:{'User-Agent':'ToolScout Content Intelligence/2.2 (+https://trytoolscout.org)','Accept':'application/json'}});
    if(!r.ok)return null;const j=await r.json();return /^did:[a-z0-9]+:/i.test(String(j?.did||''))?String(j.did):null;
  }catch{return null}
}
function termsLinks(html,base){
  const out=[];
  for(const m of String(html||'').matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig)){
    try{
      const u=new URL(m[1],base),label=(stripHtml(m[2])+' '+u.pathname).toLowerCase();
      if(/affiliate.*(?:terms|agreement)|(?:terms|agreement).*affiliate|program.*(?:terms|agreement)|partner.*(?:terms|agreement)|referral.*(?:terms|agreement)|marketing.*guidelines|legal.*affiliate|affiliate.*legal|terms of service|\btos\b/.test(label))out.push(u.href);
    }catch{}
  }
  return [...new Set(out)].slice(0,4);
}
function affiliateProgramLinks(html,base){
  const out=[];
  for(const m of String(html||'').matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig)){
    try{
      const u=new URL(m[1],base),label=(stripHtml(m[2])+' '+u.pathname).toLowerCase();
      if(/affiliate|referral program|partner program|partners\/affiliates/.test(label))out.push(u.href);
    }catch{}
  }
  return [...new Set(out)].slice(0,4);
}
const SOCIAL_GENERAL=/(social media|social channels|social networks|influencer|creator|content creator|linkedin|twitter|facebook|instagram|tiktok|youtube)/i;
const PAID_ONLY_BAN=/(paid social|paid advertising|social ads|facebook ads|instagram ads|twitter ads|linkedin ads|ppc|media buying).{0,160}(prohibited|not permitted|may not|must not|forbidden)|(?:prohibited|not permitted|may not|must not|forbidden).{0,160}(paid social|paid advertising|social ads|facebook ads|instagram ads|twitter ads|linkedin ads|ppc|media buying)/i;
const CLOAK_BAN=/(cloak|mask|hide|obscure|redirect|link shortener|shorten).{0,120}(affiliate|referral|tracking|link)|(?:affiliate|referral|tracking).{0,120}(cloak|mask|hide|obscure|redirect|link shortener|shorten)/i;
const DISCLOSURE=/(disclos|#ad|advertis|affiliate relationship|affiliate link|paid partnership|sponsored)/i;
const TERMS_SIGNAL=/(affiliate agreement|affiliate terms|program terms|programme terms|terms (?:and|&) conditions|publisher terms|promotional methods|prohibited activities|acceptable use|compliance requirements|you may not|you must not|affiliate(?:s)? (?:may|must|shall)|referrer(?:s)? (?:may|must|shall))/i;
function policySentences(text){return String(text||'').split(/(?:\r?\n)+|(?<=[.!?])\s+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x.length>15)}
function socialSignals(text){
  let explicit=false,ban=false,approval=false,closedChannels=false;
  for(const line of policySentences(text)){
    const social=/(social media|social channels|social networks|linkedin|twitter|facebook|instagram|tiktok|youtube|followers)/i.test(line);
    const affiliate=/(affiliate|referral|tracking|partner)\s*(?:link|url)?|unique link|partner link/i.test(line);
    const promo=/(promot|advertis|marketing|share|post|display|publish|channel|traffic source)/i.test(line);
    const neg=/(may not|must not|prohibited|not permitted|forbidden|do not|cannot|can't)/i.test(line);
    const positive=/(may|can|allowed|permitted|share|display|place|post|publish|promote|use|via|through|include|embed)/i.test(line);
    const thirdPartyOnly=/(our|company|vendor).{0,50}(social media|page|account)|third part(?:y|ies).{0,50}(social media|page|account)/i.test(line);
    if(social&&affiliate&&positive&&!neg)explicit=true;
    if(social&&promo&&affiliate&&neg&&!thirdPartyOnly)ban=true;
    const approvalWord=/(prior written approval|prior approval|written consent|written permission|pre[- ]?approval|must be approved|subject to approval)/i.test(line);
    if(approvalWord&&/(social media|promotional method|marketing channel|traffic source|online promotion|digital promotion)/i.test(line)&&!/offline/i.test(line))approval=true;
    const limited=/(only|solely|exclusively|limited to|restricted to)/i.test(line);
    if(limited&&/(affiliate|referral|promotion|marketing channel|traffic source)/i.test(line)&&/(website|blog|email|newsletter)/i.test(line)&&!social)closedChannels=true;
  }
  return {explicit,ban,approval,closedChannels};
}

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS content_social_profiles(
      tool_slug TEXT PRIMARY KEY,tool_name TEXT NOT NULL,source_url TEXT,x_handle TEXT,bluesky_handle TEXT,bluesky_did TEXT,linkedin_url TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,last_checked_at TEXT,verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliate_social_policy(
      tool_slug TEXT PRIMARY KEY,organic_social_allowed INTEGER,direct_affiliate_link_allowed INTEGER,redirect_allowed INTEGER,
      disclosure_required INTEGER NOT NULL DEFAULT 1,policy_status TEXT NOT NULL DEFAULT 'unknown',evidence_url TEXT,evidence_detail TEXT,
      last_checked_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliate_social_evidence_registry(
      tool_slug TEXT PRIMARY KEY,evidence_url TEXT NOT NULL,classification_hint TEXT NOT NULL,
      evidence_note TEXT,active INTEGER NOT NULL DEFAULT 1,verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_action_events(
      action_id TEXT PRIMARY KEY,
      opportunity_key TEXT,
      engine TEXT NOT NULL,
      channel TEXT,
      target_url TEXT,
      status TEXT NOT NULL DEFAULT 'prepared',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_action_events_created ON growth_action_events(created_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_action_events_opportunity ON growth_action_events(opportunity_key,status)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS distribution_contact_route_actions(
      route_id TEXT PRIMARY KEY,surface_slug TEXT NOT NULL,route_type TEXT NOT NULL,route_url TEXT NOT NULL,execution_mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',opportunity_slug TEXT,attempts INTEGER NOT NULL DEFAULT 0,last_attempt_at TEXT,last_result TEXT,next_action TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_route_actions_content ON distribution_contact_route_actions(execution_mode,status,updated_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_content_briefs_created ON content_engine_briefs(created_at DESC)`)
  ]);
  await env.DB.prepare(`ALTER TABLE content_social_profiles ADD COLUMN bluesky_did TEXT`).run().catch(()=>{});
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
async function assetJson(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}

async function refreshProfiles(env){
  await ensureSchema(env);
  const arr=await assetJson(env,'/data/tools.json',[]);
  const existing=await env.DB.prepare(`SELECT tool_slug,last_checked_at,status,bluesky_handle,bluesky_did FROM content_social_profiles`).all();
  const by=new Map((existing.results||[]).map(x=>[x.tool_slug,x]));
  const due=arr.filter(x=>x?.slug&&x?.sourceUrl).filter(x=>{const r=by.get(x.slug);if(r?.bluesky_handle&&!r?.bluesky_did)return true;if(!r?.last_checked_at)return true;const t=Date.parse(String(r.last_checked_at).replace(' ','T')+'Z');return !Number.isFinite(t)||Date.now()-t>14*86400000}).slice(0,MAX_PROFILE_SCANS);
  let scanned=0,verified=0;
  for(const tool of due){
    scanned++;
    const page=await fetchText(tool.sourceUrl);
    if(!page){
      await env.DB.prepare(`INSERT INTO content_social_profiles(tool_slug,tool_name,source_url,status,attempts,last_error,last_checked_at,created_at,updated_at) VALUES(?,?,?,'fetch_failed',1,'official_site_fetch_failed',datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET attempts=content_social_profiles.attempts+1,last_error='official_site_fetch_failed',last_checked_at=datetime('now'),updated_at=datetime('now')`).bind(tool.slug,safe(tool.name,160),tool.sourceUrl).run();continue;
    }
    const s=socialLinks(page.html,hostOf(page.url)),blueskyDid=s.bluesky?await resolveBlueskyDid(s.bluesky):null,ok=Boolean(s.x||s.bluesky||s.linkedin);
    if(ok)verified++;
    await env.DB.prepare(`INSERT INTO content_social_profiles(tool_slug,tool_name,source_url,x_handle,bluesky_handle,bluesky_did,linkedin_url,status,attempts,last_error,last_checked_at,verified_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,1,NULL,datetime('now'),CASE WHEN ? THEN datetime('now') ELSE NULL END,datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET tool_name=excluded.tool_name,source_url=excluded.source_url,x_handle=COALESCE(excluded.x_handle,content_social_profiles.x_handle),bluesky_handle=COALESCE(excluded.bluesky_handle,content_social_profiles.bluesky_handle),bluesky_did=COALESCE(excluded.bluesky_did,content_social_profiles.bluesky_did),linkedin_url=COALESCE(excluded.linkedin_url,content_social_profiles.linkedin_url),status=excluded.status,attempts=content_social_profiles.attempts+1,last_error=NULL,last_checked_at=datetime('now'),verified_at=CASE WHEN excluded.status='verified' THEN datetime('now') ELSE content_social_profiles.verified_at END,updated_at=datetime('now')`)
      .bind(tool.slug,safe(tool.name,160),tool.sourceUrl,s.x,s.bluesky,blueskyDid,s.linkedin,ok?'verified':'no_official_social_link',ok?1:0).run();
  }
  return {scanned,verified};
}

async function refreshPolicies(env){
  await ensureSchema(env);
  const tools=await assetJson(env,'/data/tools.json',[]);
  const toolBySlug=new Map((Array.isArray(tools)?tools:[]).map(x=>[x.slug,x]));
  const activeRows=await env.DB.prepare(`SELECT tool_slug,status,program_url,application_url,evidence_json FROM affiliate_workflow WHERE status IN ('verified','active','earning','link_acquired') ORDER BY tool_slug`).all();
  const evidenceRows=await env.DB.prepare(`SELECT tool_slug,evidence_url,classification_hint,evidence_note,verified_at FROM affiliate_social_evidence_registry WHERE active=1`).all().catch(()=>({results:[]}));
  const evidenceBySlug=new Map((evidenceRows.results||[]).map(x=>[x.tool_slug,x]));
  const rows=await env.DB.prepare(`SELECT tool_slug,last_checked_at FROM affiliate_social_policy`).all(),by=new Map((rows.results||[]).map(x=>[x.tool_slug,x]));
  const due=(activeRows.results||[]).filter(x=>{const r=by.get(x.tool_slug);if(!r?.last_checked_at)return true;const t=Date.parse(String(r.last_checked_at).replace(' ','T')+'Z');return !Number.isFinite(t)||Date.now()-t>14*86400000}).slice(0,MAX_POLICY_SCANS);
  let scanned=0,allowed=0,unknown=0,blocked=0;
  for(const item of due){
    scanned++;
    const tool=toolBySlug.get(item.tool_slug)||{};
    const home=publicUrl(tool.sourceUrl||tool.website||tool.url);
    const direct=publicUrl(item.program_url);
    const registered=evidenceBySlug.get(item.tool_slug)||null;
    const registeredUrl=publicUrl(registered?.evidence_url);
    const candidates=[];
    if(registeredUrl)candidates.push(registeredUrl.href);
    if(direct)candidates.push(direct.href);
    if(home){
      const homePage=await fetchText(home.href);
      if(homePage){
        for(const link of affiliateProgramLinks(homePage.html,homePage.url))candidates.push(link);
      }
      for(const path of ['/affiliate','/affiliates','/affiliate-program','/partners/affiliates','/referral-program']){
        try{candidates.push(new URL(path,home.origin).href)}catch{}
      }
    }
    const pages=[];
    for(const candidate of [...new Set(candidates)].slice(0,6)){
      const p=await fetchText(candidate);if(!p)continue;
      const txt=stripHtml(p.html);
      if(!/(affiliate|referral|partner program|creator program)/i.test(txt+' '+p.url))continue;
      pages.push(p);
      for(const link of termsLinks(p.html,p.url)){
        const t=await fetchText(link);if(t)pages.push(t);
      }
      if(pages.length>=5)break;
    }
    let provisionalTexts=pages.map(p=>({url:p.url,text:stripHtml(p.html)}));
    if(home&&!provisionalTexts.some(p=>TERMS_SIGNAL.test(p.text))){
      const legalPaths=['/affiliate-terms/','/affiliate-agreement','/legal/affiliate-program-terms','/legal/affiliate.html','/terms/affiliate-partner-program','/affiliate/program-agreement.html','/en/affiliate-program-terms'];
      for(const path of legalPaths){
        let url;try{url=new URL(path,home.origin).href}catch{continue}
        if(pages.some(p=>p.url===url))continue;
        const t=await fetchText(url);if(!t)continue;
        const txt=stripHtml(t.html);
        if(!/(affiliate|referral|partner)/i.test(txt+' '+t.url))continue;
        pages.push(t);
        if(TERMS_SIGNAL.test(txt))break;
      }
    }
    const pageTexts=pages.map(p=>({url:p.url,text:stripHtml(p.html)}));
    const text=pageTexts.map(p=>p.text).join(' ').slice(0,400000);
    const socialGeneral=SOCIAL_GENERAL.test(text),paidBan=PAID_ONLY_BAN.test(text),cloakBan=CLOAK_BAN.test(text),disclosure=DISCLOSURE.test(text);
    const signals=socialSignals(text);
    const registryFetched=registeredUrl?pages.some(p=>{try{return new URL(p.url).href.replace(/\/$/,'')===registeredUrl.href.replace(/\/$/,'')}catch{return false}}):false;
    const registryVerifiedAt=Date.parse(String(registered?.verified_at||'').replace(' ','T')+'Z');
    const registryFresh=Number.isFinite(registryVerifiedAt)&&(Date.now()-registryVerifiedAt)<=30*86400000;
    const registryTrusted=Boolean(registeredUrl&&(registryFetched||registryFresh));
    const registryExplicit=registryTrusted&&registered?.classification_hint==='explicit_social';
    const registrySilent=registryTrusted&&registered?.classification_hint==='silent_verified';
    const termsVerified=registrySilent||pageTexts.some(p=>TERMS_SIGNAL.test(p.text)||/(terms|conditions|agreement|policy|guidelines|rules|acceptable-use|affiliate-terms|program-terms|programme-terms|referral-agreement|legal\/affiliate)/i.test(String(p.url||'')));
    let organic=null,directLink=null,redirect=null,status='terms_unverified',detail='No sufficiently complete official programme terms could be verified automatically.';
    if((signals.explicit||registryExplicit)&&!signals.ban){
      organic=1;directLink=1;redirect=cloakBan?0:1;status=cloakBan?'explicit_allowed_direct_only':'explicit_allowed';
      detail=`Official programme material explicitly permits organic-social affiliate/referral-link promotion. Paid-social restriction: ${paidBan?'yes':'default_off'}. Redirect/cloaking restriction: ${cloakBan?'yes':'no'}.`;allowed++;
    }else if(!pages.length||!termsVerified){
      unknown++;
      if(pages.length&&socialGeneral)detail='Official programme material was found, but sufficiently complete contractual terms were not verified and no explicit organic-social permission was found. Social use remains blocked pending verification.';
    }else if(signals.ban||signals.closedChannels){
      organic=0;directLink=0;redirect=0;status='explicitly_blocked';detail=`Verified programme terms explicitly prohibit organic-social affiliate promotion or restrict promotion to channels that exclude social media. Paid-social restriction: ${paidBan?'yes':'no'}.`;blocked++;
    }else if(signals.approval){
      organic=0;directLink=0;redirect=0;status='approval_required';detail='Verified programme terms require prior approval for social/digital promotional channels or methods. Human approval gate required.';
    }else{
      organic=1;directLink=1;redirect=cloakBan?0:1;status=cloakBan?'silent_verified_direct_only':'silent_verified';
      detail=`Verified programme terms contain no organic-social prohibition, no closed-channel restriction, and no prior-approval requirement. Organic social allowed by verified silence. Paid-social remains disallowed by default. Redirect/cloaking restriction: ${cloakBan?'yes':'no'}.`;allowed++;
    }
    await env.DB.prepare(`INSERT INTO affiliate_social_policy(tool_slug,organic_social_allowed,direct_affiliate_link_allowed,redirect_allowed,disclosure_required,policy_status,evidence_url,evidence_detail,last_checked_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET organic_social_allowed=excluded.organic_social_allowed,direct_affiliate_link_allowed=excluded.direct_affiliate_link_allowed,redirect_allowed=excluded.redirect_allowed,disclosure_required=excluded.disclosure_required,policy_status=excluded.policy_status,evidence_url=excluded.evidence_url,evidence_detail=excluded.evidence_detail,last_checked_at=datetime('now'),updated_at=datetime('now')`)
      .bind(item.tool_slug,organic,directLink,redirect,disclosure?1:1,status,registryTrusted?registeredUrl.href:(pages[0]?.url||direct?.href||home?.href||null),safe(detail+(registered?.evidence_note?` Evidence registry: ${registered.evidence_note}`:'') ,1200)).run();
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
function editorialTargets(family,path='/',campaign='content_engine_v21'){
  const content=encodeURIComponent(family),base='https://trytoolscout.org'+(String(path||'/').startsWith('/')?String(path||'/'):'/');
  return {
    linkedin:`${base}?utm_source=linkedin&utm_medium=organic_social&utm_campaign=${campaign}&utm_content=${content}`,
    x:`${base}?utm_source=x&utm_medium=organic_social&utm_campaign=${campaign}&utm_content=${content}`,
    bluesky:`${base}?utm_source=bluesky&utm_medium=organic_social&utm_campaign=${campaign}&utm_content=${content}`
  };
}
async function buildBrief(env,family,{issue=false,task=null}={}){
  await ensureSchema(env);
  await env.DB.prepare(`UPDATE growth_action_events SET status='legacy_unverified',updated_at=datetime('now') WHERE status='prepared'`).run().catch(()=>{});
  const profiles=await env.DB.prepare(`SELECT tool_slug,tool_name,x_handle,bluesky_handle,bluesky_did,linkedin_url,verified_at FROM content_social_profiles WHERE status='verified' ORDER BY tool_name`).all();
  let supervisor={status:null,directive:null,config:{}};
  try{const row=await env.DB.prepare(`SELECT status,directive,directive_json FROM growth_supervisor_state WHERE engine='content'`).first();if(row){let config={};try{config=JSON.parse(row.directive_json||'{}')}catch{}supervisor={status:row.status,directive:row.directive,config}}}catch{}
  const growth=await env.DB.prepare(`SELECT subject_type,subject_key,priority_score,opportunity_key FROM growth_opportunity_state WHERE status='active' AND subject_type IN ('tool','news_update') ORDER BY priority_score DESC LIMIT 80`).all().catch(()=>({results:[]}));
  const sprintGrowth=await env.DB.prepare(`SELECT subject_key,priority_score,opportunity_key,signal_json FROM growth_opportunity_state
    WHERE status='active' AND subject_type='search' AND subject_key NOT IN ('/','/tools')
      AND (opportunity_key LIKE 'sprint-search:%' OR (opportunity_key LIKE 'gsc-page:%' AND COALESCE(json_extract(signal_json,'$.evidence_confidence'),'')='meaningful'))
    ORDER BY priority_score DESC,COALESCE(CAST(json_extract(signal_json,'$.impressions') AS INTEGER),0) DESC
    LIMIT 18`).all().catch(()=>({results:[]}));
  const commercial=await env.DB.prepare(`SELECT a.tool_slug,COALESCE(p.tool_name,a.tool_slug) tool_name,p.x_handle,p.bluesky_handle,p.bluesky_did,p.linkedin_url,a.policy_status,a.redirect_allowed,w.affiliate_url
    FROM affiliate_social_policy a
    JOIN affiliate_workflow w ON w.tool_slug=a.tool_slug
    LEFT JOIN content_social_profiles p ON p.tool_slug=a.tool_slug AND p.status='verified'
    WHERE a.organic_social_allowed=1 AND a.direct_affiliate_link_allowed=1
      AND a.policy_status IN ('explicit_allowed','explicit_allowed_direct_only','silent_verified','silent_verified_direct_only')
      AND w.affiliate_url IS NOT NULL AND trim(w.affiliate_url)<>''
      AND w.status IN ('verified','active','earning','link_acquired')
    ORDER BY COALESCE(p.tool_name,a.tool_slug)`).all();
  const routeCandidates=await env.DB.prepare(`SELECT a.route_id,a.surface_slug,a.route_type,a.route_url,a.attempts,n.surface_name,n.priority_score
    FROM distribution_contact_route_actions a
    JOIN distribution_network_outreach n ON n.surface_slug=a.surface_slug
    WHERE a.execution_mode='content_amplification' AND a.status IN ('queued','retry_due')
      AND a.attempts<2
    ORDER BY n.priority_score DESC,a.updated_at ASC LIMIT 12`).all().catch(()=>({results:[]}));
  const catalogTools=await assetJson(env,'/data/tools.json',[]);
  const catalogBySlug=new Map((Array.isArray(catalogTools)?catalogTools:[]).map(x=>[x.slug,x]));
  const date=new Date().toISOString().slice(0,10),all=profiles.results||[],eligible=(commercial.results||[]).map(x=>{const catalog=catalogBySlug.get(x.tool_slug)||null;return{...x,catalog,tool_name:catalog?.name||x.tool_name}}),briefId=`brief_${crypto.randomUUID()}`;
  const profileBySlug=new Map(all.map(x=>[x.tool_slug,x]));
  const growthTools=[],growthRank=new Map();for(const x of growth.results||[]){if(!x.subject_key||growthRank.has(x.subject_key))continue;const row={...x,rank:growthTools.length};growthTools.push(row);growthRank.set(x.subject_key,{rank:row.rank,score:Number(x.priority_score||0),key:x.opportunity_key,type:x.subject_type});}
  const observedSprintRows=(sprintGrowth.results||[]).map(x=>{let signals={};try{signals=JSON.parse(x.signal_json||'{}')}catch{}return{...x,signals};});
  const dedupedSprintRows=[];const seenSprintPaths=new Set();
  for(const row of observedSprintRows){const key=String(row.subject_key||'');if(!key||seenSprintPaths.has(key))continue;seenSprintPaths.add(key);dedupedSprintRows.push(row);}
  const sprintRows=dedupedSprintRows.length?dedupedSprintRows:HUMAN_ACQUISITION_FALLBACK_TARGETS;
  const sprintPool=sprintRows.slice(0,Math.min(3,sprintRows.length));
  const supervisorSearchFirst=Boolean(supervisor?.config?.search_demand_first);
  const acquisitionMode=humanAcquisitionSprintActive()||supervisorSearchFirst;
  let forcedTarget=null;
  if(task?.subject_type==='search'&&task?.subject_key){
    const existing=sprintRows.find(x=>String(x.subject_key||'')===String(task.subject_key));
    if(existing)forcedTarget=existing;
    else{
      const row=await env.DB.prepare(`SELECT opportunity_key,subject_key,priority_score,signal_json FROM growth_opportunity_state WHERE opportunity_key=? LIMIT 1`).bind(task.opportunity_key||task.source_id||'').first().catch(()=>null);
      let signals={};try{signals=JSON.parse(row?.signal_json||'{}')}catch{}
      forcedTarget={opportunity_key:task.opportunity_key||row?.opportunity_key||null,subject_key:task.subject_key,priority_score:Number(task.priority_score||row?.priority_score||0),signals};
    }
  }else if(task?.subject_type==='tool'&&task?.subject_key){
    const profile=profileBySlug.get(String(task.subject_key));
    forcedTarget={
      opportunity_key:task.opportunity_key||null,
      subject_key:`/tools/${String(task.subject_key)}`,
      priority_score:Number(task.priority_score||0),
      signals:{title:profile?.tool_name||String(task.subject_key),tool_slug:String(task.subject_key),impressions:0,position:0}
    };
  }
  const sprintTarget=forcedTarget||(acquisitionMode&&sprintPool.length?sprintPool[pickIndex(family+date,sprintPool.length)]:null);
  const topGrowthProfile=growthTools.map(x=>profileBySlug.get(x.subject_key)).find(Boolean)||null;
  const comparisonPairs=[
    ['make','zapier'],['hubspot','pipedrive'],['beehiiv','kit'],['jotform','typeform'],['semrush','ahrefs'],
    ['notion','clickup'],['asana','clickup'],['airtable','notion'],['n8n','make'],['tally','typeform'],
    ['brevo','mailchimp'],['activecampaign','mailchimp'],['webflow','framer'],['shopify','webflow'],['apollo','lemlist']
  ];
  const growthCommercial=growthTools.map(g=>eligible.find(x=>x.tool_slug===g.subject_key)).find(Boolean)||null;
  const STOP=new Set(['best','top','tool','tools','software','for','and','the','guide','guides','comparison','compare','profile','profiles','platform','platforms']);
  const stem=v=>{const x=String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();return x.endsWith('s')&&x.length>4?x.slice(0,-1):x};
  const tokenSet=v=>new Set(String(v||'').toLowerCase().split(/[^a-z0-9]+/).map(stem).filter(x=>x&&x.length>2&&!STOP.has(x)));
  const commercialRelevance=(candidate,target)=>{
    if(!candidate||!target)return 0;
    if(String(target?.signals?.tool_slug||'')===String(candidate.tool_slug))return 100;
    const topic=tokenSet([target.subject_key,target?.signals?.title].filter(Boolean).join(' '));
    if(!topic.size)return 0;
    const c=candidate.catalog||{};
    const hay=[candidate.tool_slug,candidate.tool_name,c.category,c.description,...(Array.isArray(c.features)?c.features:[]),...(Array.isArray(c.bestFor)?c.bestFor:[])].filter(Boolean).join(' ');
    const cand=tokenSet(hay);
    let score=0;for(const t of topic)if(cand.has(t))score++;
    return score;
  };
  const sprintCommercial=sprintTarget?eligible.map(x=>({x,score:commercialRelevance(x,sprintTarget)})).sort((a,b)=>b.score-a.score)[0]:null;
  const relevantSprintCommercial=sprintCommercial&&sprintCommercial.score>0?sprintCommercial.x:null;
  const scheduledFridayCommercial=family==='friday_practical'&&!forcedTarget&&eligible.length?(growthCommercial||eligible[pickIndex('commercial'+date,eligible.length)]):null;
  const selected=family==='wednesday_comparison'?null:(relevantSprintCommercial||scheduledFridayCommercial);
  const commercialSelectionReason=relevantSprintCommercial?'demand_aligned':(selected?'scheduled_friday_affiliate_slot':null);
  const effectiveSprintTarget=selected&&!relevantSprintCommercial?null:sprintTarget;
  const growthComparison=growthTools.map(g=>comparisonPairs.find(pair=>pair.includes(g.subject_key))).find(Boolean)||null;
  const comparison=family==='wednesday_comparison'&&!effectiveSprintTarget?(growthComparison||comparisonPairs[pickIndex('comparison'+date,comparisonPairs.length)]):null;
  let mentionRows=[];
  if(effectiveSprintTarget?.signals?.tool_slug)mentionRows=[profileBySlug.get(String(effectiveSprintTarget.signals.tool_slug))].filter(Boolean);
  else if(selected)mentionRows=[profileBySlug.get(selected.tool_slug)].filter(Boolean);
  else if(effectiveSprintTarget)mentionRows=[];
  else if(comparison)mentionRows=comparison.map(slug=>profileBySlug.get(slug)).filter(Boolean);
  else if(all.length){const start=pickIndex(family+date,all.length);mentionRows=[topGrowthProfile,all[start],all[(start+1)%all.length]].filter((x,i,a)=>x&&a.findIndex(y=>y.tool_slug===x.tool_slug)===i).slice(0,2);}
  const mentions=mentionRows.map(x=>{
    const blueskyHandle=x.bluesky_handle?('@'+x.bluesky_handle):null,blueskyDid=x.bluesky_did||null;
    return{tool_slug:x.tool_slug,name:x.tool_name,x_handle:x.x_handle?('@'+x.x_handle):null,bluesky_handle:blueskyHandle,bluesky_did:blueskyDid,bluesky_facets:blueskyHandle&&blueskyDid?[{inputMode:'byKeyword',keyword:blueskyHandle,feature:{$type:'app.bsky.richtext.facet#mention',did:blueskyDid}}]:[],linkedin_url:x.linkedin_url||null,linkedin_vanity:linkedinVanity(x.linkedin_url),verified_from_official_site:true};
  });
  const preferredMention=(effectiveSprintTarget?.signals?.tool_slug||selected||comparison)?(mentions[0]||null):null;
  const routeCandidate=(routeCandidates.results||[])[0]||null;
  const mode=selected?'affiliate_social_verified':'editorial';
  const targetMode=selected?'direct_vendor':'editorial';
  let t=selected?{linkedin:selected.affiliate_url,x:selected.affiliate_url,bluesky:selected.affiliate_url}:(effectiveSprintTarget?editorialTargets(family,effectiveSprintTarget.subject_key,humanAcquisitionSprintActive()?'human_acquisition_sprint':'growth_supervisor_search_demand'):editorialTargets(family));
  const growthKey=effectiveSprintTarget?effectiveSprintTarget.opportunity_key:(selected?(growthRank.get(selected.tool_slug)?.key||`tool:${selected.tool_slug}`):(comparison?(growthRank.get(comparison[0])?.key||growthRank.get(comparison[1])?.key||null):(topGrowthProfile?(growthRank.get(topGrowthProfile.tool_slug)?.key||`tool:${topGrowthProfile.tool_slug}`):null)));
  let comparisonContext=null;
  if(comparison){
    const slug=`${comparison[0]}-vs-${comparison[1]}`;
    comparisonContext={slug,tool_a:comparison[0],tool_b:comparison[1]};
    const base=`https://trytoolscout.org/${slug}.html`,common='utm_medium=organic_social&utm_campaign=content_engine_v21&utm_content=wednesday_comparison';
    t={linkedin:`${base}?utm_source=linkedin&${common}`,x:`${base}?utm_source=x&${common}`,bluesky:`${base}?utm_source=bluesky&${common}`};
  }
  const tagOwned=(value,channel)=>{try{const u=new URL(String(value||''));if(u.hostname!=='trytoolscout.org')return value;u.searchParams.set('ts_action',`${briefId}:${channel}`);if(growthKey)u.searchParams.set('ts_growth',growthKey);u.searchParams.set('ts_channel',channel);return u.toString()}catch{return value}};
  t={linkedin:tagOwned(t.linkedin,'linkedin'),x:tagOwned(t.x,'x'),bluesky:tagOwned(t.bluesky,'bluesky')};
  const prompt=[
    `CONTENT ENGINE INTELLIGENCE BRIEF (${family})`,
    `Commercial mode: ${mode}.`,
    effectiveSprintTarget?`${humanAcquisitionSprintActive()?'Human Acquisition Sprint':'Growth Supervisor'} focus: ${effectiveSprintTarget.signals?.title||effectiveSprintTarget.subject_key}. GSC observed ${Number(effectiveSprintTarget.signals?.impressions||0)} impressions at average position ${Number(effectiveSprintTarget.signals?.position||0).toFixed(1)}. Build the post around the practical user problem behind this page and use the exact platform target below. If a policy-approved commercial candidate is selected, that target is the direct vendor referral URL; otherwise it is a ToolScout editorial URL. Optimize for a qualified human visit and useful commercial intent, not vanity reach. Supervisor directive: ${supervisor.directive||'observed demand first'}.`:null,
    comparisonContext?`Comparison selected for this run: ${comparisonContext.tool_a} vs ${comparisonContext.tool_b}. Use this exact comparison pair and the exact platform URL supplied below. Present practical tradeoffs, never a universal winner.`:null,
    selected?`Commercial candidate: ${selected.tool_name} (${selected.tool_slug}). Official programme material explicitly permits organic-social affiliate/referral-link promotion. Selection reason: ${commercialSelectionReason}. Target mode: direct_vendor. Build the post around a genuine use case for this tool, use the exact vendor affiliate/referral URL supplied below directly on the social platform even when redirects would also be permitted, and include a clear affiliate disclosure. Never change editorial ranking or make the post a recommendation solely because it is monetized.`:'Do not publish a direct affiliate link in this run. Use an editorial ToolScout URL only.',
    mentions.length?`Verified manufacturer/profile candidates discovered from links on their official websites: ${mentions.map(m=>`${m.name} | X ${m.x_handle||'none'} | Bluesky ${m.bluesky_handle||'none'} | LinkedIn company URL ${m.linkedin_url||'none'} | LinkedIn vanity ${m.linkedin_vanity||'none'}`).join(' ; ')}. When at least one candidate is materially relevant, prefer one verified native mention to increase qualified borrowed-audience reach. Use at most two manufacturer mentions in comparison content and at most one in discovery/practical content. Never invent or guess a handle or identity.`:'No verified manufacturer social handles are currently available. Do not invent mentions.',
    preferredMention?`Preferred native mention for this run: ${preferredMention.name}. X ${preferredMention.x_handle||'none'}; Bluesky ${preferredMention.bluesky_handle||'none'}; LinkedIn vanity ${preferredMention.linkedin_vanity||'none'}. This preferred identity is directly tied to the selected tool/comparison, so use the platform-specific verified mention exactly once when that identity exists.`:'No preferred native mention is designated for this run; do not force a tag.',
    routeCandidate?`Borrowed-audience amplification candidate from the Distribution Network: ${routeCandidate.surface_name||routeCandidate.surface_slug} via ${routeCandidate.route_type} at ${routeCandidate.route_url}. This is an alternate route, not proof of placement. Use or mention this external profile only if it is directly relevant to the post topic and the interaction is useful rather than promotional noise. Do not invent a handle, do not send a direct message, and do not force a tag when relevance is weak.`:'No alternate social distribution route is queued for this brief.',
    'Mention guardrail: maximum 2 relevant manufacturers plus at most 1 directly relevant borrowed-audience route in an editorial post. Never tag unrelated people or companies. No engagement bait.',
    selected?'Disclosure required. Use plain, conspicuous wording such as "Affiliate link: ToolScout may earn a commission if you buy through this link. This does not affect our recommendations." For X/Bluesky, "Affiliate link" is the minimum short disclosure when space is constrained.':'No affiliate disclosure is needed unless the post contains an affiliate target.',
    `LinkedIn target: ${t.linkedin}`,
    `X target: ${t.x}`,
    `Bluesky target: ${t.bluesky}`
  ].filter(Boolean).join('\n');
  if(issue){
    await env.DB.prepare(`INSERT INTO content_engine_briefs(brief_id,family,commercial_mode,selected_tool_slug,mention_json,target_json,policy_status,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`).bind(briefId,family,mode,selected?.tool_slug||(task?.subject_type==='tool'?String(task.subject_key||''):null),JSON.stringify(mentions),JSON.stringify(t),selected?.policy_status||'editorial').run();
    await env.DB.batch(Object.entries(t).map(([channel,target])=>env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'issued',datetime('now'),datetime('now'))`).bind(`${briefId}:${channel}`,growthKey,'content',channel,target))).catch(()=>{});
    if(routeCandidate){
      await env.DB.prepare(`UPDATE distribution_contact_route_actions SET status='issued_to_content',attempts=attempts+1,last_attempt_at=datetime('now'),last_result='issued_to_content_engine',updated_at=datetime('now') WHERE route_id=? AND status IN ('queued','retry_due')`).bind(routeCandidate.route_id).run().catch(()=>{});
      await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'issued',datetime('now'),datetime('now')) ON CONFLICT(action_id) DO UPDATE SET status='issued',target_url=excluded.target_url,updated_at=datetime('now')`).bind(`route-content:${routeCandidate.route_id}`,`surface:${routeCandidate.surface_slug}`,'content_route',routeCandidate.route_type,routeCandidate.route_url).run().catch(()=>{});
    }
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`contentbrief_${crypto.randomUUID()}`,'growth_content_brief_issued','completed','content_engine',briefId,`Content brief issued to the publishing pipeline with autonomous growth priority ${growthKey||'none'}, verified manufacturer mentions only, and ${routeCandidate?'one borrowed-audience route candidate':'no borrowed-audience route candidate'}.`).run().catch(()=>{});
  }
  return {issued:Boolean(issue),brief_id:briefId,execution_task_id:task?.task_id||null,growth_opportunity_key:growthKey,growth_priority_score:effectiveSprintTarget?Number(effectiveSprintTarget.priority_score||0):(selected?Number(growthRank.get(selected.tool_slug)?.score||0):null),family,commercial_mode:mode,human_acquisition_target:effectiveSprintTarget?{path:effectiveSprintTarget.subject_key,title:effectiveSprintTarget.signals?.title||null,impressions:Number(effectiveSprintTarget.signals?.impressions||0),position:Number(effectiveSprintTarget.signals?.position||0)}:null,affiliate_target_mode:targetMode,commercial_selection_reason:commercialSelectionReason,selected_tool:selected?{slug:selected.tool_slug,name:selected.tool_name}:null,comparison:comparisonContext,mentions,preferred_mention:preferredMention?{name:preferredMention.name,tool_slug:preferredMention.tool_slug,x_handle:preferredMention.x_handle,bluesky_handle:preferredMention.bluesky_handle,bluesky_did:preferredMention.bluesky_did,bluesky_facets:preferredMention.bluesky_facets,linkedin_url:preferredMention.linkedin_url,linkedin_vanity:preferredMention.linkedin_vanity}:null,alternate_distribution_route:routeCandidate?{route_id:routeCandidate.route_id,surface:routeCandidate.surface_name||routeCandidate.surface_slug,type:routeCandidate.route_type,url:routeCandidate.route_url,attempts:Number(routeCandidate.attempts||0)}:null,linkedin_target_url:t.linkedin,x_target_url:t.x,bluesky_target_url:t.bluesky,affiliate_disclosure_required:Boolean(selected),prompt_context:prompt};
}

export async function issueGrowthContentBrief(env,task=null){
  const day=new Date().getUTCDay();
  const family=day===1?'monday_discovery':day===3?'wednesday_comparison':'friday_practical';
  return buildBrief(env,family,{issue:true,task});
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

export async function runContentSocialIntelligenceCycle(env){
  await ensureSchema(env);
  await env.DB.prepare(`UPDATE growth_action_events SET status='legacy_unverified',updated_at=datetime('now') WHERE status='prepared'`).run().catch(()=>{});
  const profiles=await refreshProfiles(env),policies=await refreshPolicies(env);
  const workDone=Number(profiles.scanned||0)+Number(policies.scanned||0);
  if(workDone>0){
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`contentintel_${crypto.randomUUID()}`,'content_social_intelligence_refresh','completed','content_engine',`Content social intelligence performed ${workDone} due checks: ${profiles.scanned} profile sites and ${policies.scanned} affiliate policies. Empty no-change cycles are not persisted.`).run().catch(()=>{});
  }
  return {ok:true,profiles,policies,workDone,write_policy:'due_only'};
}

async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function proofAuthorized(request){const proof=String(request.headers.get('X-ToolScout-Proof')||'');return Boolean(proof)&&await sha256(proof)===CONTENT_PROOF_SHA256}
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
    if(u.pathname==='/api/content-engine/intelligence/refresh'&&request.method==='POST'){
      if(!(await proofAuthorized(request)))return Response.json({error:'unauthorized'},{status:401,headers:{...JSON_H,'Cache-Control':'no-store'}});
      try{return Response.json(await runContentSocialIntelligenceCycle(env),{headers:{...JSON_H,'Cache-Control':'no-store'}})}catch(error){return Response.json({error:'content_intelligence_refresh_failed',message:safe(error?.message||error,500)},{status:500,headers:{...JSON_H,'Cache-Control':'no-store'}})}
    }
        if(u.pathname==='/api/content-engine/brief'&&request.method==='GET'){
      const family=['monday_discovery','wednesday_comparison','friday_practical'].includes(u.searchParams.get('family'))?u.searchParams.get('family'):'monday_discovery';
      const issue=u.searchParams.get('issue')==='1';
      try{return Response.json(await buildBrief(env,family,{issue}),{headers:JSON_H})}catch(error){return Response.json({error:'content_intelligence_unavailable',message:safe(error?.message||error,500)},{status:503,headers:{...JSON_H,'Cache-Control':'no-store'}})}
    }
    if(u.pathname==='/api/content-engine/intelligence/metrics'&&request.method==='GET'){
      try{return Response.json(await metrics(env),{headers:JSON_H})}catch(error){return Response.json({error:'content_intelligence_metrics_unavailable',message:safe(error?.message||error,500)},{status:503,headers:{...JSON_H,'Cache-Control':'no-store'}})}
    }
    const response=await base.fetch(request,env,ctx);
    if(u.pathname.startsWith('/go/')&&u.searchParams.get('ts_affiliate')==='1'){try{await recordSocialAffiliateRedirect(request,env,u,response)}catch{}}
    return response;
  },
  async scheduled(event,env,ctx){
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

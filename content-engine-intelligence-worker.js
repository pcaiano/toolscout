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

async function refreshPolicies(env){
  await ensureSchema(env);
  const tools=await assetJson(env,'/data/tools.json',[]);
  const toolBySlug=new Map((Array.isArray(tools)?tools:[]).map(x=>[x.slug,x]));
  const activeRows=await env.DB.prepare(`SELECT tool_slug,status,program_url,application_url,evidence_json FROM affiliate_workflow WHERE status IN ('verified','active','earning','link_acquired') ORDER BY tool_slug`).all();
  const rows=await env.DB.prepare(`SELECT tool_slug,last_checked_at FROM affiliate_social_policy`).all(),by=new Map((rows.results||[]).map(x=>[x.tool_slug,x]));
  const due=(activeRows.results||[]).filter(x=>{const r=by.get(x.tool_slug);if(!r?.last_checked_at)return true;const t=Date.parse(String(r.last_checked_at).replace(' ','T')+'Z');return !Number.isFinite(t)||Date.now()-t>14*86400000}).slice(0,MAX_POLICY_SCANS);
  let scanned=0,allowed=0,unknown=0,blocked=0;
  for(const item of due){
    scanned++;
    const tool=toolBySlug.get(item.tool_slug)||{};
    const home=publicUrl(tool.sourceUrl||tool.website||tool.url);
    const direct=publicUrl(item.program_url);
    const candidates=[];
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
      if(pages.length>=4)break;
    }
    const text=pages.map(p=>stripHtml(p.html)).join(' ').slice(0,400000);
    const socialBan=SOCIAL_ALL_BAN.test(text),explicit=SOCIAL_ALLOW.test(text),socialGeneral=SOCIAL_GENERAL.test(text),paidBan=PAID_ONLY_BAN.test(text),cloakBan=CLOAK_BAN.test(text),disclosure=DISCLOSURE.test(text);
    let organic=null,directLink=null,redirect=null,status='unknown',detail='No explicit organic-social affiliate permission found in checked official programme material.';
    if(!pages.length){
      detail='No official affiliate programme terms page could be verified automatically from the active programme and official vendor site.';
      unknown++;
    }else if(socialBan){
      organic=0;directLink=0;redirect=0;status='blocked';detail='Official programme material appears to prohibit social promotion.';blocked++;
    }else if(explicit){
      organic=1;directLink=1;redirect=cloakBan?0:1;status=cloakBan?'social_allowed_direct_only':'verified_social_allowed';
      detail=`Explicit social + affiliate/referral-link language found. Paid-social restriction: ${paidBan?'yes':'no'}. Redirect/cloaking restriction: ${cloakBan?'yes':'no'}.`;allowed++;
    }else{
      unknown++;
      if(socialGeneral)detail='Social/creator language exists, but explicit permission to distribute affiliate/referral links on organic social was not verified.';
    }
    await env.DB.prepare(`INSERT INTO affiliate_social_policy(tool_slug,organic_social_allowed,direct_affiliate_link_allowed,redirect_allowed,disclosure_required,policy_status,evidence_url,evidence_detail,last_checked_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET organic_social_allowed=excluded.organic_social_allowed,direct_affiliate_link_allowed=excluded.direct_affiliate_link_allowed,redirect_allowed=excluded.redirect_allowed,disclosure_required=excluded.disclosure_required,policy_status=excluded.policy_status,evidence_url=excluded.evidence_url,evidence_detail=excluded.evidence_detail,last_checked_at=datetime('now'),updated_at=datetime('now')`)
      .bind(item.tool_slug,organic,directLink,redirect,disclosure?1:1,status,pages[0]?.url||direct?.href||home?.href||null,safe(detail,1200)).run();
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
async function buildBrief(env,family,{issue=false}={}){
  await ensureSchema(env);
  await env.DB.prepare(`UPDATE growth_action_events SET status='legacy_unverified',updated_at=datetime('now') WHERE status='prepared'`).run().catch(()=>{});
  const profiles=await env.DB.prepare(`SELECT tool_slug,tool_name,x_handle,bluesky_handle,linkedin_url,verified_at FROM content_social_profiles WHERE status='verified' ORDER BY tool_name`).all();
  let supervisor={status:null,directive:null,config:{}};
  try{const row=await env.DB.prepare(`SELECT status,directive,directive_json FROM growth_supervisor_state WHERE engine='content'`).first();if(row){let config={};try{config=JSON.parse(row.directive_json||'{}')}catch{}supervisor={status:row.status,directive:row.directive,config}}}catch{}
  const growth=await env.DB.prepare(`SELECT subject_type,subject_key,priority_score,opportunity_key FROM growth_opportunity_state WHERE status='active' AND subject_type IN ('tool','news_update') ORDER BY priority_score DESC LIMIT 80`).all().catch(()=>({results:[]}));
  const sprintGrowth=await env.DB.prepare(`SELECT subject_key,priority_score,opportunity_key,signal_json FROM growth_opportunity_state
    WHERE status='active' AND subject_type='search' AND subject_key NOT IN ('/','/tools')
      AND (opportunity_key LIKE 'sprint-search:%' OR (opportunity_key LIKE 'gsc-page:%' AND COALESCE(json_extract(signal_json,'$.evidence_confidence'),'')='meaningful'))
    ORDER BY priority_score DESC,COALESCE(CAST(json_extract(signal_json,'$.impressions') AS INTEGER),0) DESC
    LIMIT 18`).all().catch(()=>({results:[]}));
  const commercial=await env.DB.prepare(`SELECT a.tool_slug,COALESCE(p.tool_name,a.tool_slug) tool_name,p.x_handle,p.bluesky_handle,p.linkedin_url,a.policy_status,a.redirect_allowed,w.affiliate_url
    FROM affiliate_social_policy a
    JOIN affiliate_workflow w ON w.tool_slug=a.tool_slug
    LEFT JOIN content_social_profiles p ON p.tool_slug=a.tool_slug AND p.status='verified'
    WHERE a.organic_social_allowed=1 AND a.direct_affiliate_link_allowed=1
      AND a.policy_status IN ('verified_social_allowed','social_allowed_direct_only')
      AND (a.redirect_allowed=1 OR w.affiliate_url IS NOT NULL)
      AND w.status IN ('verified','active','earning','link_acquired')
    ORDER BY COALESCE(p.tool_name,a.tool_slug)`).all();
  const routeCandidates=await env.DB.prepare(`SELECT a.route_id,a.surface_slug,a.route_type,a.route_url,a.attempts,n.surface_name,n.priority_score
    FROM distribution_contact_route_actions a
    JOIN distribution_network_outreach n ON n.surface_slug=a.surface_slug
    WHERE a.execution_mode='content_amplification' AND a.status IN ('queued','retry_due')
      AND a.attempts<2
    ORDER BY n.priority_score DESC,a.updated_at ASC LIMIT 12`).all().catch(()=>({results:[]}));
  const date=new Date().toISOString().slice(0,10),all=profiles.results||[],eligible=commercial.results||[],briefId=`brief_${crypto.randomUUID()}`;
  const profileBySlug=new Map(all.map(x=>[x.tool_slug,x]));
  const growthTools=[],growthRank=new Map();for(const x of growth.results||[]){if(!x.subject_key||growthRank.has(x.subject_key))continue;const row={...x,rank:growthTools.length};growthTools.push(row);growthRank.set(x.subject_key,{rank:row.rank,score:Number(x.priority_score||0),key:x.opportunity_key,type:x.subject_type});}
  const observedSprintRows=(sprintGrowth.results||[]).map(x=>{let signals={};try{signals=JSON.parse(x.signal_json||'{}')}catch{}return{...x,signals};});
  const dedupedSprintRows=[];const seenSprintPaths=new Set();
  for(const row of observedSprintRows){const key=String(row.subject_key||'');if(!key||seenSprintPaths.has(key))continue;seenSprintPaths.add(key);dedupedSprintRows.push(row);}
  const sprintRows=dedupedSprintRows.length?dedupedSprintRows:HUMAN_ACQUISITION_FALLBACK_TARGETS;
  const sprintPool=sprintRows.slice(0,Math.min(3,sprintRows.length));
  const supervisorSearchFirst=Boolean(supervisor?.config?.search_demand_first);
  const acquisitionMode=humanAcquisitionSprintActive()||supervisorSearchFirst;
  const sprintTarget=acquisitionMode&&sprintPool.length?sprintPool[pickIndex(family+date,sprintPool.length)]:null;
  const topGrowthProfile=growthTools.map(x=>profileBySlug.get(x.subject_key)).find(Boolean)||null;
  const comparisonPairs=[
    ['make','zapier'],['hubspot','pipedrive'],['beehiiv','kit'],['jotform','typeform'],['semrush','ahrefs'],
    ['notion','clickup'],['asana','clickup'],['airtable','notion'],['n8n','make'],['tally','typeform'],
    ['brevo','mailchimp'],['activecampaign','mailchimp'],['webflow','framer'],['shopify','webflow'],['apollo','lemlist']
  ];
  const commercialAllowed=!sprintTarget&&family==='friday_practical'&&eligible.length>0;
  const growthCommercial=growthTools.map(g=>eligible.find(x=>x.tool_slug===g.subject_key)).find(Boolean)||null;
  const selected=commercialAllowed?(growthCommercial||eligible[pickIndex('commercial'+date,eligible.length)]):null;
  const growthComparison=growthTools.map(g=>comparisonPairs.find(pair=>pair.includes(g.subject_key))).find(Boolean)||null;
  const comparison=family==='wednesday_comparison'&&!sprintTarget?(growthComparison||comparisonPairs[pickIndex('comparison'+date,comparisonPairs.length)]):null;
  let mentionRows=[];
  if(sprintTarget?.signals?.tool_slug)mentionRows=[profileBySlug.get(String(sprintTarget.signals.tool_slug))].filter(Boolean);
  else if(sprintTarget)mentionRows=[];
  else if(selected)mentionRows=[profileBySlug.get(selected.tool_slug)].filter(Boolean);
  else if(comparison)mentionRows=comparison.map(slug=>profileBySlug.get(slug)).filter(Boolean);
  else if(all.length){const start=pickIndex(family+date,all.length);mentionRows=[topGrowthProfile,all[start],all[(start+1)%all.length]].filter((x,i,a)=>x&&a.findIndex(y=>y.tool_slug===x.tool_slug)===i).slice(0,2);}
  const mentions=mentionRows.map(x=>({tool_slug:x.tool_slug,name:x.tool_name,x_handle:x.x_handle?('@'+x.x_handle):null,bluesky_handle:x.bluesky_handle?('@'+x.bluesky_handle):null,linkedin_url:x.linkedin_url||null,verified_from_official_site:true}));
  const routeCandidate=(routeCandidates.results||[])[0]||null;
  const mode=selected?'affiliate_social_verified':'editorial';
  const targetMode=selected?(Number(selected.redirect_allowed)===1?'toolscout_redirect':'direct_vendor'):'editorial';
  let t=selected?(targetMode==='toolscout_redirect'?targets(selected.tool_slug):{linkedin:selected.affiliate_url,x:selected.affiliate_url,bluesky:selected.affiliate_url}):(sprintTarget?editorialTargets(family,sprintTarget.subject_key,humanAcquisitionSprintActive()?'human_acquisition_sprint':'growth_supervisor_search_demand'):editorialTargets(family));
  const growthKey=sprintTarget?sprintTarget.opportunity_key:(selected?(growthRank.get(selected.tool_slug)?.key||`tool:${selected.tool_slug}`):(comparison?(growthRank.get(comparison[0])?.key||growthRank.get(comparison[1])?.key||null):(topGrowthProfile?(growthRank.get(topGrowthProfile.tool_slug)?.key||`tool:${topGrowthProfile.tool_slug}`):null)));
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
    sprintTarget?`${humanAcquisitionSprintActive()?'Human Acquisition Sprint':'Growth Supervisor'} focus: ${sprintTarget.signals?.title||sprintTarget.subject_key}. GSC observed ${Number(sprintTarget.signals?.impressions||0)} impressions at average position ${Number(sprintTarget.signals?.position||0).toFixed(1)}. Build the post around the practical user problem behind this page and send readers to the exact ToolScout target below. Optimize for a qualified human visit, not vanity reach. Supervisor directive: ${supervisor.directive||'observed demand first'}.`:null,
    comparisonContext?`Comparison selected for this run: ${comparisonContext.tool_a} vs ${comparisonContext.tool_b}. Use this exact comparison pair and the exact platform URL supplied below. Present practical tradeoffs, never a universal winner.`:null,
    selected?`Commercial candidate: ${selected.tool_name} (${selected.tool_slug}). Official programme material explicitly permits organic-social affiliate/referral-link promotion. Target mode: ${targetMode}. ${targetMode==='direct_vendor'?'The programme restricts redirects/cloaking, so use the exact vendor affiliate URL supplied below without modification.':'The checked material allows the ToolScout redirect route.'} Include a clear affiliate disclosure. Never change editorial ranking or make the post a recommendation solely because it is monetized.`:'Do not publish a direct affiliate link in this run. Use an editorial ToolScout URL only.',
    mentions.length?`Verified manufacturer/profile candidates discovered from links on their official websites: ${mentions.map(m=>`${m.name} | X ${m.x_handle||'none'} | Bluesky ${m.bluesky_handle||'none'} | LinkedIn company URL ${m.linkedin_url||'none'}`).join(' ; ')}. Mention only when genuinely relevant to the topic. Never invent or guess a handle.`:'No verified manufacturer social handles are currently available. Do not invent mentions.',
    routeCandidate?`Borrowed-audience amplification candidate from the Distribution Network: ${routeCandidate.surface_name||routeCandidate.surface_slug} via ${routeCandidate.route_type} at ${routeCandidate.route_url}. This is an alternate route, not proof of placement. Use or mention this external profile only if it is directly relevant to the post topic and the interaction is useful rather than promotional noise. Do not invent a handle, do not send a direct message, and do not force a tag when relevance is weak.`:'No alternate social distribution route is queued for this brief.',
    'Mention guardrail: maximum 2 relevant manufacturers plus at most 1 directly relevant borrowed-audience route in an editorial post. Never tag unrelated people or companies. No engagement bait.',
    selected?'Disclosure required. Use plain, conspicuous wording such as "Affiliate link: ToolScout may earn a commission if you buy through this link. This does not affect our recommendations." For X/Bluesky, "Affiliate link" is the minimum short disclosure when space is constrained.':'No affiliate disclosure is needed unless the post contains an affiliate target.',
    `LinkedIn target: ${t.linkedin}`,
    `X target: ${t.x}`,
    `Bluesky target: ${t.bluesky}`
  ].filter(Boolean).join('\n');
  if(issue){
    await env.DB.prepare(`INSERT INTO content_engine_briefs(brief_id,family,commercial_mode,selected_tool_slug,mention_json,target_json,policy_status,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))`).bind(briefId,family,mode,selected?.tool_slug||null,JSON.stringify(mentions),JSON.stringify(t),selected?.policy_status||'editorial').run();
    await env.DB.batch(Object.entries(t).map(([channel,target])=>env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'issued',datetime('now'),datetime('now'))`).bind(`${briefId}:${channel}`,growthKey,'content',channel,target))).catch(()=>{});
    if(routeCandidate){
      await env.DB.prepare(`UPDATE distribution_contact_route_actions SET status='issued_to_content',attempts=attempts+1,last_attempt_at=datetime('now'),last_result='issued_to_content_engine',updated_at=datetime('now') WHERE route_id=? AND status IN ('queued','retry_due')`).bind(routeCandidate.route_id).run().catch(()=>{});
      await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'issued',datetime('now'),datetime('now')) ON CONFLICT(action_id) DO UPDATE SET status='issued',target_url=excluded.target_url,updated_at=datetime('now')`).bind(`route-content:${routeCandidate.route_id}`,`surface:${routeCandidate.surface_slug}`,'content_route',routeCandidate.route_type,routeCandidate.route_url).run().catch(()=>{});
    }
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`contentbrief_${crypto.randomUUID()}`,'growth_content_brief_issued','completed','content_engine',briefId,`Content brief issued to the publishing pipeline with autonomous growth priority ${growthKey||'none'}, verified manufacturer mentions only, and ${routeCandidate?'one borrowed-audience route candidate':'no borrowed-audience route candidate'}.`).run().catch(()=>{});
  }
  return {issued:Boolean(issue),brief_id:briefId,growth_opportunity_key:growthKey,growth_priority_score:sprintTarget?Number(sprintTarget.priority_score||0):(selected?Number(growthRank.get(selected.tool_slug)?.score||0):null),family,commercial_mode:mode,human_acquisition_target:sprintTarget?{path:sprintTarget.subject_key,title:sprintTarget.signals?.title||null,impressions:Number(sprintTarget.signals?.impressions||0),position:Number(sprintTarget.signals?.position||0)}:null,affiliate_target_mode:targetMode,selected_tool:selected?{slug:selected.tool_slug,name:selected.tool_name}:null,comparison:comparisonContext,mentions,alternate_distribution_route:routeCandidate?{route_id:routeCandidate.route_id,surface:routeCandidate.surface_name||routeCandidate.surface_slug,type:routeCandidate.route_type,url:routeCandidate.route_url,attempts:Number(routeCandidate.attempts||0)}:null,linkedin_target_url:t.linkedin,x_target_url:t.x,bluesky_target_url:t.bluesky,affiliate_disclosure_required:Boolean(selected),prompt_context:prompt};
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

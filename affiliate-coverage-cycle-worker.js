import {coverageEngineSnapshot,automationBoundary} from './affiliate-coverage-engine.js';
import {normalizeAffiliateState} from './affiliate-operations.js';
import {publicMergedTools} from './catalog-autonomy-worker.js';

const MAX_TOOLS_PER_CYCLE=8;
const MAX_CANDIDATES_PER_TOOL=8;
const MAX_HUMAN_REVALIDATIONS_PER_CYCLE=8;
const FETCH_TIMEOUT_MS=5500;
const RESEARCH_COOLDOWN_HOURS=12;
const PROGRAM_WORDS=/(affiliate|referral|partner(?:ship)?\s+program|partners?)/i;
const AFFILIATE_WORDS=/\baffiliates?\b/i;
const APPLY_WORDS=/(apply|join|sign\s*up|register|become\s+(?:an?\s+)?(?:affiliate|partner))/i;
const HUMAN_BLOCKERS=/(captcha|recaptcha|hcaptcha|sign\s*in|log\s*in|create\s+(?:an?\s+)?account|identity|tax\s+(?:id|information)|payment\s+details)/i;
const PAUSED_WORDS=/(not accepting|closed to new|applications? (?:are )?closed|program(?:me)? (?:is )?paused)/i;
const PUBLISHER_AUDIENCE_WORDS=/(publisher|creator|blogger|influencer|content creator|media site|website owner|newsletter|editorial|content site)/i;
const AFFILIATE_ECONOMICS_WORDS=/(commission|cookie|tracking|referral link|affiliate link|earn(?:ings)?|payout|\bcpa\b|revenue share|recurring commission)/i;
const SERVICE_PARTNER_WORDS=/(agency partner|solution partner|technology partner|implementation partner|consulting partner|services partner|app marketplace|integration partner|reseller partner)/i;
const NETWORKS=[['PartnerStack',/partnerstack/i],['Impact',/(impact\.com|impact radius)/i],['Dub',/(dub\.co|powered by dub)/i],['Awin',/awin/i],['CJ',/(commission junction|cj\.com)/i],['Rewardful',/rewardful/i],['FirstPromoter',/firstpromoter/i]];
const PROGRAM_WATCHLIST=Object.freeze({
  klaviyo:{
    origin:'https://www.klaviyo.com/',
    paths:['/affiliate','/affiliates','/affiliate-program','/referral-program'],
    audience:/(publisher|creator|blogger|influencer|affiliate)/i,
    reason:'Klaviyo K:Partners is for agency/solution and technology partners. Monitor for the separate public publisher affiliate programme.'
  },
  airtable:{
    origin:'https://www.airtable.com/',
    paths:['/affiliate','/affiliates','/affiliate-program','/referral-program'],
    audience:/(publisher|creator|blogger|influencer|affiliate)/i,
    reason:'Airtable currently exposes services/referral partner routes rather than a public publisher affiliate programme suitable for ToolScout. Monitor for a dedicated affiliate programme.'
  }
});
const PROTECTED_WATCHLIST_STATES=new Set(['submitted','pending_review','approved_needs_link','link_acquired','active','verified','earning','rejected']);
const HUMAN_DISCOVERY_STATES=new Set(['ready_to_apply','human_action_required']);
const APPLICATION_PACK=Object.freeze({
  applicant:'Pedro Caiano',
  website:'https://trytoolscout.org',
  project:'ToolScout - an independent software discovery and recommendation platform.',
  promotion_method:'Editorial recommendations, intent-based software comparisons, SEO landing pages and contextual ToolScout links. Affiliate relationships never influence recommendation ranking.',
  audience:'Small businesses, consultants, agencies, creators, sales and marketing teams, and software buyers researching tools for specific workflows.',
  why_join:'ToolScout helps high-intent software buyers narrow a large market to a small set of relevant tools. The commercial goal is to monetize qualified outbound referrals while keeping recommendations independent and transparent.',
  traffic_note:'Early-stage product. Use only currently verified first-party traffic metrics. Never invent traffic, revenue, company size or approval claims.',
  disclosure:'Affiliate relationships are disclosed publicly and do not alter ToolScout recommendation scores.'
});
let autonomySchemaReady=null;

function publicHttpUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return null;const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h==='0.0.0.0'||h==='127.0.0.1'||h==='::1'||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;return u}catch{return null}}
function sameSite(a,b){const x=String(a).replace(/^www\./,'').split('.'),y=String(b).replace(/^www\./,'').split('.');return x.slice(-2).join('.')===y.slice(-2).join('.')}
function inferNetwork(text){for(const [name,re] of NETWORKS)if(re.test(text||''))return name;return 'Direct'}
function stripHtml(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').slice(0,250000)}
function linksFromHtml(html,base){const out=[];const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(String(html||'')))&&out.length<100){try{const u=new URL(m[1],base);if(sameSite(u.hostname,new URL(base).hostname)&&PROGRAM_WORDS.test(`${m[1]} ${stripHtml(m[2])}`))out.push(u.href)}catch{}}return [...new Set(out)]}
function applicationLinksFromHtml(html,base){const out=[];const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(String(html||'')))&&out.length<150){try{const u=publicHttpUrl(new URL(m[1],base).href);if(!u)continue;const label=`${u.href} ${stripHtml(m[2])}`;if(!APPLY_WORDS.test(label))continue;const network=inferNetwork(label);if(sameSite(u.hostname,new URL(base).hostname)||network!=='Direct')out.push(u.href)}catch{}}return [...new Set(out)]}
function publisherAffiliateEvidence(page){
  const evidence=`${page?.url||''} ${page?.text||''}`;
  if(!AFFILIATE_WORDS.test(evidence))return false;
  const publisherFit=PUBLISHER_AUDIENCE_WORDS.test(page.text||'');
  const economics=AFFILIATE_ECONOMICS_WORDS.test(page.text||'');
  const serviceOnly=SERVICE_PARTNER_WORDS.test(page.text||'')&&!publisherFit&&!economics;
  return !serviceOnly&&(publisherFit||economics);
}
async function boundedFetch(url){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),FETCH_TIMEOUT_MS);try{const r=await fetch(url,{method:'GET',redirect:'follow',headers:{'User-Agent':'ToolScout-Affiliate-Coverage/1.0 (+https://trytoolscout.org/)'},signal:ctl.signal});if(!r.ok)return null;const type=r.headers.get('content-type')||'';if(!type.includes('text/html')&&!type.includes('text/plain'))return null;const text=(await r.text()).slice(0,600000),final=publicHttpUrl(r.url);if(!final)return null;return {url:final.href,html:text,text:stripHtml(text)}}catch{return null}finally{clearTimeout(timer)}}
async function loadTools(env){try{return await publicMergedTools(env)}catch{try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org/data/tools.json'));return r.ok?await r.json():[]}catch{return []}}}
async function loadAffiliateRegistry(env){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org/data/affiliate.json'));return r.ok?await r.json():{}}catch{return {}}}
async function reconcileProductionAffiliateRoutes(env){
  const registry=await loadAffiliateRegistry(env);
  let reconciled=0;
  for(const [slug,entry] of Object.entries(registry||{})){
    const url=String(entry?.url||'').trim();
    if(!entry?.enabled||!url)continue;
    const result=await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,affiliate_url,notes,source_actor,last_verified,updated_at)
      VALUES(?,'active',?,'Reconciled from active production affiliate registry.','production_registry',datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET
        status=CASE WHEN affiliate_workflow.status='verified' THEN 'verified' ELSE 'active' END,
        affiliate_url=excluded.affiliate_url,
        notes=excluded.notes,
        source_actor='production_registry',
        last_verified=datetime('now'),
        updated_at=datetime('now')
      WHERE affiliate_workflow.affiliate_url IS NOT excluded.affiliate_url
         OR affiliate_workflow.status NOT IN ('active','verified')`).bind(slug,url).run();
    reconciled+=Number(result?.meta?.changes||result?.changes||0);
  }
  return {reconciled,production_routes:Object.values(registry||{}).filter(x=>x?.enabled&&x?.url).length};
}

async function safeAll(env,sql){try{return await env.DB.prepare(sql).all()}catch{return {results:[]}}}
function recentlyChecked(lastChecked){if(!lastChecked)return false;const t=Date.parse(String(lastChecked).replace(' ','T')+'Z');return Number.isFinite(t)&&Date.now()-t<RESEARCH_COOLDOWN_HOURS*3600000}
async function ensureAffiliateAutonomySchema(env){
  if(autonomySchemaReady)return autonomySchemaReady;
  autonomySchemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliate_application_packs(
      tool_slug TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'prepared',
      network TEXT,
      application_url TEXT,
      pack_json TEXT NOT NULL,
      blocker TEXT,
      prepared_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliate_route_verification(
      tool_slug TEXT PRIMARY KEY,
      affiliate_url TEXT,
      external_status TEXT,
      external_http_status INTEGER,
      production_status TEXT,
      production_http_status INTEGER,
      production_location TEXT,
      verified_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  ]).catch(error=>{autonomySchemaReady=null;throw error});
  return autonomySchemaReady;
}
async function prepareApplicationPack(env,row){
  const slug=String(row?.tool_slug||row?.slug||'').trim().toLowerCase();if(!slug)return false;
  const applicationUrl=publicHttpUrl(row?.application_url||row?.program_url)?.href||null;if(!applicationUrl)return false;
  const pack={...APPLICATION_PACK,tool_slug:slug,tool_name:row?.name||slug,network:row?.network||'Direct',program_url:row?.program_url||null,application_url:applicationUrl,blocker:row?.blocker||null};
  const write=await env.DB.prepare(`INSERT INTO affiliate_application_packs(tool_slug,status,network,application_url,pack_json,blocker,prepared_at,updated_at)
    VALUES(?,'prepared',?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(tool_slug) DO UPDATE SET status='prepared',network=excluded.network,application_url=excluded.application_url,pack_json=excluded.pack_json,blocker=excluded.blocker,prepared_at=datetime('now'),updated_at=datetime('now')
    WHERE affiliate_application_packs.status IS NOT 'prepared'
       OR affiliate_application_packs.network IS NOT excluded.network
       OR affiliate_application_packs.application_url IS NOT excluded.application_url
       OR affiliate_application_packs.pack_json IS NOT excluded.pack_json
       OR affiliate_application_packs.blocker IS NOT excluded.blocker`)
    .bind(slug,row?.network||null,applicationUrl,JSON.stringify(pack),row?.blocker||null).run();
  return Number(write?.meta?.changes||write?.changes||0)>0;
}
async function verifyAffiliateDestination(url){
  const parsed=publicHttpUrl(url);if(!parsed)return{ok:false,status:null,finalUrl:null,reason:'invalid_public_url'};
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),FETCH_TIMEOUT_MS);
  try{
    const r=await fetch(parsed.href,{method:'GET',redirect:'follow',headers:{'User-Agent':'ToolScout-Affiliate-Route-Health/1.0 (+https://trytoolscout.org/)'},signal:ctl.signal});
    return{ok:r.status>=200&&r.status<400,status:r.status,finalUrl:r.url||parsed.href,reason:r.status>=200&&r.status<400?null:`http_${r.status}`};
  }catch(e){return{ok:false,status:null,finalUrl:null,reason:e?.name==='AbortError'?'timeout':'network_error'}}
  finally{clearTimeout(timer)}
}
async function activateAcquiredLinks(env){
  await ensureAffiliateAutonomySchema(env);
  const q=await env.DB.prepare(`SELECT w.tool_slug,w.status,w.affiliate_url
    FROM affiliate_workflow w
    LEFT JOIN affiliate_route_verification v ON v.tool_slug=w.tool_slug
    WHERE w.status IN ('link_acquired','active')
      AND w.affiliate_url IS NOT NULL AND w.affiliate_url!=''
      AND (v.tool_slug IS NULL OR v.affiliate_url IS NOT w.affiliate_url OR v.updated_at<=datetime('now','-6 hours'))
    ORDER BY COALESCE(v.updated_at,'1970-01-01') ASC,w.updated_at ASC
    LIMIT 8`).all();
  let checked=0,activated=0,verified=0,failed=0;
  for(const row of q.results||[]){
    checked++;
    const external=await verifyAffiliateDestination(row.affiliate_url);
    await env.DB.prepare(`INSERT INTO affiliate_route_verification(tool_slug,affiliate_url,external_status,external_http_status,production_status,production_http_status,production_location,verified_at,updated_at)
      VALUES(?,?,?,?,'pending',NULL,NULL,NULL,datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET affiliate_url=excluded.affiliate_url,external_status=excluded.external_status,external_http_status=excluded.external_http_status,updated_at=datetime('now')
      WHERE affiliate_route_verification.affiliate_url IS NOT excluded.affiliate_url
         OR affiliate_route_verification.external_status IS NOT excluded.external_status
         OR affiliate_route_verification.external_http_status IS NOT excluded.external_http_status`)
      .bind(row.tool_slug,row.affiliate_url,external.ok?'reachable':'failed',external.status).run();
    if(!external.ok){failed++;continue}
    if(row.status==='link_acquired'){
      await env.DB.prepare(`UPDATE affiliate_workflow SET status='active',source_actor='affiliate_autonomy',last_verified=datetime('now'),updated_at=datetime('now') WHERE tool_slug=? AND status='link_acquired'`).bind(row.tool_slug).run();
      await env.DB.prepare(`INSERT INTO affiliate_workflow_history(tool_slug,previous_state,new_state,evidence_source,actor_source,notes,created_at) VALUES(?,'link_acquired','active','affiliate_url_reachable','affiliate_autonomy','Validated affiliate destination and activated D1-backed /go route.',datetime('now'))`).bind(row.tool_slug).run().catch(()=>{});
      activated++;
    }
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),FETCH_TIMEOUT_MS);
    try{
      const r=await fetch(`https://trytoolscout.org/go/${encodeURIComponent(row.tool_slug)}`,{method:'GET',redirect:'follow',headers:{'User-Agent':'ToolScout-Affiliate-Route-Health/1.0','X-ToolScout-Health-Check':'affiliate-route'},signal:ctl.signal});
      const finalUrl=r.url||'',expectedFinalHost=publicHttpUrl(external.finalUrl||row.affiliate_url)?.hostname||'',productionFinalHost=publicHttpUrl(finalUrl)?.hostname||'';
      const ok=r.status>=200&&r.status<400&&Boolean(expectedFinalHost)&&productionFinalHost===expectedFinalHost;
      await env.DB.prepare(`UPDATE affiliate_route_verification
        SET production_status=?,production_http_status=?,production_location=?,verified_at=CASE WHEN ?='verified' THEN COALESCE(verified_at,datetime('now')) ELSE verified_at END,updated_at=datetime('now')
        WHERE tool_slug=?
          AND (production_status IS NOT ? OR production_http_status IS NOT ? OR production_location IS NOT ?)`)
        .bind(ok?'verified':'failed',r.status,finalUrl,ok?'verified':'failed',row.tool_slug,ok?'verified':'failed',r.status,finalUrl).run();
      if(ok){
        await env.DB.prepare(`UPDATE affiliate_workflow SET status='verified',source_actor='affiliate_autonomy',last_verified=datetime('now'),updated_at=datetime('now') WHERE tool_slug=? AND status IN ('active','link_acquired')`).bind(row.tool_slug).run();
        await env.DB.prepare(`INSERT INTO affiliate_workflow_history(tool_slug,previous_state,new_state,evidence_source,actor_source,notes,created_at) VALUES(?,'active','verified','production_go_redirect','affiliate_autonomy','Production /go route verified against the approved affiliate destination.',datetime('now'))`).bind(row.tool_slug).run().catch(()=>{});
        verified++;
      }else failed++;
    }catch{failed++}finally{clearTimeout(timer)}
  }
  return{checked,activated,verified,failed,write_policy:'material_change_only',recheck_hours:6};
}

async function discoverOfficialProgram(tool){
  const home=publicHttpUrl(tool.sourceUrl);if(!home)return null;
  const first=await boundedFetch(home.href);if(!first)return null;
  const directLinks=linksFromHtml(first.html,first.url),candidates=[...directLinks];
  for(const p of ['/affiliate','/affiliates','/affiliate-program','/partners','/referral-program','/referrals','/partner-program']){try{candidates.push(new URL(p,home.origin).href)}catch{}}
  for(const candidate of [...new Set(candidates)].slice(0,MAX_CANDIDATES_PER_TOOL)){
    const u=publicHttpUrl(candidate);if(!u||!sameSite(u.hostname,home.hostname))continue;
    const page=candidate===first.url?first:await boundedFetch(candidate);if(!page)continue;
    const evidence=`${page.url} ${page.text}`;if(!PROGRAM_WORDS.test(evidence)||!publisherAffiliateEvidence(page))continue;
    const paused=PAUSED_WORDS.test(page.text),human=HUMAN_BLOCKERS.test(page.text),apply=APPLY_WORDS.test(page.text),applyLinks=applicationLinksFromHtml(page.html,page.url);
    const applicationUrl=applyLinks[0]||(apply?page.url:null);
    const canApply=Boolean(applicationUrl);
    return {official_program_url:page.url,application_url:applicationUrl,network:inferNetwork(`${evidence} ${applyLinks.join(' ')}`),status:paused?'paused':(canApply?(human?'human_action_required':'ready_to_apply'):'program_exists'),automation_mode:paused?'blocked':(canApply?(human?'human':'prepare'):'research'),confidence:directLinks.includes(candidate)?97:92,blocker:paused?'Programme appears closed or paused':(canApply&&human?'Authentication, CAPTCHA or owner information appears required':(!canApply?'Affiliate programme confirmed but no verified application route found':null)),evidence:[{type:'official_publisher_affiliate_program',url:page.url,application_url:applicationUrl,checked_at:new Date().toISOString()}]};
  }
  return null;
}

async function discoverWatchlistProgram(config){
  const home=publicHttpUrl(config.origin);if(!home)return null;
  for(const path of config.paths){
    let candidate;try{candidate=new URL(path,home.origin).href}catch{continue}
    const page=await boundedFetch(candidate);if(!page)continue;
    const evidence=`${page.url} ${page.text}`;
    if(!publisherAffiliateEvidence(page)||!config.audience.test(page.text)||!APPLY_WORDS.test(page.text))continue;
    const paused=PAUSED_WORDS.test(page.text),human=HUMAN_BLOCKERS.test(page.text),applyLinks=applicationLinksFromHtml(page.html,page.url);
    if(paused)return null;
    return {official_program_url:page.url,application_url:applyLinks[0]||page.url,network:inferNetwork(`${evidence} ${applyLinks.join(' ')}`),status:human?'human_action_required':'ready_to_apply',automation_mode:human?'human':'prepare',confidence:97,blocker:human?'Authentication, CAPTCHA or owner information appears required':null,evidence:[{type:'official_affiliate_watchlist',url:page.url,application_url:applyLinks[0]||page.url,checked_at:new Date().toISOString()}]};
  }
  return null;
}

async function persistWatchlist(env,slug,config,result=null){
  if(result){
    await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,official_program_url,application_url,network,evidence_json,automation_mode,confidence,blocker,last_checked,updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,official_program_url=excluded.official_program_url,application_url=excluded.application_url,network=excluded.network,evidence_json=excluded.evidence_json,automation_mode=excluded.automation_mode,confidence=excluded.confidence,blocker=excluded.blocker,last_checked=datetime('now'),updated_at=datetime('now')`).bind(slug,result.status,result.official_program_url,result.application_url,result.network,JSON.stringify(result.evidence||[]),result.automation_mode,result.confidence,result.blocker).run();
    await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,network,program_url,application_url,blocker,evidence_json,source_actor,last_verified,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,network=COALESCE(excluded.network,affiliate_workflow.network),program_url=excluded.program_url,application_url=excluded.application_url,blocker=excluded.blocker,evidence_json=excluded.evidence_json,source_actor=excluded.source_actor,last_verified=datetime('now'),updated_at=datetime('now')`).bind(slug,result.status,result.network,result.official_program_url,result.application_url,result.blocker,JSON.stringify(result.evidence||[]),'affiliate_watchlist').run();
    return;
  }
  const evidence=JSON.stringify([{type:'watchlist_policy',reason:config.reason,checked_at:new Date().toISOString()}]);
  await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,evidence_json,automation_mode,confidence,blocker,last_checked,updated_at) VALUES(?,'watchlist',?,'monitor',100,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status='watchlist',official_program_url=NULL,application_url=NULL,evidence_json=excluded.evidence_json,automation_mode='monitor',confidence=100,blocker=excluded.blocker,last_checked=datetime('now'),updated_at=datetime('now')`).bind(slug,evidence,config.reason).run();
  await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,network,program_url,application_url,blocker,evidence_json,source_actor,last_verified,updated_at) VALUES(?,'watchlist','Direct',NULL,NULL,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status='watchlist',program_url=NULL,application_url=NULL,blocker=excluded.blocker,evidence_json=excluded.evidence_json,source_actor=excluded.source_actor,last_verified=datetime('now'),updated_at=datetime('now')`).bind(slug,config.reason,evidence,'affiliate_watchlist').run();
}

async function persistDiscovery(env,slug,result){
  await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,official_program_url,application_url,network,evidence_json,automation_mode,confidence,blocker,last_checked,updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,official_program_url=excluded.official_program_url,application_url=excluded.application_url,network=excluded.network,evidence_json=excluded.evidence_json,automation_mode=excluded.automation_mode,confidence=excluded.confidence,blocker=excluded.blocker,last_checked=datetime('now'),updated_at=datetime('now')`).bind(slug,result.status,result.official_program_url,result.application_url,result.network,JSON.stringify(result.evidence||[]),result.automation_mode,result.confidence,result.blocker).run();
  const existing=await env.DB.prepare('SELECT status FROM affiliate_workflow WHERE tool_slug=?').bind(slug).first(),current=normalizeAffiliateState(existing?.status);
  if(['research_required','program_exists','ready_to_apply','human_action_required'].includes(current))await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,network,program_url,application_url,blocker,evidence_json,source_actor,last_verified,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,network=COALESCE(excluded.network,affiliate_workflow.network),program_url=excluded.program_url,application_url=excluded.application_url,blocker=excluded.blocker,evidence_json=excluded.evidence_json,source_actor=excluded.source_actor,last_verified=datetime('now'),updated_at=datetime('now')`).bind(slug,result.status,result.network,result.official_program_url,result.application_url,result.blocker,JSON.stringify(result.evidence||[]),'affiliate_coverage_engine').run();
}

async function revalidateHumanDiscovery(env,row){
  const url=publicHttpUrl(row.application_url||row.program_url);if(!url)return false;
  const page=await boundedFetch(url.href);if(!page||!publisherAffiliateEvidence(page)||!APPLY_WORDS.test(`${page.url} ${page.text}`))return false;
  return true;
}
async function downgradeUnqualifiedHumanDiscovery(env,row,reason){
  const evidence=JSON.stringify([{type:'qualification_guardrail',reason,checked_at:new Date().toISOString()}]);
  await env.DB.prepare(`UPDATE affiliate_workflow SET status='research_required',program_url=NULL,application_url=NULL,blocker=?,evidence_json=?,source_actor='affiliate_qualification_guardrail',last_verified=datetime('now'),updated_at=datetime('now') WHERE tool_slug=? AND status IN ('ready_to_apply','human_action_required')`).bind(reason,evidence,row.tool_slug).run();
  await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,evidence_json,automation_mode,confidence,blocker,last_checked,updated_at) VALUES(?,'research_required',?,'research',0,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status='research_required',official_program_url=NULL,application_url=NULL,evidence_json=excluded.evidence_json,automation_mode='research',confidence=0,blocker=excluded.blocker,last_checked=datetime('now'),updated_at=datetime('now')`).bind(row.tool_slug,evidence,reason).run();
}

export async function runAffiliateCoverageCycle(env){
  await ensureAffiliateAutonomySchema(env);
  const production_reconciliation=await reconcileProductionAffiliateRoutes(env);
  const [tools,workflow,clicks,discoveries]=await Promise.all([
    loadTools(env),
    safeAll(env,'SELECT * FROM affiliate_workflow'),
    safeAll(env,`SELECT tool_slug,affiliate_active_at_click,source,1 verified_outbound,COUNT(*) clicks
    FROM verified_outbound_events
    WHERE created_at>=datetime('now','-30 days')
      AND source NOT IN ('internal-test','synthetic','health-check','ci')
    GROUP BY tool_slug,affiliate_active_at_click,source`),
    safeAll(env,'SELECT tool_slug,last_checked,status FROM affiliate_program_discovery')
  ]);
  const states=new Map((workflow.results||[]).map(r=>[r.tool_slug,r])),checked=new Map((discoveries.results||[]).map(r=>[r.tool_slug,r]));
  let watchlist_checked=0,watchlist_promoted=0;
  for(const [slug,config] of Object.entries(PROGRAM_WATCHLIST)){
    const current=normalizeAffiliateState(states.get(slug)?.status);
    if(PROTECTED_WATCHLIST_STATES.has(current))continue;
    const prior=checked.get(slug);
    if(prior&&recentlyChecked(prior.last_checked)&&current==='watchlist')continue;
    watchlist_checked++;
    const result=await discoverWatchlistProgram(config);
    if(result){watchlist_promoted++;await persistWatchlist(env,slug,config,result);states.set(slug,{...(states.get(slug)||{}),status:result.status,network:result.network,program_url:result.official_program_url,application_url:result.application_url,blocker:result.blocker});}
    else{await persistWatchlist(env,slug,config);states.set(slug,{...(states.get(slug)||{}),status:'watchlist',network:'Direct',program_url:null,application_url:null,blocker:config.reason});}
  }
  let human_revalidated=0,human_downgraded=0;
  for(const row of workflow.results||[]){
    if(human_revalidated>=MAX_HUMAN_REVALIDATIONS_PER_CYCLE)break;
    if(PROGRAM_WATCHLIST[row.tool_slug]||!HUMAN_DISCOVERY_STATES.has(normalizeAffiliateState(row.status)))continue;
    human_revalidated++;
    if(await revalidateHumanDiscovery(env,row))continue;
    human_downgraded++;
    const reason='Removed from Human Action: no verified publisher affiliate programme and actionable application route were confirmed.';
    await downgradeUnqualifiedHumanDiscovery(env,row,reason);
    states.set(row.tool_slug,{...row,status:'research_required',program_url:null,application_url:null,blocker:reason});
  }
  const records=tools.map(t=>{const s=states.get(t.slug)||{};return {...t,status:normalizeAffiliateState(s.status),network:s.network||null,blocker:s.blocker||null,submitted_at:s.submitted_at||null,application_url:s.application_url||null,program_url:s.program_url||null}}),snapshot=coverageEngineSnapshot(records,clicks.results||[]);
  let application_packs_prepared=0;
  for(const record of records){if(['ready_to_apply','human_action_required','approved_needs_link'].includes(record.status)&&await prepareApplicationPack(env,{...record,tool_slug:record.slug}))application_packs_prepared++;}
  await env.DB.prepare('INSERT INTO affiliate_coverage_runs(human_outbound_clicks,monetized_human_outbound_clicks,unmonetized_human_outbound_clicks,weighted_coverage,queue_size) VALUES(?,?,?,?,?)').bind(snapshot.human_outbound_clicks,snapshot.monetized_human_outbound_clicks,snapshot.unmonetized_human_outbound_clicks,snapshot.weighted_coverage,snapshot.recoverable_queue.length).run();
  let researched=0,found=0,human=0,cooldown_skipped=0;
  for(const queued of snapshot.recoverable_queue){
    if(researched>=MAX_TOOLS_PER_CYCLE)break;
    if(PROGRAM_WATCHLIST[queued.slug])continue;
    const prior=checked.get(queued.slug);if(prior&&recentlyChecked(prior.last_checked)){cooldown_skipped++;continue}
    const tool=tools.find(t=>t.slug===queued.slug);if(!tool||!tool.sourceUrl)continue;
    const boundary=automationBoundary(queued);if(boundary.mode!=='research')continue;
    researched++;
    const result=await discoverOfficialProgram(tool);
    if(!result){await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,evidence_json,automation_mode,confidence,last_checked,updated_at) VALUES(?,'research_required','[]','research',0,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status='research_required',official_program_url=NULL,application_url=NULL,automation_mode='research',confidence=0,last_checked=datetime('now'),updated_at=datetime('now')`).bind(tool.slug).run();continue}
    found++;if(result.automation_mode==='human')human++;await persistDiscovery(env,tool.slug,result);
  }
  const route_activation=await activateAcquiredLinks(env);
  return {ok:true,production_reconciliation,coverage:{human_outbound:snapshot.human_outbound_clicks,monetized:snapshot.monetized_human_outbound_clicks,unmonetized:snapshot.unmonetized_human_outbound_clicks,weighted:snapshot.weighted_coverage,traffic_truth:snapshot.traffic_truth},queue_size:snapshot.recoverable_queue.length,application_packs_prepared,route_activation,watchlist:{checked:watchlist_checked,promoted:watchlist_promoted},qualification_guardrail:{revalidated:human_revalidated,downgraded:human_downgraded,per_cycle_limit:MAX_HUMAN_REVALIDATIONS_PER_CYCLE},research:{processed:researched,programs_found:found,human_actions:human,cooldown_skipped,per_cycle_limit:MAX_TOOLS_PER_CYCLE,cooldown_hours:RESEARCH_COOLDOWN_HOURS},guardrail:'The production affiliate registry is canonical for active monetized routes. Any enabled route with an affiliate URL is reconciled into D1 before coverage is calculated. Human Action is limited to authentication, CAPTCHA, legal/terms acceptance, identity/tax/payment data or final third-party submission when required.'};
}
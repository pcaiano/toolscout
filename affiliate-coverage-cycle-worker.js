import {coverageEngineSnapshot,automationBoundary} from './affiliate-coverage-engine.js';
import {normalizeAffiliateState} from './affiliate-operations.js';

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
async function loadTools(env){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org/data/tools.json'));return r.ok?await r.json():[]}catch{return []}}
async function safeAll(env,sql){try{return await env.DB.prepare(sql).all()}catch{return {results:[]}}}
function recentlyChecked(lastChecked){if(!lastChecked)return false;const t=Date.parse(String(lastChecked).replace(' ','T')+'Z');return Number.isFinite(t)&&Date.now()-t<RESEARCH_COOLDOWN_HOURS*3600000}

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
    return {official_program_url:page.url,application_url:applicationUrl,network:inferNetwork(`${evidence} ${applyLinks.join(' ')}`),status:paused?'paused':(canApply?(human?'human_action_required':'ready_to_apply'):'program_exists'),automation_mode:paused?'blocked':(canApply?'human':'research'),confidence:directLinks.includes(candidate)?97:92,blocker:paused?'Programme appears closed or paused':(canApply&&human?'Authentication, CAPTCHA or owner information appears required':(!canApply?'Affiliate programme confirmed but no verified application route found':null)),evidence:[{type:'official_publisher_affiliate_program',url:page.url,application_url:applicationUrl,checked_at:new Date().toISOString()}]};
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
    return {official_program_url:page.url,application_url:applyLinks[0]||page.url,network:inferNetwork(`${evidence} ${applyLinks.join(' ')}`),status:human?'human_action_required':'ready_to_apply',automation_mode:'human',confidence:97,blocker:human?'Authentication, CAPTCHA or owner information appears required':null,evidence:[{type:'official_affiliate_watchlist',url:page.url,application_url:applyLinks[0]||page.url,checked_at:new Date().toISOString()}]};
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
  const [tools,workflow,clicks,discoveries]=await Promise.all([
    loadTools(env),
    safeAll(env,'SELECT * FROM affiliate_workflow'),
    safeAll(env,`WITH confirmed_sessions AS (
      SELECT DISTINCT session_id
      FROM funnel_events
      WHERE event_type='page_confirmed'
    )
    SELECT c.tool_slug,c.affiliate_active_at_click,c.source,COALESCE(s.classification,'unknown/legacy') classification,1 browser_confirmed,COUNT(*) clicks
    FROM click_events c
    JOIN confirmed_sessions confirmed ON confirmed.session_id=c.session_id
    LEFT JOIN sessions s ON s.session_id=c.session_id
    WHERE c.created_at>=datetime('now','-30 days')
    GROUP BY c.tool_slug,c.affiliate_active_at_click,c.source,classification`),
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
  const records=tools.map(t=>{const s=states.get(t.slug)||{};return {...t,status:normalizeAffiliateState(s.status),network:s.network||null,blocker:s.blocker||null,submitted_at:s.submitted_at||null}}),snapshot=coverageEngineSnapshot(records,clicks.results||[]);
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
  return {ok:true,coverage:{human_outbound:snapshot.human_outbound_clicks,monetized:snapshot.monetized_human_outbound_clicks,unmonetized:snapshot.unmonetized_human_outbound_clicks,weighted:snapshot.weighted_coverage,traffic_truth:snapshot.traffic_truth},queue_size:snapshot.recoverable_queue.length,watchlist:{checked:watchlist_checked,promoted:watchlist_promoted},qualification_guardrail:{revalidated:human_revalidated,downgraded:human_downgraded,per_cycle_limit:MAX_HUMAN_REVALIDATIONS_PER_CYCLE},research:{processed:researched,programs_found:found,human_actions:human,cooldown_skipped,per_cycle_limit:MAX_TOOLS_PER_CYCLE,cooldown_hours:RESEARCH_COOLDOWN_HOURS},guardrail:'Human Action requires verified publisher affiliate evidence plus an actionable application route. No CAPTCHA bypass, legal acceptance, identity/payment submission, or unverified automatic application.'};
}
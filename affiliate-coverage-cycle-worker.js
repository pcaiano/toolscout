import {coverageEngineSnapshot,automationBoundary} from './affiliate-coverage-engine.js';
import {normalizeAffiliateState} from './affiliate-operations.js';

const MAX_TOOLS_PER_CYCLE=8;
const MAX_CANDIDATES_PER_TOOL=8;
const FETCH_TIMEOUT_MS=5500;
const RESEARCH_COOLDOWN_HOURS=12;
const PROGRAM_WORDS=/(affiliate|referral|partner(?:ship)?\s+program|partners?)/i;
const APPLY_WORDS=/(apply|join|sign\s*up|register|become\s+(?:an?\s+)?(?:affiliate|partner))/i;
const HUMAN_BLOCKERS=/(captcha|recaptcha|hcaptcha|sign\s*in|log\s*in|create\s+(?:an?\s+)?account|identity|tax\s+(?:id|information)|payment\s+details)/i;
const PAUSED_WORDS=/(not accepting|closed to new|applications? (?:are )?closed|program(?:me)? (?:is )?paused)/i;
const NETWORKS=[['PartnerStack',/partnerstack/i],['Impact',/(impact\.com|impact radius)/i],['Dub',/(dub\.co|powered by dub)/i],['Awin',/awin/i],['CJ',/(commission junction|cj\.com)/i],['Rewardful',/rewardful/i],['FirstPromoter',/firstpromoter/i]];

function publicHttpUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return null;const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h==='0.0.0.0'||h==='127.0.0.1'||h==='::1'||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;return u}catch{return null}}
function sameSite(a,b){const x=String(a).replace(/^www\./,'').split('.'),y=String(b).replace(/^www\./,'').split('.');return x.slice(-2).join('.')===y.slice(-2).join('.')}
function inferNetwork(text){for(const [name,re] of NETWORKS)if(re.test(text||''))return name;return 'Direct'}
function stripHtml(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').slice(0,250000)}
function linksFromHtml(html,base){const out=[];const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(String(html||'')))&&out.length<100){try{const u=new URL(m[1],base);if(sameSite(u.hostname,new URL(base).hostname)&&PROGRAM_WORDS.test(`${m[1]} ${stripHtml(m[2])}`))out.push(u.href)}catch{}}return [...new Set(out)]}
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
    const evidence=`${page.url} ${page.text}`;if(!PROGRAM_WORDS.test(evidence))continue;
    const paused=PAUSED_WORDS.test(page.text),human=HUMAN_BLOCKERS.test(page.text),apply=APPLY_WORDS.test(page.text);
    return {official_program_url:page.url,application_url:apply?page.url:null,network:inferNetwork(evidence),status:paused?'paused':(human?'human_action_required':'program_exists'),automation_mode:paused?'blocked':(human?'human':'research'),confidence:directLinks.includes(candidate)?95:88,blocker:paused?'Programme appears closed or paused':(human?'Authentication, CAPTCHA or owner information appears required':null),evidence:[{type:'official_site',url:page.url,checked_at:new Date().toISOString()}]};
  }
  return null;
}

async function persistDiscovery(env,slug,result){
  await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,official_program_url,application_url,network,evidence_json,automation_mode,confidence,blocker,last_checked,updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,official_program_url=excluded.official_program_url,application_url=excluded.application_url,network=excluded.network,evidence_json=excluded.evidence_json,automation_mode=excluded.automation_mode,confidence=excluded.confidence,blocker=excluded.blocker,last_checked=datetime('now'),updated_at=datetime('now')`).bind(slug,result.status,result.official_program_url,result.application_url,result.network,JSON.stringify(result.evidence||[]),result.automation_mode,result.confidence,result.blocker).run();
  const existing=await env.DB.prepare('SELECT status FROM affiliate_workflow WHERE tool_slug=?').bind(slug).first(),current=normalizeAffiliateState(existing?.status);
  if(['research_required','program_exists','ready_to_apply'].includes(current))await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,network,program_url,application_url,blocker,evidence_json,source_actor,last_verified,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,network=COALESCE(excluded.network,affiliate_workflow.network),program_url=COALESCE(excluded.program_url,affiliate_workflow.program_url),application_url=COALESCE(excluded.application_url,affiliate_workflow.application_url),blocker=excluded.blocker,evidence_json=excluded.evidence_json,source_actor=excluded.source_actor,last_verified=datetime('now'),updated_at=datetime('now')`).bind(slug,result.status,result.network,result.official_program_url,result.application_url,result.blocker,JSON.stringify(result.evidence||[]),'affiliate_coverage_engine').run();
}

export async function runAffiliateCoverageCycle(env){
  const [tools,workflow,clicks,discoveries]=await Promise.all([
    loadTools(env),safeAll(env,'SELECT * FROM affiliate_workflow'),safeAll(env,"SELECT c.tool_slug,c.affiliate_active_at_click,c.source,COALESCE(s.classification,'unknown/legacy') classification,COUNT(*) clicks FROM click_events c LEFT JOIN sessions s ON s.session_id=c.session_id WHERE c.created_at>=datetime('now','-30 days') GROUP BY c.tool_slug,c.affiliate_active_at_click,c.source,classification"),safeAll(env,'SELECT tool_slug,last_checked,status FROM affiliate_program_discovery')
  ]);
  const states=new Map((workflow.results||[]).map(r=>[r.tool_slug,r])),checked=new Map((discoveries.results||[]).map(r=>[r.tool_slug,r]));
  const records=tools.map(t=>{const s=states.get(t.slug)||{};return {...t,status:normalizeAffiliateState(s.status),network:s.network||null,blocker:s.blocker||null,submitted_at:s.submitted_at||null}}),snapshot=coverageEngineSnapshot(records,clicks.results||[]);
  await env.DB.prepare('INSERT INTO affiliate_coverage_runs(human_outbound_clicks,monetized_human_outbound_clicks,unmonetized_human_outbound_clicks,weighted_coverage,queue_size) VALUES(?,?,?,?,?)').bind(snapshot.human_outbound_clicks,snapshot.monetized_human_outbound_clicks,snapshot.unmonetized_human_outbound_clicks,snapshot.weighted_coverage,snapshot.recoverable_queue.length).run();
  let researched=0,found=0,human=0,cooldown_skipped=0;
  for(const queued of snapshot.recoverable_queue){
    if(researched>=MAX_TOOLS_PER_CYCLE)break;
    const prior=checked.get(queued.slug);if(prior&&recentlyChecked(prior.last_checked)){cooldown_skipped++;continue}
    const tool=tools.find(t=>t.slug===queued.slug);if(!tool||!tool.sourceUrl)continue;
    const boundary=automationBoundary(queued);if(boundary.mode!=='research')continue;
    researched++;
    const result=await discoverOfficialProgram(tool);
    if(!result){await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,evidence_json,automation_mode,confidence,last_checked,updated_at) VALUES(?,'research_required','[]','research',0,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status='research_required',last_checked=datetime('now'),updated_at=datetime('now')`).bind(tool.slug).run();continue}
    found++;if(result.automation_mode==='human')human++;await persistDiscovery(env,tool.slug,result);
  }
  return {ok:true,coverage:{human_outbound:snapshot.human_outbound_clicks,monetized:snapshot.monetized_human_outbound_clicks,unmonetized:snapshot.unmonetized_human_outbound_clicks,weighted:snapshot.weighted_coverage},queue_size:snapshot.recoverable_queue.length,research:{processed:researched,programs_found:found,human_actions:human,cooldown_skipped,per_cycle_limit:MAX_TOOLS_PER_CYCLE,cooldown_hours:RESEARCH_COOLDOWN_HOURS},guardrail:'No CAPTCHA bypass, legal acceptance, identity/payment submission, or unverified automatic application.'};
}

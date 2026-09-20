import base from './distribution-embed-worker.js';
import {runWithLedger} from './engine-run-ledger.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const NETWORK_TYPES=/(newsletter|editorial|media|journal|syndication|resource|community|distribution_surface)/i;
const ROLE_PRIORITY=['editorial','editor','partnerships','partners','partner','submissions','submit','newsletter','press','media','growth','marketing','hello','contact'];
const MAX_CANDIDATES_PER_CYCLE=24;
const MAX_CONTACT_SCANS=6;
const MAX_PAGES_PER_SITE=3;
const ROUTE_PRIORITY={form:0,linkedin:1,x:2,bluesky:3,github:4};
const MAX_ROUTE_ACTIONS_PER_CYCLE=16;
const ROUTE_CONTENT_RETRY_HOURS=72;
const MAX_ROUTE_CONTENT_ATTEMPTS=2;
let schemaReady=null;

const safe=(v,n=2000)=>String(v??'').slice(0,n);
function hostOf(v){try{return new URL(String(v||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function roleScore(email){const local=String(email||'').split('@')[0].toLowerCase();const i=ROLE_PRIORITY.findIndex(x=>local===x||local.includes(x));return i<0?999:i}
function cleanEmail(v){return String(v||'').trim().replace(/^mailto:/i,'').split('?')[0].toLowerCase()}
function isRoleEmail(email,domain){const p=String(email||'').split('@');return p.length===2&&p[1].replace(/^www\./,'')===domain&&roleScore(email)<999}
function extractEmails(html,domain){const out=new Set();for(const m of String(html||'').matchAll(/mailto:([^"'<>\s?]+)/ig)){const e=cleanEmail(m[1]);if(isRoleEmail(e,domain))out.add(e)}for(const m of String(html||'').matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)){const e=cleanEmail(m[0]);if(isRoleEmail(e,domain))out.add(e)}return [...out].sort((a,b)=>roleScore(a)-roleScore(b))}
function contactLinks(html,baseUrl){const links=[];for(const m of String(html||'').matchAll(/href=["']([^"']+)["']/ig)){try{const u=new URL(m[1],baseUrl),txt=(m[0]+' '+u.pathname).toLowerCase();if(u.origin===new URL(baseUrl).origin&&/(partner|submit|editor|newsletter|press|media|contact|marketing|about)/.test(txt))links.push(u.href)}catch{}}return [...new Set(links)].slice(0,MAX_PAGES_PER_SITE-1)}
function discoverRoutes(html,baseUrl,domain){
  const out=[];
  for(const m of String(html||'').matchAll(/href=["']([^"']+)["']/ig)){
    let u;try{u=new URL(m[1],baseUrl)}catch{continue}
    if(!['https:','http:'].includes(u.protocol))continue;
    const h=u.hostname.toLowerCase().replace(/^www\./,'');
    const p=u.pathname.toLowerCase();
    let type=null;
    if(h===domain&&/(contact|submit|pitch|editor|partner|write-for-us|contribute)/.test(p))type='form';
    else if((h==='x.com'||h==='twitter.com')&&!/(intent|share|search)/.test(p))type='x';
    else if(h==='linkedin.com'&&/\/company\//.test(p))type='linkedin';
    else if(h==='bsky.app'&&/\/profile\//.test(p))type='bluesky';
    else if(h==='github.com'&&u.pathname.split('/').filter(Boolean).length===1)type='github';
    if(type)out.push({type,url:u.href.split('#')[0],source_url:baseUrl});
  }
  const seen=new Set();
  return out.filter(x=>{const k=x.type+'|'+x.url;if(seen.has(k))return false;seen.add(k);return true})
    .sort((a,b)=>(ROUTE_PRIORITY[a.type]??99)-(ROUTE_PRIORITY[b.type]??99)).slice(0,8);
}
async function fetchHtml(url){try{const r=await fetch(url,{headers:{'User-Agent':'ToolScout Distribution Network/2.1 (+https://trytoolscout.org)','Accept':'text/html'},redirect:'follow',signal:AbortSignal.timeout(7000)});if(!r.ok||!(r.headers.get('content-type')||'').includes('text/html'))return null;return {url:r.url,html:(await r.text()).slice(0,400000)}}catch{return null}}
async function authorized(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}
async function routeHash(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16)}
function routeMode(type){return ['x','bluesky','linkedin'].includes(String(type||''))?'content_amplification':'autonomous_qualification'}
function routeNextAction(type){
  if(type==='form')return 'Autonomously qualify this public contact/submission route. Execute only through a verified no-auth safe adapter; otherwise expose the exact human gate.';
  if(type==='github')return 'Autonomously inspect the public GitHub organisation route for a safe machine-resolvable contact or contribution path; do not create unsolicited issues.';
  return 'Feed this verified public social route into the Content Engine as a borrowed-audience amplification candidate. Mention or engage only when directly relevant and non-spammy.';
}

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS distribution_network_outreach (
      surface_slug TEXT PRIMARY KEY,
      surface_name TEXT NOT NULL,
      surface_type TEXT,
      domain TEXT NOT NULL,
      source_url TEXT NOT NULL,
      priority_score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      contact_email TEXT,
      contact_source_url TEXT,
      contact_checked_at TEXT,
      discovery_attempts INTEGER NOT NULL DEFAULT 0,
      suggested_subject TEXT,
      suggested_body TEXT,
      public_dispatch_token TEXT UNIQUE,
      public_dispatch_leased_at TEXT,
      outreach_sent_at TEXT,
      outreach_error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      adopted_at TEXT,
      adoption_kind TEXT,
      last_observed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS distribution_contact_routes (
      route_id TEXT PRIMARY KEY,
      surface_slug TEXT NOT NULL,
      domain TEXT NOT NULL,
      route_type TEXT NOT NULL,
      route_url TEXT NOT NULL,
      source_url TEXT,
      status TEXT NOT NULL DEFAULT 'discovered',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_contact_routes_surface ON distribution_contact_routes(surface_slug,status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_contact_routes_domain ON distribution_contact_routes(domain,route_type)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS distribution_contact_route_actions (
      route_id TEXT PRIMARY KEY,
      surface_slug TEXT NOT NULL,
      route_type TEXT NOT NULL,
      route_url TEXT NOT NULL,
      execution_mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      opportunity_slug TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      last_result TEXT,
      next_action TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_contact_route_actions_status ON distribution_contact_route_actions(status,updated_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_contact_route_actions_surface ON distribution_contact_route_actions(surface_slug,status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_network_status_priority ON distribution_network_outreach(status,priority_score DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_network_domain ON distribution_network_outreach(domain)`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}

function outreachCopy(row){
  const name=safe(row.surface_name||row.domain,180);
  const subject=`Free ToolScout software decision feed for ${name}`;
  const body=`<p>Hello,</p><p>I'm Pedro Caiano from ToolScout. We publish independent software comparisons, buying guides and tool recommendations for people choosing software for a specific job.</p><p>We make the ToolScout decision feed and embeddable Finder, Compare and Pick components available free to publishers. There is no paid placement, reciprocal link or exclusivity requirement.</p><p>If this is useful for ${safe(name,180)}, the publisher kit is here:<br><a href="https://trytoolscout.org/distribution/publisher-kit">https://trytoolscout.org/distribution/publisher-kit</a></p><p>Decision feed:<br><a href="https://trytoolscout.org/api/distribution/feed.json">https://trytoolscout.org/api/distribution/feed.json</a></p><p>Best regards,<br>Pedro Caiano<br>ToolScout<br><a href="https://trytoolscout.org">trytoolscout.org</a></p>`;
  return {subject,body};
}

async function refreshCandidates(env){
  await ensureSchema(env);
  const [opps,vendors]=await Promise.all([
    env.DB.prepare(`SELECT o.surface_slug,o.surface_name,o.surface_type,o.action_url,o.distribution_score,o.status,
      n.surface_slug AS network_existing,n.status AS network_status,n.source_url AS network_source_url,n.updated_at AS network_updated_at
      FROM distribution_opportunities o
      LEFT JOIN distribution_network_outreach n ON n.surface_slug=o.surface_slug
      WHERE o.action_url IS NOT NULL
        AND o.surface_type!='publisher_contact_route'
        AND o.status NOT IN ('policy_blocked','rejected','skipped','unavailable_free')
        AND (
          n.surface_slug IS NULL
          OR n.status IN ('queued','send_failed')
          OR (
            n.status='suppressed_no_contact'
            AND (n.source_url!=o.action_url OR n.updated_at<=datetime('now','-30 days'))
          )
        )
      ORDER BY CASE WHEN n.surface_slug IS NULL THEN 0 ELSE 1 END,o.distribution_score DESC
      LIMIT 120`).all(),
    env.DB.prepare(`SELECT DISTINCT lower(vendor_domain) domain FROM distribution_vendor_amplification WHERE vendor_domain IS NOT NULL`).all().catch(()=>({results:[]}))
  ]);
  const vendorDomains=new Set((vendors.results||[]).map(x=>String(x.domain||'').replace(/^www\./,'')));
  let considered=0,queued=0,newQueued=0,reopened=0;
  for(const row of opps.results||[]){
    if(considered>=MAX_CANDIDATES_PER_CYCLE)break;
    if(!NETWORK_TYPES.test(String(row.surface_type||'')))continue;
    const domain=hostOf(row.action_url);
    if(!domain||domain==='trytoolscout.org'||vendorDomains.has(domain))continue;
    considered++;
    const copy=outreachCopy({...row,domain});
    const r=await env.DB.prepare(`INSERT INTO distribution_network_outreach(surface_slug,surface_name,surface_type,domain,source_url,priority_score,status,suggested_subject,suggested_body,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'queued',?,?,datetime('now'),datetime('now'))
      ON CONFLICT(surface_slug) DO UPDATE SET
        surface_name=excluded.surface_name,
        surface_type=excluded.surface_type,
        domain=excluded.domain,
        source_url=excluded.source_url,
        priority_score=excluded.priority_score,
        suggested_subject=excluded.suggested_subject,
        suggested_body=excluded.suggested_body,
        status=CASE
          WHEN distribution_network_outreach.status IN ('contact_route_found','contact_found','sent','adopted') THEN distribution_network_outreach.status
          WHEN distribution_network_outreach.status='suppressed_no_contact'
            AND distribution_network_outreach.source_url=excluded.source_url
            AND distribution_network_outreach.updated_at>datetime('now','-30 days')
            THEN 'suppressed_no_contact'
          ELSE 'queued'
        END,
        discovery_attempts=CASE
          WHEN distribution_network_outreach.status='suppressed_no_contact'
            AND (distribution_network_outreach.source_url!=excluded.source_url OR distribution_network_outreach.updated_at<=datetime('now','-30 days'))
            THEN 0
          ELSE distribution_network_outreach.discovery_attempts
        END,
        contact_checked_at=CASE
          WHEN distribution_network_outreach.status='suppressed_no_contact'
            AND (distribution_network_outreach.source_url!=excluded.source_url OR distribution_network_outreach.updated_at<=datetime('now','-30 days'))
            THEN NULL
          ELSE distribution_network_outreach.contact_checked_at
        END,
        updated_at=CASE
          WHEN distribution_network_outreach.status='suppressed_no_contact'
            AND distribution_network_outreach.source_url=excluded.source_url
            AND distribution_network_outreach.updated_at>datetime('now','-30 days')
            THEN distribution_network_outreach.updated_at
          ELSE datetime('now')
        END
      WHERE distribution_network_outreach.surface_name IS NOT excluded.surface_name
         OR distribution_network_outreach.surface_type IS NOT excluded.surface_type
         OR distribution_network_outreach.domain IS NOT excluded.domain
         OR distribution_network_outreach.source_url IS NOT excluded.source_url
         OR distribution_network_outreach.priority_score IS NOT excluded.priority_score
         OR distribution_network_outreach.suggested_subject IS NOT excluded.suggested_subject
         OR distribution_network_outreach.suggested_body IS NOT excluded.suggested_body
         OR distribution_network_outreach.status='send_failed'
         OR (
           distribution_network_outreach.status='suppressed_no_contact'
           AND (distribution_network_outreach.source_url IS NOT excluded.source_url OR distribution_network_outreach.updated_at<=datetime('now','-30 days'))
         )`)
      .bind(row.surface_slug,safe(row.surface_name||domain,200),safe(row.surface_type,80),domain,String(row.action_url),Number(row.distribution_score||0),copy.subject,copy.body).run();
    if(Number(r?.meta?.changes||r?.changes||0)>0)queued++;
    if(!row.network_existing)newQueued++;
    else if(row.network_status==='suppressed_no_contact'&&(row.network_source_url!==row.action_url||String(row.network_updated_at||'')<=new Date(Date.now()-30*86400000).toISOString().replace('T',' ').slice(0,19)))reopened++;
  }
  return {considered,queued,newQueued,reopened};
}

async function persistRoutes(row,routes,env){
  let inserted=0;
  for(const route of routes){
    const routeId=`${row.surface_slug}|${route.type}|${route.url}`;
    const r=await env.DB.prepare(`INSERT INTO distribution_contact_routes(route_id,surface_slug,domain,route_type,route_url,source_url,status,first_seen_at,last_seen_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'discovered',datetime('now'),datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(route_id) DO UPDATE SET source_url=excluded.source_url,last_seen_at=datetime('now'),updated_at=datetime('now')
      WHERE distribution_contact_routes.source_url IS NOT excluded.source_url`)
      .bind(routeId,row.surface_slug,row.domain,route.type,route.url,route.source_url||row.source_url||null).run();
    if(Number(r?.meta?.changes||r?.changes||0)>0)inserted++;
  }
  return inserted;
}

async function scanContact(row,env){
  const domain=String(row.domain||'').replace(/^www\./,'').toLowerCase();
  if(!domain)return {found:false,routed:false};
  const home='https://'+domain+'/';
  const pages=[];
  const first=await fetchHtml(home);
  if(first){
    pages.push(first);
    for(const u of contactLinks(first.html,first.url)){
      const p=await fetchHtml(u);if(p)pages.push(p);
      if(pages.length>=MAX_PAGES_PER_SITE)break;
    }
  }
  const routes=[];
  for(const p of pages){
    const emails=extractEmails(p.html,domain);
    if(emails.length){
      const email=emails[0];
      await env.DB.prepare(`UPDATE distribution_network_outreach SET contact_email=?,contact_source_url=?,contact_checked_at=datetime('now'),discovery_attempts=discovery_attempts+1,status='contact_found',updated_at=datetime('now') WHERE surface_slug=?`).bind(email,p.url,row.surface_slug).run();
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`netcontact_${crypto.randomUUID()}`,row.surface_slug,'publisher_contact_found','completed','distribution_network',p.url,`Public publisher role email found for ${row.surface_slug}.`).run().catch(()=>{});
      return {found:true,routed:false};
    }
    routes.push(...discoverRoutes(p.html,p.url,domain));
  }
  const uniqueRoutes=[...new Map(routes.map(x=>[x.type+'|'+x.url,x])).values()].sort((a,b)=>(ROUTE_PRIORITY[a.type]??99)-(ROUTE_PRIORITY[b.type]??99));
  if(uniqueRoutes.length){
    await persistRoutes(row,uniqueRoutes,env);
    const best=uniqueRoutes[0];
    const attempts=Number(row.discovery_attempts||0)+1;
    await env.DB.prepare(`UPDATE distribution_network_outreach SET contact_source_url=?,contact_checked_at=datetime('now'),discovery_attempts=?,status='contact_route_found',updated_at=datetime('now') WHERE surface_slug=?`).bind(best.url,attempts,row.surface_slug).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,detail,observed_at,created_at)
      VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
      .bind(`netroute_${crypto.randomUUID()}`,row.surface_slug,'publisher_contact_route_found','completed','distribution_network',best.url,`No public role email was found, but ${uniqueRoutes.length} public contact/amplification route(s) were discovered. Best route: ${best.type}.`).run().catch(()=>{});
    return {found:false,routed:true,status:'contact_route_found',routes:uniqueRoutes.length};
  }
  const attempts=Number(row.discovery_attempts||0)+1;
  const status=attempts>=3?'suppressed_no_contact':'queued';
  await env.DB.prepare(`UPDATE distribution_network_outreach SET contact_checked_at=datetime('now'),discovery_attempts=?,status=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(attempts,status,row.surface_slug).run();
  if(status==='suppressed_no_contact'){
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,detail,observed_at,created_at)
      VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`)
      .bind(`netsuppress_${crypto.randomUUID()}`,row.surface_slug,'publisher_contact_suppressed','completed','distribution_network',`Publisher suppressed after ${attempts} autonomous contact-discovery attempts. Reopen only if the route changes or after a 30-day cool-off.`).run().catch(()=>{});
  }
  return {found:false,routed:false,status};
}
async function discoverContacts(env){
  await ensureSchema(env);
  const r=await env.DB.prepare(`SELECT surface_slug,domain,discovery_attempts FROM distribution_network_outreach WHERE status='queued' AND (contact_checked_at IS NULL OR contact_checked_at<datetime('now','-20 hours')) ORDER BY priority_score DESC LIMIT ?`).bind(MAX_CONTACT_SCANS).all();
  let scanned=0,found=0,routed=0,suppressed=0;
  for(const row of r.results||[]){scanned++;const x=await scanContact(row,env);if(x.found)found++;if(x.routed)routed++;if(x.status==='suppressed_no_contact')suppressed++}
  return {scanned,found,routed,suppressed};
}


async function materializeRouteActions(env){
  await ensureSchema(env);
  const q=await env.DB.prepare(`SELECT r.route_id,r.surface_slug,r.domain,r.route_type,r.route_url,r.source_url,r.status route_status,
      n.surface_name,n.priority_score,n.suggested_subject,n.suggested_body,
      a.execution_mode,a.status action_status,a.opportunity_slug,a.attempts,a.last_attempt_at
    FROM distribution_contact_routes r
    JOIN distribution_network_outreach n ON n.surface_slug=r.surface_slug
    LEFT JOIN distribution_contact_route_actions a ON a.route_id=r.route_id
    WHERE r.status IN ('discovered','in_loop')
      AND (
        a.route_id IS NULL
        OR a.status IN ('queued','retry_due')
        OR (a.status='issued_to_content' AND a.last_attempt_at<=datetime('now','-${ROUTE_CONTENT_RETRY_HOURS} hours') AND a.attempts<?)
      )
    ORDER BY n.priority_score DESC,r.first_seen_at ASC
    LIMIT ?`).bind(MAX_ROUTE_CONTENT_ATTEMPTS,MAX_ROUTE_ACTIONS_PER_CYCLE).all();
  let queued=0,synthetic=0,content=0,retried=0;
  for(const row of q.results||[]){
    const mode=routeMode(row.route_type),hash=await routeHash(row.route_id),oppSlug=safe(row.opportunity_slug||`route-${hash}`,100),next=routeNextAction(row.route_type);
    const previous=String(row.action_status||'');
    const write=await env.DB.prepare(`INSERT INTO distribution_contact_route_actions(route_id,surface_slug,route_type,route_url,execution_mode,status,opportunity_slug,attempts,last_result,next_action,created_at,updated_at)
      VALUES(?,?,?,?,?,'queued',?,0,NULL,?,datetime('now'),datetime('now'))
      ON CONFLICT(route_id) DO UPDATE SET
        surface_slug=excluded.surface_slug,
        route_type=excluded.route_type,
        route_url=excluded.route_url,
        execution_mode=excluded.execution_mode,
        status=CASE WHEN distribution_contact_route_actions.status IN ('verified_impact','executed_waiting_verification','human_action_required','auth_required','policy_blocked','exhausted') THEN distribution_contact_route_actions.status ELSE 'queued' END,
        opportunity_slug=excluded.opportunity_slug,
        next_action=excluded.next_action,
        updated_at=datetime('now')
      WHERE distribution_contact_route_actions.route_url IS NOT excluded.route_url
         OR distribution_contact_route_actions.execution_mode IS NOT excluded.execution_mode
         OR distribution_contact_route_actions.opportunity_slug IS NOT excluded.opportunity_slug
         OR distribution_contact_route_actions.next_action IS NOT excluded.next_action
         OR distribution_contact_route_actions.status='retry_due'`)
      .bind(row.route_id,row.surface_slug,row.route_type,row.route_url,mode,oppSlug,next).run();
    if(Number(write?.meta?.changes||write?.changes||0)>0)queued++;
    if(previous==='retry_due')retried++;
    await env.DB.prepare(`UPDATE distribution_contact_routes SET status='in_loop',updated_at=datetime('now') WHERE route_id=? AND status='discovered'`).bind(row.route_id).run().catch(()=>{});
    if(mode==='autonomous_qualification'){
      const score=Math.max(35,Math.min(95,Number(row.priority_score||0)));
      const r=await env.DB.prepare(`INSERT INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,human_required,next_action,created_at,updated_at)
        VALUES(?,?, 'publisher_contact_route',0,0,0,0,45,80,15,?,'research_required',?,0,?,datetime('now'),datetime('now'))
        ON CONFLICT(surface_slug) DO UPDATE SET surface_name=excluded.surface_name,action_url=excluded.action_url,distribution_score=excluded.distribution_score,next_action=excluded.next_action,updated_at=datetime('now')
        WHERE distribution_opportunities.action_url IS NOT excluded.action_url
           OR distribution_opportunities.distribution_score IS NOT excluded.distribution_score
           OR distribution_opportunities.next_action IS NOT excluded.next_action`)
        .bind(oppSlug,`${safe(row.surface_name||row.domain,150)} via ${row.route_type}`,score,row.route_url,next).run();
      if(Number(r?.meta?.changes||r?.changes||0)>0)synthetic++;
    }else{
      await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at)
        VALUES(?,?,?,?,?,'prepared',datetime('now'),datetime('now'))
        ON CONFLICT(action_id) DO UPDATE SET target_url=excluded.target_url,status=CASE WHEN growth_action_events.status IN ('sent','completed','verified','attributed') THEN growth_action_events.status ELSE 'prepared' END,updated_at=datetime('now')
        WHERE growth_action_events.target_url IS NOT excluded.target_url OR growth_action_events.status='legacy_unverified'`)
        .bind(`route:${hash}`,`surface:${row.surface_slug}`,'distribution_route',row.route_type,row.route_url).run().catch(()=>{});
      content++;
    }
  }
  return {considered:(q.results||[]).length,queued,synthetic,content,retried};
}

async function reconcileRouteActions(env){
  await ensureSchema(env);
  const q=await env.DB.prepare(`SELECT a.route_id,a.surface_slug,a.route_type,a.execution_mode,a.status,a.opportunity_slug,a.attempts,a.last_attempt_at,
      r.domain,r.route_url,n.status network_status,
      o.status opportunity_status,o.last_checked_at,
      EXISTS(
        SELECT 1 FROM confirmed_visitor_events v
        JOIN traffic_human_evidence h ON h.session_id=v.session_id
        WHERE lower(replace(COALESCE(v.referrer_host,''),'www.',''))=lower(replace(r.domain,'www.',''))
          AND (a.last_attempt_at IS NULL OR h.first_evidence_at>=a.last_attempt_at)
      ) referral_human
    FROM distribution_contact_route_actions a
    JOIN distribution_contact_routes r ON r.route_id=a.route_id
    LEFT JOIN distribution_network_outreach n ON n.surface_slug=a.surface_slug
    LEFT JOIN distribution_opportunities o ON o.surface_slug=a.opportunity_slug
    WHERE a.status NOT IN ('verified_impact','policy_blocked','exhausted')
    ORDER BY a.updated_at ASC LIMIT 80`).all().catch(()=>({results:[]}));
  let changed=0,verified=0,stalled=0,retryDue=0;
  for(const row of q.results||[]){
    let next=String(row.status||'queued'),result=null;
    if(row.network_status==='adopted'||Number(row.referral_human||0)>0){next='verified_impact';result=row.network_status==='adopted'?'publisher_adoption_verified':'strict_human_referral_verified';verified++;}
    else if(row.execution_mode==='autonomous_qualification'){
      const s=String(row.opportunity_status||'');
      if(['live','verified'].includes(s)){next='verified_impact';result=`route_opportunity_${s}`;verified++;}
      else if(['submitted','pending_review'].includes(s)){next='executed_waiting_verification';result=`route_opportunity_${s}`;}
      else if(s==='ready_to_submit'){next='qualified_auto';result='safe_adapter_ready';}
      else if(s==='human_action_required'){next='human_action_required';result='hard_human_gate';}
      else if(s==='auth_required'){next='auth_required';result='authentication_required';}
      else if(['policy_blocked','rejected','skipped','unavailable_free'].includes(s)){next='policy_blocked';result=`route_opportunity_${s}`;}
      else if(s==='research_required'){next='researching';result='autonomous_qualification_in_progress';}
      else if(!s){next='stalled';result='missing_synthetic_opportunity';stalled++;}
    }else if(row.execution_mode==='content_amplification'){
      if(row.status==='issued_to_content'&&row.last_attempt_at&&String(row.last_attempt_at)<=new Date(Date.now()-ROUTE_CONTENT_RETRY_HOURS*3600000).toISOString().replace('T',' ').slice(0,19)){
        if(Number(row.attempts||0)>=MAX_ROUTE_CONTENT_ATTEMPTS){next='exhausted';result='content_amplification_attempts_exhausted';}
        else{next='retry_due';result='content_amplification_retry_due';retryDue++;}
      }
    }
    if(next!==row.status||result){
      const w=await env.DB.prepare(`UPDATE distribution_contact_route_actions SET status=?,last_result=COALESCE(?,last_result),updated_at=datetime('now') WHERE route_id=? AND (status IS NOT ? OR COALESCE(last_result,'') IS NOT COALESCE(?,''))`).bind(next,result,row.route_id,next,result).run();
      if(Number(w?.meta?.changes||w?.changes||0)>0)changed++;
    }
  }
  return {checked:(q.results||[]).length,changed,verified,stalled,retryDue};
}

async function verifyAdoption(env){
  await ensureSchema(env);
  const r=await env.DB.prepare(`SELECT n.surface_slug,n.domain,n.status,
    EXISTS(SELECT 1 FROM distribution_embeds e WHERE lower(replace(e.publisher_host,'www.',''))=n.domain AND COALESCE(e.impressions,0)>0) embed_live,
    EXISTS(SELECT 1 FROM distribution_embed_clicks c WHERE lower(replace(c.source_host,'www.',''))=n.domain) embed_click,
    EXISTS(SELECT 1 FROM distribution_placements p WHERE p.surface_slug=n.surface_slug AND p.backlink_verified=1) backlink_live
    FROM distribution_network_outreach n
    WHERE n.status IN ('contact_route_found','contact_found','sent','adopted')`).all().catch(()=>({results:[]}));
  let adopted=0;
  for(const row of r.results||[]){
    const kind=Number(row.embed_live)?'embed':Number(row.embed_click)?'embed_click':Number(row.backlink_live)?'backlink':null;
    if(!kind)continue;
    if(row.status!=='adopted'){
      await env.DB.prepare(`UPDATE distribution_network_outreach SET status='adopted',adoption_kind=?,adopted_at=COALESCE(adopted_at,datetime('now')),last_observed_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=? AND (status IS NOT 'adopted' OR adoption_kind IS NOT ?)`).bind(kind,row.surface_slug,kind).run();
      adopted++;
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`netadopt_${crypto.randomUUID()}`,row.surface_slug,'publisher_network_adopted','completed','distribution_network',`Publisher adoption verified via ${kind}.`).run().catch(()=>{});
    }
  }
  return {checked:(r.results||[]).length,adopted};
}

async function metrics(env){
  await ensureSchema(env);
  const [status,adoption,routeActions]=await Promise.all([
    env.DB.prepare(`SELECT status,COUNT(*) n FROM distribution_network_outreach GROUP BY status`).all(),
    env.DB.prepare(`SELECT adoption_kind,COUNT(*) n FROM distribution_network_outreach WHERE status='adopted' GROUP BY adoption_kind`).all(),
    env.DB.prepare(`SELECT status,COUNT(*) n FROM distribution_contact_route_actions GROUP BY status`).all().catch(()=>({results:[]}))
  ]);
  return {status:'connected',states:Object.fromEntries((status.results||[]).map(x=>[x.status,Number(x.n||0)])),adoption:Object.fromEntries((adoption.results||[]).map(x=>[x.adoption_kind,Number(x.n||0)])),routeActions:Object.fromEntries((routeActions.results||[]).map(x=>[x.status,Number(x.n||0)]))};
}

export async function runDistributionNetworkCycle(env){
  const candidates=await refreshCandidates(env);
  const contacts=await discoverContacts(env);
  const routeActions=await materializeRouteActions(env);
  const routeReconciliation=await reconcileRouteActions(env);
  const adoption=await verifyAdoption(env);
  const materialChanges=Number(candidates.newQueued||0)+Number(candidates.reopened||0)+Number(contacts.found||0)+Number(contacts.routed||0)+Number(contacts.suppressed||0)+Number(routeActions.queued||0)+Number(routeActions.synthetic||0)+Number(routeActions.content||0)+Number(routeReconciliation.changed||0)+Number(adoption.adopted||0);
  if(materialChanges>0){
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`netcycle_${crypto.randomUUID()}`,'distribution_network_cycle','completed','distribution_network',`Distribution Network 2.1 materially changed ${materialChanges} item(s): ${candidates.newQueued} newly queued, ${candidates.reopened} reopened, ${contacts.found} role emails found, ${contacts.routed} alternate routes found, ${routeActions.queued} route actions queued, ${routeActions.synthetic} autonomous route opportunities materialized, ${routeActions.content} content-amplification routes prepared, ${routeReconciliation.verified} route impacts verified, ${routeReconciliation.retryDue} retries due, ${contacts.suppressed} suppressed and ${adoption.adopted} new adoptions verified. No-change cycles are not persisted.`).run().catch(()=>{});
  }
  return {ok:true,candidates,contacts,routeActions,routeReconciliation,adoption,materialChanges,write_policy:'material_change_only',closed_loop_routes:true};
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/distribution/network/refresh'&&request.method==='POST'){
      if(!(await authorized(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await runWithLedger(env,{engine:'distribution',mission:'network_cycle',triggerName:'manual_api'},()=>runDistributionNetworkCycle(env)),{headers:JSON_H});
    }
    if(u.pathname==='/api/distribution/network/metrics'&&request.method==='GET'){
      if(!(await authorized(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await metrics(env),{headers:JSON_H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

import base from './distribution-embed-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const NETWORK_TYPES=/(newsletter|editorial|media|journal|syndication|resource|community|distribution_surface)/i;
const ROLE_PRIORITY=['editorial','editor','partnerships','partners','partner','submissions','submit','newsletter','press','media','growth','marketing','hello','contact'];
const MAX_CANDIDATES_PER_CYCLE=24;
const MAX_CONTACT_SCANS=6;
const MAX_PAGES_PER_SITE=3;
let schemaReady=null;

const safe=(v,n=2000)=>String(v??'').slice(0,n);
function hostOf(v){try{return new URL(String(v||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function roleScore(email){const local=String(email||'').split('@')[0].toLowerCase();const i=ROLE_PRIORITY.findIndex(x=>local===x||local.includes(x));return i<0?999:i}
function cleanEmail(v){return String(v||'').trim().replace(/^mailto:/i,'').split('?')[0].toLowerCase()}
function isRoleEmail(email,domain){const p=String(email||'').split('@');return p.length===2&&p[1].replace(/^www\./,'')===domain&&roleScore(email)<999}
function extractEmails(html,domain){const out=new Set();for(const m of String(html||'').matchAll(/mailto:([^"'<>\s?]+)/ig)){const e=cleanEmail(m[1]);if(isRoleEmail(e,domain))out.add(e)}for(const m of String(html||'').matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)){const e=cleanEmail(m[0]);if(isRoleEmail(e,domain))out.add(e)}return [...out].sort((a,b)=>roleScore(a)-roleScore(b))}
function contactLinks(html,baseUrl){const links=[];for(const m of String(html||'').matchAll(/href=["']([^"']+)["']/ig)){try{const u=new URL(m[1],baseUrl),txt=(m[0]+' '+u.pathname).toLowerCase();if(u.origin===new URL(baseUrl).origin&&/(partner|submit|editor|newsletter|press|media|contact|marketing|about)/.test(txt))links.push(u.href)}catch{}}return [...new Set(links)].slice(0,MAX_PAGES_PER_SITE-1)}
async function fetchHtml(url){try{const r=await fetch(url,{headers:{'User-Agent':'ToolScout Distribution Network/2.1 (+https://trytoolscout.org)','Accept':'text/html'},redirect:'follow',signal:AbortSignal.timeout(7000)});if(!r.ok||!(r.headers.get('content-type')||'').includes('text/html'))return null;return {url:r.url,html:(await r.text()).slice(0,400000)}}catch{return null}}
async function authorized(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}

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
    env.DB.prepare(`SELECT surface_slug,surface_name,surface_type,action_url,distribution_score,status FROM distribution_opportunities WHERE action_url IS NOT NULL AND status NOT IN ('policy_blocked','rejected','skipped','unavailable_free') ORDER BY distribution_score DESC LIMIT 120`).all(),
    env.DB.prepare(`SELECT DISTINCT lower(vendor_domain) domain FROM distribution_vendor_amplification WHERE vendor_domain IS NOT NULL`).all().catch(()=>({results:[]}))
  ]);
  const vendorDomains=new Set((vendors.results||[]).map(x=>String(x.domain||'').replace(/^www\./,'')));
  let considered=0,queued=0;
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
        status=CASE WHEN distribution_network_outreach.status IN ('contact_found','sent','adopted') THEN distribution_network_outreach.status ELSE 'queued' END,
        updated_at=datetime('now')`)
      .bind(row.surface_slug,safe(row.surface_name||domain,200),safe(row.surface_type,80),domain,String(row.action_url),Number(row.distribution_score||0),copy.subject,copy.body).run();
    if(Number(r?.meta?.changes||r?.changes||0)>0)queued++;
  }
  return {considered,queued};
}

async function scanContact(row,env){
  const domain=String(row.domain||'').replace(/^www\./,'').toLowerCase();
  if(!domain)return {found:false};
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
  for(const p of pages){
    const emails=extractEmails(p.html,domain);
    if(!emails.length)continue;
    const email=emails[0];
    await env.DB.prepare(`UPDATE distribution_network_outreach SET contact_email=?,contact_source_url=?,contact_checked_at=datetime('now'),discovery_attempts=discovery_attempts+1,status='contact_found',updated_at=datetime('now') WHERE surface_slug=?`).bind(email,p.url,row.surface_slug).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`netcontact_${crypto.randomUUID()}`,row.surface_slug,'publisher_contact_found','completed','distribution_network',p.url,`Public publisher role email found for ${row.surface_slug}.`).run().catch(()=>{});
    return {found:true};
  }
  const attempts=Number(row.discovery_attempts||0)+1;
  const status=attempts>=3?'suppressed_no_contact':'queued';
  await env.DB.prepare(`UPDATE distribution_network_outreach SET contact_checked_at=datetime('now'),discovery_attempts=?,status=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(attempts,status,row.surface_slug).run();
  return {found:false,status};
}

async function discoverContacts(env){
  await ensureSchema(env);
  const r=await env.DB.prepare(`SELECT surface_slug,domain,discovery_attempts FROM distribution_network_outreach WHERE status='queued' AND (contact_checked_at IS NULL OR contact_checked_at<datetime('now','-20 hours')) ORDER BY priority_score DESC LIMIT ?`).bind(MAX_CONTACT_SCANS).all();
  let scanned=0,found=0,suppressed=0;
  for(const row of r.results||[]){scanned++;const x=await scanContact(row,env);if(x.found)found++;if(x.status==='suppressed_no_contact')suppressed++}
  return {scanned,found,suppressed};
}

async function verifyAdoption(env){
  await ensureSchema(env);
  const r=await env.DB.prepare(`SELECT n.surface_slug,n.domain,n.status,
    EXISTS(SELECT 1 FROM distribution_embeds e WHERE lower(replace(e.publisher_host,'www.',''))=n.domain AND COALESCE(e.impressions,0)>0) embed_live,
    EXISTS(SELECT 1 FROM distribution_embed_clicks c WHERE lower(replace(c.source_host,'www.',''))=n.domain) embed_click,
    EXISTS(SELECT 1 FROM distribution_placements p WHERE p.surface_slug=n.surface_slug AND p.backlink_verified=1) backlink_live
    FROM distribution_network_outreach n
    WHERE n.status IN ('contact_found','sent','adopted')`).all().catch(()=>({results:[]}));
  let adopted=0;
  for(const row of r.results||[]){
    const kind=Number(row.embed_live)?'embed':Number(row.embed_click)?'embed_click':Number(row.backlink_live)?'backlink':null;
    if(!kind)continue;
    await env.DB.prepare(`UPDATE distribution_network_outreach SET status='adopted',adoption_kind=?,adopted_at=COALESCE(adopted_at,datetime('now')),last_observed_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(kind,row.surface_slug).run();
    if(row.status!=='adopted'){
      adopted++;
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`netadopt_${crypto.randomUUID()}`,row.surface_slug,'publisher_network_adopted','completed','distribution_network',`Publisher adoption verified via ${kind}.`).run().catch(()=>{});
    }
  }
  return {checked:(r.results||[]).length,adopted};
}

async function metrics(env){
  await ensureSchema(env);
  const [status,adoption]=await Promise.all([
    env.DB.prepare(`SELECT status,COUNT(*) n FROM distribution_network_outreach GROUP BY status`).all(),
    env.DB.prepare(`SELECT adoption_kind,COUNT(*) n FROM distribution_network_outreach WHERE status='adopted' GROUP BY adoption_kind`).all()
  ]);
  return {status:'connected',states:Object.fromEntries((status.results||[]).map(x=>[x.status,Number(x.n||0)])),adoption:Object.fromEntries((adoption.results||[]).map(x=>[x.adoption_kind,Number(x.n||0)]))};
}

async function cycle(env){
  const candidates=await refreshCandidates(env);
  const contacts=await discoverContacts(env);
  const adoption=await verifyAdoption(env);
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`netcycle_${crypto.randomUUID()}`,'distribution_network_cycle','completed','distribution_network',`Distribution Network 2.1: ${candidates.considered} publisher candidates considered, ${contacts.found} contacts found, ${adoption.adopted} new adoptions verified.`).run().catch(()=>{});
  return {ok:true,candidates,contacts,adoption};
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/distribution/network/refresh'&&request.method==='POST'){
      if(!(await authorized(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await cycle(env),{headers:JSON_H});
    }
    if(u.pathname==='/api/distribution/network/metrics'&&request.method==='GET'){
      if(!(await authorized(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await metrics(env),{headers:JSON_H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const result=base.scheduled?await base.scheduled(event,env,ctx):undefined;
    ctx.waitUntil(cycle(env).catch(()=>{}));
    return result;
  }
};

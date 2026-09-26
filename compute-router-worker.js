import base from './operational-truth-reconciliation-worker.js';
import {classifyAuthBacklog,authPlaneHealth,completeAuthHandoff,authenticatedResumeSweep,refreshAuthBrokerRuntimeHealth} from './auth-session-plane.js';
import {qualifyDistributionSurfaces} from './distribution-autonomous-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const OVERFLOW_CRON='*/5 * * * *';
const DAILY_JOB_BUDGET=1500;
const EXECUTION_DAILY_JOB_BUDGET=800;
const DISTRIBUTION_RESEARCH_BUCKET_HOURS=6;
const DISTRIBUTION_CLASSIFIER_VERSION=2;
const ROLE_EMAIL_RESEARCH_BUCKET_HOURS=24;
const CONTACT_SUPPLY_TARGET=200;
const CONTACT_SUPPLY_MIN=150;
const CONTACT_SUPPLY_RESEARCH_BATCH=120;
const BATCH_SIZE=25;
const MAX_ACTIVE_BATCHES=2;
const BATCH_TIMEOUT_MINUTES=3;
let schemaReady=null;
let hotIndexesReady=null;

function safe(v,n=4000){return String(v??'').slice(0,n)}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function rows(r){return r?.results||[]}
function isHttp(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)}catch{return false}}
async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function shortHash(value){return (await sha256(value)).slice(0,20)}
async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_jobs(
      job_id TEXT PRIMARY KEY,
      job_key TEXT NOT NULL UNIQUE,
      job_type TEXT NOT NULL,
      subject_type TEXT,
      subject_key TEXT,
      priority_score REAL NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      batch_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TEXT NOT NULL DEFAULT (datetime('now')),
      leased_at TEXT,
      completed_at TEXT,
      result_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_status_priority ON compute_overflow_jobs(status,priority_score DESC,available_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_batch ON compute_overflow_jobs(batch_id,status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_subject_type_created ON compute_overflow_jobs(subject_key,job_type,created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_batches(
      batch_id TEXT PRIMARY KEY,
      completion_token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'dispatched',
      job_count INTEGER NOT NULL DEFAULT 0,
      trigger_http_status INTEGER,
      fetched_at TEXT,
      dispatched_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      result_summary_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_batches_status ON compute_overflow_batches(status,dispatched_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_locks(
      lock_name TEXT PRIMARY KEY,
      lease_until TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_events(
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      status TEXT,
      job_id TEXT,
      batch_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_metrics(
      id TEXT PRIMARY KEY,
      metric_day TEXT NOT NULL DEFAULT (date('now')),
      queued INTEGER NOT NULL DEFAULT 0,
      leased INTEGER NOT NULL DEFAULT 0,
      completed_today INTEGER NOT NULL DEFAULT 0,
      failed_today INTEGER NOT NULL DEFAULT 0,
      created_today INTEGER NOT NULL DEFAULT 0,
      active_batches INTEGER NOT NULL DEFAULT 0,
      completed_batches_today INTEGER NOT NULL DEFAULT 0,
      last_dispatched_at TEXT,
      last_completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO compute_overflow_metrics(id,metric_day) VALUES('global',date('now'))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_budget(
      kind TEXT PRIMARY KEY,
      metric_day TEXT NOT NULL DEFAULT (date('now')),
      used_today INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO compute_overflow_budget(kind,metric_day,used_today) VALUES('research',date('now'),0)`),
    env.DB.prepare(`INSERT OR IGNORE INTO compute_overflow_budget(kind,metric_day,used_today) VALUES('execution',date('now'),0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS contact_supply_domain(
      domain TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_key TEXT,
      source_name TEXT,
      source_url TEXT,
      priority_score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      contact_email TEXT,
      contact_name TEXT,
      contact_title TEXT,
      contact_source TEXT,
      contact_source_url TEXT,
      route_type TEXT,
      route_url TEXT,
      provider TEXT,
      provider_person_id TEXT,
      public_attempts INTEGER NOT NULL DEFAULT 0,
      apollo_status TEXT NOT NULL DEFAULT 'plan_blocked',
      next_research_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_researched_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_contact_supply_status_priority ON contact_supply_domain(status,priority_score DESC,next_research_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_contact_supply_email ON contact_supply_domain(contact_email,status)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS contact_supply_metrics(
      id TEXT PRIMARY KEY,
      target_ready INTEGER NOT NULL DEFAULT 200,
      min_ready INTEGER NOT NULL DEFAULT 150,
      catalog_domains INTEGER NOT NULL DEFAULT 0,
      network_domains INTEGER NOT NULL DEFAULT 0,
      vendor_domains INTEGER NOT NULL DEFAULT 0,
      ready_email INTEGER NOT NULL DEFAULT 0,
      ready_route INTEGER NOT NULL DEFAULT 0,
      cooldown INTEGER NOT NULL DEFAULT 0,
      researching INTEGER NOT NULL DEFAULT 0,
      unresolved INTEGER NOT NULL DEFAULT 0,
      apollo_eligible INTEGER NOT NULL DEFAULT 0,
      apollo_status TEXT NOT NULL DEFAULT 'plan_blocked_people_api',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO contact_supply_metrics(id,target_ready,min_ready) VALUES('global',200,150)`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
async function ensureHotIndexes(env){
  if(hotIndexesReady)return hotIndexesReady;
  hotIndexesReady=Promise.allSettled([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_opportunities_overflow ON distribution_opportunities(human_required,status,distribution_score DESC,updated_at)`).run(),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_submissions_lookup ON distribution_submissions(surface_slug,submission_type,asset_url,status)`).run(),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_submissions_verify ON distribution_submissions(submission_type,status,submitted_at)`).run(),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_auto_adapters_policy ON distribution_auto_adapters(policy_state,confidence,surface_slug)`).run(),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_type_status_completed ON compute_overflow_jobs(job_type,status,completed_at)`).run(),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_automation_capability(
      surface_slug TEXT PRIMARY KEY,
      automation_class TEXT NOT NULL,
      credential_kind TEXT,
      credential_header TEXT,
      credential_prefix TEXT,
      credential_state TEXT NOT NULL DEFAULT 'not_required',
      human_bootstrap_required INTEGER NOT NULL DEFAULT 0,
      evidence TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run(),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_vendor_amplification_domain_status ON distribution_vendor_amplification(vendor_domain,status)`).run(),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_network_outreach_domain_status ON distribution_network_outreach(domain,status)`).run()
  ]).catch(error=>{hotIndexesReady=null;throw error});
  return hotIndexesReady;
}
function contactDomain(value){
  try{
    const u=new URL(String(value||'').startsWith('http')?String(value):'https://'+String(value||''));
    return u.hostname.toLowerCase().replace(/^www\./,'');
  }catch{return''}
}
function contactDomainEligible(domain){
  const d=String(domain||'').toLowerCase().replace(/^www\./,'');
  if(!d||d==='trytoolscout.org'||d.endsWith('.trytoolscout.org'))return false;
  if(['x.com','twitter.com','linkedin.com','facebook.com','instagram.com','youtube.com','tiktok.com','github.com','bsky.app','google.com','schema.org'].includes(d))return false;
  return !/^(api|cdn|static|assets?|img|images|media|js|css|fonts)\./.test(d);
}
async function upsertContactSupplyDomain(env,{domain,sourceType,sourceKey=null,sourceName=null,sourceUrl=null,priority=0}){
  const d=contactDomain(domain);if(!contactDomainEligible(d))return 0;
  const w=await env.DB.prepare(`INSERT INTO contact_supply_domain(domain,source_type,source_key,source_name,source_url,priority_score,status,next_research_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'queued',datetime('now'),datetime('now'),datetime('now'))
    ON CONFLICT(domain) DO UPDATE SET
      priority_score=MAX(contact_supply_domain.priority_score,excluded.priority_score),
      source_type=CASE WHEN excluded.priority_score>=contact_supply_domain.priority_score THEN excluded.source_type ELSE contact_supply_domain.source_type END,
      source_key=CASE WHEN excluded.priority_score>=contact_supply_domain.priority_score THEN COALESCE(excluded.source_key,contact_supply_domain.source_key) ELSE contact_supply_domain.source_key END,
      source_name=COALESCE(contact_supply_domain.source_name,excluded.source_name),
      source_url=COALESCE(contact_supply_domain.source_url,excluded.source_url),
      updated_at=datetime('now')
    WHERE
      excluded.priority_score>contact_supply_domain.priority_score
      OR (excluded.priority_score>=contact_supply_domain.priority_score AND excluded.source_type<>contact_supply_domain.source_type)
      OR (excluded.priority_score>=contact_supply_domain.priority_score AND COALESCE(excluded.source_key,'')<>COALESCE(contact_supply_domain.source_key,''))
      OR (contact_supply_domain.source_name IS NULL AND excluded.source_name IS NOT NULL)
      OR (contact_supply_domain.source_url IS NULL AND excluded.source_url IS NOT NULL)`)
    .bind(d,safe(sourceType,60),sourceKey?safe(sourceKey,180):null,sourceName?safe(sourceName,240):null,sourceUrl?safe(sourceUrl,2000):null,Number(priority||0)).run();
  return Number(w?.meta?.changes||w?.changes||0);
}
async function refreshContactSupplyMetrics(env){
  const row=await env.DB.prepare(`SELECT
      COUNT(*) total_domains,
      SUM(CASE WHEN source_type='catalog_vendor' THEN 1 ELSE 0 END) catalog_domains,
      SUM(CASE WHEN source_type IN ('publisher_network','distribution_surface') THEN 1 ELSE 0 END) network_domains,
      SUM(CASE WHEN source_type='vendor_amplification' THEN 1 ELSE 0 END) vendor_domains,
      SUM(CASE WHEN status='ready_email' AND contact_email IS NOT NULL THEN 1 ELSE 0 END) ready_email,
      SUM(CASE WHEN status='ready_route' AND route_url IS NOT NULL THEN 1 ELSE 0 END) ready_route,
      SUM(CASE WHEN status='cooldown' THEN 1 ELSE 0 END) cooldown,
      SUM(CASE WHEN status='researching' THEN 1 ELSE 0 END) researching,
      SUM(CASE WHEN status IN ('queued','unresolved','provider_blocked') THEN 1 ELSE 0 END) unresolved,
      SUM(CASE WHEN status IN ('unresolved','provider_blocked') AND contact_email IS NULL THEN 1 ELSE 0 END) apollo_eligible
    FROM contact_supply_domain`).first().catch(()=>null);
  await env.DB.prepare(`UPDATE contact_supply_metrics SET
      target_ready=?,min_ready=?,catalog_domains=?,network_domains=?,vendor_domains=?,ready_email=?,ready_route=?,cooldown=?,researching=?,unresolved=?,apollo_eligible=?,
      updated_at=datetime('now') WHERE id='global'`)
    .bind(CONTACT_SUPPLY_TARGET,CONTACT_SUPPLY_MIN,num(row?.catalog_domains),num(row?.network_domains),num(row?.vendor_domains),num(row?.ready_email),num(row?.ready_route),num(row?.cooldown),num(row?.researching),num(row?.unresolved),num(row?.apollo_eligible)).run().catch(()=>{});
  return {...row,targetReady:CONTACT_SUPPLY_TARGET,minReady:CONTACT_SUPPLY_MIN};
}
async function contactSupplyHealth(env){
  await ensureSchema(env);
  const row=await env.DB.prepare(`SELECT target_ready,min_ready,catalog_domains,network_domains,vendor_domains,ready_email,ready_route,cooldown,researching,unresolved,apollo_eligible,apollo_status,updated_at FROM contact_supply_metrics WHERE id='global' LIMIT 1`).first().catch(()=>null);
  return {
    status:'active',
    targetReady:num(row?.target_ready||CONTACT_SUPPLY_TARGET),
    minReady:num(row?.min_ready||CONTACT_SUPPLY_MIN),
    readyEmail:num(row?.ready_email),
    readyRoute:num(row?.ready_route),
    cooldown:num(row?.cooldown),
    researching:num(row?.researching),
    unresolved:num(row?.unresolved),
    catalogDomains:num(row?.catalog_domains),
    networkDomains:num(row?.network_domains),
    vendorDomains:num(row?.vendor_domains),
    apolloEligible:num(row?.apollo_eligible),
    apolloStatus:row?.apollo_status||'plan_blocked_people_api',
    apolloReason:'Apollo Free plan blocks People API search; public discovery and route fallback remain autonomous.',
    updatedAt:row?.updated_at||null
  };
}
async function domainInOutreachCooldown(env,domain){
  const row=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM distribution_vendor_amplification
      WHERE lower(vendor_domain)=? AND status='sent' AND outreach_sent_at>=datetime('now','-30 days'))+
    (SELECT COUNT(*) FROM distribution_network_outreach
      WHERE lower(domain)=? AND status IN ('sent','adopted') AND outreach_sent_at>=datetime('now','-30 days')) n`)
    .bind(domain,domain).first().catch(()=>({n:0}));
  return num(row?.n)>0;
}
async function seedContactSupply(env){
  await ensureSchema(env);
  await env.DB.prepare(`DELETE FROM contact_supply_domain
    WHERE domain IN ('x.com','twitter.com','linkedin.com','facebook.com','instagram.com','youtube.com','tiktok.com','github.com','bsky.app','google.com','schema.org')
       OR domain LIKE 'api.%' OR domain LIKE 'cdn.%' OR domain LIKE 'static.%' OR domain LIKE 'assets.%' OR domain LIKE 'img.%' OR domain LIKE 'images.%' OR domain LIKE 'fonts.%'`).run().catch(()=>{});
  let seeded=0;
  try{
    const response=await env.ASSETS.fetch(new Request('https://trytoolscout.org/data/tools.json',{headers:{'Cache-Control':'no-cache'}}));
    if(response.ok){
      const tools=await response.json();
      for(const tool of Array.isArray(tools)?tools:[]){
        const domain=contactDomain(tool?.sourceUrl);if(!contactDomainEligible(domain))continue;
        seeded+=await upsertContactSupplyDomain(env,{
          domain,sourceType:'catalog_vendor',sourceKey:tool.slug||null,sourceName:tool.name||null,sourceUrl:tool.sourceUrl||null,
          priority:700+(tool?.affiliateUrl?30:0)+(tool?.affiliateProgram?10:0)
        });
      }
    }
  }catch{}
  const [network,vendors,opps]=await Promise.all([
    env.DB.prepare(`SELECT surface_slug,surface_name,domain,source_url,priority_score FROM distribution_network_outreach
      WHERE domain IS NOT NULL AND status NOT IN ('suppressed_technical') ORDER BY priority_score DESC LIMIT 300`).all().catch(()=>({results:[]})),
    env.DB.prepare(`SELECT tool_slug,vendor_domain,asset_url,MAX(priority_score) priority_score FROM distribution_vendor_amplification
      WHERE vendor_domain IS NOT NULL GROUP BY lower(vendor_domain) ORDER BY priority_score DESC LIMIT 300`).all().catch(()=>({results:[]})),
    env.DB.prepare(`SELECT surface_slug,surface_name,action_url,distribution_score FROM distribution_opportunities
      WHERE action_url IS NOT NULL AND status NOT IN ('policy_blocked','rejected','skipped','unavailable_free') ORDER BY distribution_score DESC LIMIT 500`).all().catch(()=>({results:[]}))
  ]);
  for(const row of rows(network))seeded+=await upsertContactSupplyDomain(env,{domain:row.domain,sourceType:'publisher_network',sourceKey:row.surface_slug,sourceName:row.surface_name,sourceUrl:row.source_url,priority:820+num(row.priority_score)});
  for(const row of rows(vendors))seeded+=await upsertContactSupplyDomain(env,{domain:row.vendor_domain,sourceType:'vendor_amplification',sourceKey:row.tool_slug,sourceUrl:row.asset_url,priority:900+num(row.priority_score)});
  for(const row of rows(opps)){
    const domain=contactDomain(row.action_url);if(!contactDomainEligible(domain))continue;
    seeded+=await upsertContactSupplyDomain(env,{domain,sourceType:'distribution_surface',sourceKey:row.surface_slug,sourceName:row.surface_name,sourceUrl:row.action_url,priority:760+num(row.distribution_score)});
  }
  await env.DB.prepare(`UPDATE contact_supply_domain SET contact_email=(
      SELECT v.contact_email FROM distribution_vendor_amplification v
      WHERE lower(v.vendor_domain)=contact_supply_domain.domain AND v.contact_email IS NOT NULL
      ORDER BY v.priority_score DESC LIMIT 1
    ),contact_source='existing_vendor_lane',
    status=CASE WHEN EXISTS(
      SELECT 1 FROM distribution_vendor_amplification sent
      WHERE lower(sent.vendor_domain)=contact_supply_domain.domain AND sent.status='sent' AND sent.outreach_sent_at>=datetime('now','-30 days')
    ) THEN 'cooldown' ELSE 'ready_email' END,
    updated_at=datetime('now')
    WHERE contact_email IS NULL AND EXISTS(
      SELECT 1 FROM distribution_vendor_amplification v WHERE lower(v.vendor_domain)=contact_supply_domain.domain AND v.contact_email IS NOT NULL
    )`).run().catch(()=>{});
  await env.DB.prepare(`UPDATE contact_supply_domain SET contact_email=(
      SELECT n.contact_email FROM distribution_network_outreach n
      WHERE lower(n.domain)=contact_supply_domain.domain AND n.contact_email IS NOT NULL
      ORDER BY n.priority_score DESC LIMIT 1
    ),contact_source='existing_network_lane',
    status=CASE WHEN EXISTS(
      SELECT 1 FROM distribution_network_outreach sent
      WHERE lower(sent.domain)=contact_supply_domain.domain AND sent.status IN ('sent','adopted') AND sent.outreach_sent_at>=datetime('now','-30 days')
    ) THEN 'cooldown' ELSE 'ready_email' END,
    updated_at=datetime('now')
    WHERE contact_email IS NULL AND EXISTS(
      SELECT 1 FROM distribution_network_outreach n WHERE lower(n.domain)=contact_supply_domain.domain AND n.contact_email IS NOT NULL
    )`).run().catch(()=>{});
  await env.DB.prepare(`UPDATE contact_supply_domain SET status='cooldown',updated_at=datetime('now')
    WHERE contact_email IS NOT NULL AND status='ready_email' AND (
      EXISTS(SELECT 1 FROM distribution_vendor_amplification sent WHERE lower(sent.vendor_domain)=contact_supply_domain.domain AND sent.status='sent' AND sent.outreach_sent_at>=datetime('now','-30 days'))
      OR EXISTS(SELECT 1 FROM distribution_network_outreach sent WHERE lower(sent.domain)=contact_supply_domain.domain AND sent.status IN ('sent','adopted') AND sent.outreach_sent_at>=datetime('now','-30 days'))
    )`).run().catch(()=>{});
  await env.DB.prepare(`UPDATE contact_supply_domain SET status='ready_email',updated_at=datetime('now')
    WHERE contact_email IS NOT NULL AND status='cooldown'
      AND NOT EXISTS(SELECT 1 FROM distribution_vendor_amplification sent WHERE lower(sent.vendor_domain)=contact_supply_domain.domain AND sent.status='sent' AND sent.outreach_sent_at>=datetime('now','-30 days'))
      AND NOT EXISTS(SELECT 1 FROM distribution_network_outreach sent WHERE lower(sent.domain)=contact_supply_domain.domain AND sent.status IN ('sent','adopted') AND sent.outreach_sent_at>=datetime('now','-30 days'))`).run().catch(()=>{});
  await env.DB.prepare(`UPDATE distribution_vendor_amplification SET
      contact_email=(SELECT cs.contact_email FROM contact_supply_domain cs WHERE cs.domain=lower(distribution_vendor_amplification.vendor_domain) AND cs.status='ready_email' LIMIT 1),
      contact_source_url=COALESCE(contact_source_url,(SELECT cs.contact_source_url FROM contact_supply_domain cs WHERE cs.domain=lower(distribution_vendor_amplification.vendor_domain) AND cs.status='ready_email' LIMIT 1)),
      contact_method='public_role_email',status='contact_found',updated_at=datetime('now')
    WHERE contact_email IS NULL AND status NOT IN ('sent','reputation_quarantine')
      AND EXISTS(SELECT 1 FROM contact_supply_domain cs WHERE cs.domain=lower(distribution_vendor_amplification.vendor_domain) AND cs.status='ready_email' AND cs.contact_email IS NOT NULL)`).run().catch(()=>{});
  await env.DB.prepare(`UPDATE distribution_network_outreach SET
      contact_email=(SELECT cs.contact_email FROM contact_supply_domain cs WHERE cs.domain=lower(distribution_network_outreach.domain) AND cs.status='ready_email' LIMIT 1),
      contact_source_url=COALESCE(contact_source_url,(SELECT cs.contact_source_url FROM contact_supply_domain cs WHERE cs.domain=lower(distribution_network_outreach.domain) AND cs.status='ready_email' LIMIT 1)),
      contact_checked_at=datetime('now'),status='contact_found',updated_at=datetime('now')
    WHERE contact_email IS NULL AND status NOT IN ('sent','adopted','reputation_quarantine')
      AND EXISTS(SELECT 1 FROM contact_supply_domain cs WHERE cs.domain=lower(distribution_network_outreach.domain) AND cs.status='ready_email' AND cs.contact_email IS NOT NULL)`).run().catch(()=>{});
  const metrics=await refreshContactSupplyMetrics(env);
  await event(env,'contact_supply_seeded','completed',`Contact Supply Engine reconciled domain inventory. Ready email buffer ${num(metrics?.ready_email)}/${CONTACT_SUPPLY_TARGET}; catalog/network/vendor sources deduplicated by domain.`);
  return{seeded,metrics};
}
async function ensureContactSupplySeeded(env){
  await ensureSchema(env);
  const row=await env.DB.prepare(`SELECT domain FROM contact_supply_domain LIMIT 1`).first().catch(()=>null);
  if(!row)return seedContactSupply(env);
  return null;
}
async function enqueueContactSupplyResearch(env,remaining){
  if(remaining<=0)return{enqueued:0,remaining};
  const m=await env.DB.prepare(`SELECT ready_email FROM contact_supply_metrics WHERE id='global' LIMIT 1`).first().catch(()=>({ready_email:0}));
  const ready=num(m?.ready_email);
  if(ready>=CONTACT_SUPPLY_TARGET)return{enqueued:0,remaining,ready,target:CONTACT_SUPPLY_TARGET};
  const need=Math.max(0,CONTACT_SUPPLY_TARGET-ready);
  const q=await env.DB.prepare(`SELECT domain,source_type,source_key,source_name,source_url,priority_score,public_attempts,status
    FROM contact_supply_domain
    WHERE contact_email IS NULL AND status IN ('queued','unresolved','provider_blocked','ready_route')
      AND next_research_at<=datetime('now')
    ORDER BY CASE status WHEN 'queued' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,priority_score DESC,updated_at ASC
    LIMIT ?`).bind(Math.min(CONTACT_SUPPLY_RESEARCH_BATCH,need,remaining)).all().catch(()=>({results:[]}));
  let enqueued=0;
  for(const row of rows(q)){
    if(remaining<=0)break;
    const url=isHttp(row.source_url)?row.source_url:`https://${row.domain}/`;
    const bucket=Math.floor(Date.now()/(24*3600000));
    const added=await enqueueJob(env,{
      jobKey:`contact-supply:${row.domain}:attempt:${num(row.public_attempts)+1}:day:${bucket}`,
      jobType:'contact_supply_public_research',
      subjectType:'domain',subjectKey:row.domain,
      priority:1000+num(row.priority_score),
      payload:{url,domain:row.domain,sourceType:row.source_type,sourceKey:row.source_key,sourceName:row.source_name,authorizationClass:'public_role_email_discovery_v1'}
    });
    if(added){
      enqueued+=added;remaining-=added;
      await env.DB.prepare(`UPDATE contact_supply_domain SET status='researching',updated_at=datetime('now') WHERE domain=? AND contact_email IS NULL`).bind(row.domain).run().catch(()=>{});
    }
  }
  if(enqueued>0)await refreshContactSupplyMetrics(env);
  return{enqueued,remaining,ready,target:CONTACT_SUPPLY_TARGET};
}
async function event(env,eventType,status,detail,{jobId=null,batchId=null}={}){
  await ensureSchema(env);
  try{await env.DB.prepare(`INSERT INTO compute_overflow_events(event_id,event_type,status,job_id,batch_id,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind(`coe_${crypto.randomUUID()}`,eventType,status,jobId,batchId,safe(detail,1800)).run()}catch{}
}
async function resetMetricsDay(env){
  await ensureSchema(env);
  await env.DB.prepare(`UPDATE compute_overflow_metrics SET metric_day=date('now'),completed_today=0,failed_today=0,created_today=0,completed_batches_today=0,updated_at=datetime('now') WHERE id='global' AND metric_day<>date('now')`).run().catch(()=>{});
}
async function reconcileMetricAnomaly(env,m){
  const looksImpossible=num(m?.active_batches)===0&&num(m?.leased)>0;
  if(!looksImpossible)return m;
  const [jobs,batches]=await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN status='leased' THEN 1 ELSE 0 END) leased,
      SUM(CASE WHEN status='completed' AND completed_at>=date('now') THEN 1 ELSE 0 END) completed_today,
      SUM(CASE WHEN status='failed' AND updated_at>=date('now') THEN 1 ELSE 0 END) failed_today,
      SUM(CASE WHEN created_at>=date('now') THEN 1 ELSE 0 END) created_today,
      MAX(completed_at) last_completed_at
      FROM compute_overflow_jobs`).first().catch(()=>null),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status IN ('dispatched','running') THEN 1 ELSE 0 END) active_batches,
      SUM(CASE WHEN status='completed' AND completed_at>=date('now') THEN 1 ELSE 0 END) completed_batches_today,
      MAX(dispatched_at) last_dispatched_at
      FROM compute_overflow_batches`).first().catch(()=>null)
  ]);
  await env.DB.prepare(`UPDATE compute_overflow_metrics SET queued=?,leased=?,completed_today=?,failed_today=?,created_today=?,active_batches=?,completed_batches_today=?,last_dispatched_at=COALESCE(?,last_dispatched_at),last_completed_at=COALESCE(?,last_completed_at),updated_at=datetime('now') WHERE id='global'`)
    .bind(num(jobs?.queued),num(jobs?.leased),num(jobs?.completed_today),num(jobs?.failed_today),num(jobs?.created_today),num(batches?.active_batches),num(batches?.completed_batches_today),batches?.last_dispatched_at||null,jobs?.last_completed_at||null).run().catch(()=>{});
  return env.DB.prepare(`SELECT metric_day,queued,leased,completed_today,failed_today,created_today,active_batches,completed_batches_today,last_dispatched_at,last_completed_at FROM compute_overflow_metrics WHERE id='global' LIMIT 1`).first().catch(()=>m);
}
async function metricRow(env){
  await resetMetricsDay(env);
  const m=await env.DB.prepare(`SELECT metric_day,queued,leased,completed_today,failed_today,created_today,active_batches,completed_batches_today,last_dispatched_at,last_completed_at FROM compute_overflow_metrics WHERE id='global' LIMIT 1`).first().catch(()=>null);
  return reconcileMetricAnomaly(env,m);
}
async function metricDelta(env,{queued=0,leased=0,completed=0,failed=0,created=0,activeBatches=0,completedBatches=0,lastDispatched=false,lastCompleted=false}={}){
  await resetMetricsDay(env);
  await env.DB.prepare(`UPDATE compute_overflow_metrics SET
      queued=MAX(0,queued+?),leased=MAX(0,leased+?),
      completed_today=MAX(0,completed_today+?),failed_today=MAX(0,failed_today+?),created_today=MAX(0,created_today+?),
      active_batches=MAX(0,active_batches+?),completed_batches_today=MAX(0,completed_batches_today+?),
      last_dispatched_at=CASE WHEN ? THEN datetime('now') ELSE last_dispatched_at END,
      last_completed_at=CASE WHEN ? THEN datetime('now') ELSE last_completed_at END,
      updated_at=datetime('now')
    WHERE id='global'`).bind(queued,leased,completed,failed,created,activeBatches,completedBatches,lastDispatched?1:0,lastCompleted?1:0).run().catch(()=>{});
}
async function budgetRemaining(env,kind,limit){
  await ensureSchema(env);
  await env.DB.prepare(`UPDATE compute_overflow_budget SET metric_day=date('now'),used_today=0,updated_at=datetime('now') WHERE kind=? AND metric_day<>date('now')`).bind(kind).run().catch(()=>{});
  const row=await env.DB.prepare(`SELECT used_today FROM compute_overflow_budget WHERE kind=? LIMIT 1`).bind(kind).first().catch(()=>null);
  return Math.max(0,Number(limit||0)-num(row?.used_today));
}
async function budgetConsume(env,kind,count){
  const n=Math.max(0,Number(count||0));if(!n)return;
  await env.DB.prepare(`UPDATE compute_overflow_budget SET used_today=used_today+?,updated_at=datetime('now') WHERE kind=?`).bind(n,kind).run().catch(()=>{});
}
async function health(env){
  const [m,budgets,contactSupply,funnel]=await Promise.all([
    metricRow(env),
    env.DB.prepare(`SELECT kind,used_today FROM compute_overflow_budget WHERE kind IN ('research','execution')`).all().catch(()=>({results:[]})),
    contactSupplyHealth(env),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE status='queued') canonical_queued,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE status='queued' AND available_at<=datetime('now')) runnable_queued,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE status='queued' AND available_at>datetime('now')) deferred_queued,
      (SELECT MIN(available_at) FROM compute_overflow_jobs WHERE status='queued' AND available_at>datetime('now')) next_available_at,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE status='leased') canonical_leased,
      (SELECT COUNT(*) FROM compute_overflow_batches WHERE status IN ('dispatched','running')) canonical_active_batches,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day')) research_completed_today,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day') AND result_json LIKE '%"routeSummary":%') classified_research_jobs_today,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day') AND result_json LIKE '%"kind":"submission"%') submission_routes_found_today,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day') AND result_json LIKE '%"machineCandidate":{"kind":"html_form"%') machine_candidates_found_today,
      (SELECT COALESCE(SUM(CAST(json_extract(result_json,'$.routeSummary.formRoutes') AS INTEGER)),0) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day')) form_routes_seen_today,
      (SELECT COALESCE(SUM(CAST(json_extract(result_json,'$.routeSummary.authRoutes') AS INTEGER)),0) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day')) auth_routes_seen_today,
      (SELECT COALESCE(SUM(CAST(json_extract(result_json,'$.routeSummary.captchaRoutes') AS INTEGER)),0) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day')) captcha_routes_seen_today,
      (SELECT COALESCE(SUM(CAST(json_extract(result_json,'$.routeSummary.policyBlockers') AS INTEGER)),0) FROM compute_overflow_jobs WHERE job_type='distribution_route_research' AND status='completed' AND completed_at>=datetime('now','start of day')) policy_blockers_seen_today,
      (SELECT COUNT(*) FROM distribution_auto_adapters a JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug WHERE a.policy_state='verified' AND a.confidence>=95 AND o.status='ready_to_submit') adapters_ready,
      (SELECT COUNT(*) FROM distribution_qualification_events WHERE result='ready_to_submit' AND created_at>=datetime('now','-15 minutes')) qualification_ready_15m,
      (SELECT COUNT(*) FROM distribution_qualification_events WHERE result='research_required' AND created_at>=datetime('now','-15 minutes')) qualification_research_15m,
      (SELECT COUNT(*) FROM distribution_qualification_events WHERE result='human_action_required' AND created_at>=datetime('now','-15 minutes')) qualification_human_15m,
      (SELECT COUNT(*) FROM distribution_qualification_events WHERE result='auth_required' AND created_at>=datetime('now','-15 minutes')) qualification_auth_15m,
      (SELECT COUNT(*) FROM distribution_qualification_events WHERE result='policy_blocked' AND created_at>=datetime('now','-15 minutes')) qualification_policy_15m,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE job_type='authorized_http_action' AND created_at>=datetime('now','start of day')) actions_authorized_today,
      (SELECT COUNT(*) FROM compute_overflow_jobs WHERE job_type='authorized_http_action' AND status='completed' AND completed_at>=datetime('now','start of day')) actions_completed_today,
      (SELECT COUNT(*) FROM distribution_submissions WHERE submission_type='auto_discovered_json' AND status IN ('submitted','pending_review','verified') AND COALESCE(submitted_at,last_attempt_at,created_at)>=datetime('now','start of day')) submissions_accepted_today,
      (SELECT COUNT(*) FROM distribution_opportunities WHERE status IN ('verified','live') AND updated_at>=datetime('now','start of day')) placements_verified_today`).first().catch(()=>null)
  ]);
  const usage=Object.fromEntries(rows(budgets).map(x=>[String(x.kind),num(x.used_today)]));
  const distributionFunnel={
    researchCompletedToday:num(funnel?.research_completed_today),
    classifiedResearchJobsToday:num(funnel?.classified_research_jobs_today),
    submissionRoutesFoundToday:num(funnel?.submission_routes_found_today),
    machineCandidatesFoundToday:num(funnel?.machine_candidates_found_today),
    formRoutesSeenToday:num(funnel?.form_routes_seen_today),
    authRoutesSeenToday:num(funnel?.auth_routes_seen_today),
    captchaRoutesSeenToday:num(funnel?.captcha_routes_seen_today),
    policyBlockersSeenToday:num(funnel?.policy_blockers_seen_today),
    adaptersReady:num(funnel?.adapters_ready),
    qualificationReady15m:num(funnel?.qualification_ready_15m),
    qualificationResearch15m:num(funnel?.qualification_research_15m),
    qualificationHuman15m:num(funnel?.qualification_human_15m),
    qualificationAuth15m:num(funnel?.qualification_auth_15m),
    qualificationPolicy15m:num(funnel?.qualification_policy_15m),
    actionsAuthorizedToday:num(funnel?.actions_authorized_today),
    actionsCompletedToday:num(funnel?.actions_completed_today),
    submissionsAcceptedToday:num(funnel?.submissions_accepted_today),
    placementsVerifiedToday:num(funnel?.placements_verified_today)
  };
  return {
    status:env.OVERFLOW_COMPUTE_URL?'configured':'awaiting_external_runtime',
    providerUrl:env.OVERFLOW_COMPUTE_URL?(()=>{try{return new URL(env.OVERFLOW_COMPUTE_URL).origin}catch{return null}})():null,
    dailyJobBudget:DAILY_JOB_BUDGET,researchUsedToday:num(usage.research),
    executionDailyJobBudget:EXECUTION_DAILY_JOB_BUDGET,executionUsedToday:num(usage.execution),
    batchSize:BATCH_SIZE,maxActiveBatches:MAX_ACTIVE_BATCHES,
    distributionResearchBucketHours:DISTRIBUTION_RESEARCH_BUCKET_HOURS,distributionClassifierVersion:DISTRIBUTION_CLASSIFIER_VERSION,roleEmailResearchBucketHours:ROLE_EMAIL_RESEARCH_BUCKET_HOURS,
    queued:num(funnel?.canonical_queued),runnableQueued:num(funnel?.runnable_queued),deferredQueued:num(funnel?.deferred_queued),nextAvailableAt:funnel?.next_available_at||null,
    leased:num(funnel?.canonical_leased),completedToday:num(m?.completed_today),failedToday:num(m?.failed_today),createdToday:num(m?.created_today),
    activeBatches:num(funnel?.canonical_active_batches),completedBatchesToday:num(m?.completed_batches_today),lastDispatchedAt:m?.last_dispatched_at||null,lastCompletedAt:m?.last_completed_at||null,
    contactSupply,distributionFunnel,
    d1ReadModel:'canonical_queue_counts_plus_metrics_plus_distribution_funnel',
    githubActionsRole:'disabled_until_october',
    writeAmplificationGuard:'d1-write-guard-v1'
  };
}
async function enqueueJob(env,{jobKey,jobType,subjectType,subjectKey,priority,payload}){
  const jobId=`coj_${await shortHash(jobKey)}`;
  const w=await env.DB.prepare(`INSERT INTO compute_overflow_jobs(job_id,job_key,job_type,subject_type,subject_key,priority_score,payload_json,status,available_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'queued',datetime('now'),datetime('now'),datetime('now'))
    ON CONFLICT(job_key) DO NOTHING`)
    .bind(jobId,jobKey,jobType,subjectType||null,subjectKey||null,Number(priority||0),JSON.stringify(payload||{}).slice(0,12000)).run();
  return Number(w?.meta?.changes||w?.changes||0);
}
async function enqueueDistributionResearch(env){
  await ensureSchema(env);
  let remaining=await budgetRemaining(env,'research',DAILY_JOB_BUDGET);
  if(!remaining)return{enqueued:0,remaining:0,contactSupply:{enqueued:0,remaining:0}};
  let enqueued=0;
  const supply=await enqueueContactSupplyResearch(env,remaining);
  enqueued+=num(supply.enqueued);remaining=num(supply.remaining);
  if(remaining<=0){
    if(enqueued>0){await metricDelta(env,{queued:enqueued,created:enqueued});await budgetConsume(env,'research',enqueued);}
    return{enqueued,remaining:0,contactSupply:supply};
  }
  const routeBucket=Math.floor(Date.now()/(DISTRIBUTION_RESEARCH_BUCKET_HOURS*3600000));
  const roleEmailBucket=Math.floor(Date.now()/(ROLE_EMAIL_RESEARCH_BUCKET_HOURS*3600000));
  const limit=Math.min(500,remaining);
  const q=await env.DB.prepare(`SELECT surface_slug,surface_name,surface_type,action_url,distribution_score,status,next_action
    FROM distribution_opportunities
    WHERE human_required=0 AND action_url IS NOT NULL
      AND (
        status IN ('candidate','discovered')
        OR (status='research_required' AND (last_checked_at IS NULL OR last_checked_at<=datetime('now','-${DISTRIBUTION_RESEARCH_BUCKET_HOURS} hours')))
      )
      AND NOT EXISTS (
        SELECT 1 FROM compute_overflow_jobs j
        WHERE j.subject_key=distribution_opportunities.surface_slug
          AND j.job_type='distribution_route_research'
          AND j.created_at>=datetime('now','-${DISTRIBUTION_RESEARCH_BUCKET_HOURS} hours')
          AND CAST(COALESCE(json_extract(j.payload_json,'$.classifierVersion'),0) AS INTEGER)>=${DISTRIBUTION_CLASSIFIER_VERSION}
      )
    ORDER BY distribution_score DESC,updated_at ASC LIMIT ?`).bind(limit).all().catch(()=>({results:[]}));
  for(const row of rows(q)){
    if(remaining<=0||!isHttp(row.action_url))break;
    const urlHash=await shortHash(row.action_url);
    const payload={url:row.action_url,surfaceSlug:row.surface_slug,surfaceName:row.surface_name,surfaceType:row.surface_type,currentStatus:row.status,score:num(row.distribution_score),classifierVersion:DISTRIBUTION_CLASSIFIER_VERSION};
    const routeAdded=await enqueueJob(env,{jobKey:`route:v${DISTRIBUTION_CLASSIFIER_VERSION}:${row.surface_slug}:bucket:${routeBucket}:${urlHash}`,jobType:'distribution_route_research',subjectType:'surface',subjectKey:row.surface_slug,priority:num(row.distribution_score),payload});
    enqueued+=routeAdded;remaining=Math.max(0,remaining-routeAdded);
    if(remaining<=0)break;
    if(num(row.distribution_score)>=55){
      const contactAdded=await enqueueJob(env,{jobKey:`contact:${row.surface_slug}:bucket:${routeBucket}:${urlHash}`,jobType:'contact_route_research',subjectType:'surface',subjectKey:row.surface_slug,priority:Math.max(0,num(row.distribution_score)-5),payload});
      enqueued+=contactAdded;remaining=Math.max(0,remaining-contactAdded);
    }
  }
  if(remaining>0){
    const network=await env.DB.prepare(`SELECT surface_slug,domain,source_url,contact_source_url,priority_score,status
      FROM distribution_network_outreach
      WHERE contact_email IS NULL AND status IN ('queued','contact_route_found')
      ORDER BY priority_score DESC,updated_at ASC LIMIT ?`).bind(Math.min(120,remaining)).all().catch(()=>({results:[]}));
    for(const row of rows(network)){
      if(remaining<=0)break;
      const url=isHttp(row.contact_source_url)?row.contact_source_url:row.source_url;
      if(!isHttp(url)||!row.domain)continue;
      const keyHash=await shortHash(url);
      const added=await enqueueJob(env,{
        jobKey:`publisher-email:${row.surface_slug}:bucket:${roleEmailBucket}:${keyHash}`,
        jobType:'publisher_role_email_research',
        subjectType:'surface',subjectKey:row.surface_slug,
        priority:900+num(row.priority_score),
        payload:{url,domain:row.domain,surfaceSlug:row.surface_slug,authorizationClass:'public_role_email_discovery_v1'}
      });
      enqueued+=added;remaining=Math.max(0,remaining-added);
    }
  }
  if(remaining>0){
    const vendors=await env.DB.prepare(`SELECT tool_slug,vendor_domain,asset_url,priority_score,status
      FROM distribution_vendor_amplification
      WHERE contact_email IS NULL AND vendor_domain IS NOT NULL AND status='fallback_exhausted'
      ORDER BY priority_score DESC,updated_at ASC LIMIT ?`).bind(Math.min(120,remaining)).all().catch(()=>({results:[]}));
    for(const row of rows(vendors)){
      if(remaining<=0)break;
      const url=`https://${String(row.vendor_domain||'').replace(/^https?:\/\//,'').replace(/\/$/,'')}/`;
      if(!isHttp(url))continue;
      const keyHash=await shortHash(url);
      const added=await enqueueJob(env,{
        jobKey:`vendor-email:${row.tool_slug}:bucket:${roleEmailBucket}:${keyHash}`,
        jobType:'vendor_role_email_research',
        subjectType:'tool',subjectKey:row.tool_slug,
        priority:880+num(row.priority_score),
        payload:{url,domain:row.vendor_domain,toolSlug:row.tool_slug,assetUrl:row.asset_url,authorizationClass:'public_role_email_discovery_v1'}
      });
      enqueued+=added;remaining=Math.max(0,remaining-added);
    }
  }
  if(enqueued>0){await metricDelta(env,{queued:enqueued,created:enqueued});await budgetConsume(env,'research',enqueued);}
  return{enqueued,remaining,contactSupply:supply};
}

function encodedAdapterBody(contentType,payload){
  const type=String(contentType||'application/json').toLowerCase();
  if(type==='application/x-www-form-urlencoded')return new URLSearchParams(Object.entries(payload||{}).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v??'')])).toString();
  return JSON.stringify(payload||{});
}
async function enqueueAuthorizedExecution(env){
  await ensureSchema(env);
  let remaining=await budgetRemaining(env,'execution',EXECUTION_DAILY_JOB_BUDGET);
  if(!remaining)return{enqueued:0,submissionJobs:0,verificationJobs:0,remaining:0};
  let enqueued=0,submissionJobs=0,verificationJobs=0;

  const submitLimit=Math.min(300,remaining);
  const candidates=await env.DB.prepare(`SELECT a.surface_slug,a.endpoint,a.method,a.content_type,a.payload_template_json,a.verification_endpoint,a.public_url,
      o.distribution_score,COALESCE(l.operating_decision,'explore') operating_decision
    FROM distribution_auto_adapters a
    JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug
    LEFT JOIN distribution_economic_learning l ON l.surface_slug=a.surface_slug
    LEFT JOIN distribution_surface_costs c ON c.surface_slug=a.surface_slug
    LEFT JOIN auth_automation_capability ac ON ac.surface_slug=a.surface_slug
    WHERE a.policy_state='verified' AND a.confidence>=95 AND o.status='ready_to_submit'
      AND COALESCE(ac.automation_class,'public_automatic')<>'token_automatic'
      AND COALESCE(c.cost_amount,0)=0
      AND COALESCE(l.operating_decision,'explore') IN ('explore','measure','scale')
      AND NOT EXISTS (
        SELECT 1 FROM distribution_submissions queued
        WHERE queued.surface_slug=a.surface_slug
          AND queued.asset_url='https://trytoolscout.org/'
          AND queued.submission_type='auto_discovered_json'
          AND queued.status IN ('queued_external','submitted','pending_review','verified')
      )
    ORDER BY CASE COALESCE(l.operating_decision,'explore') WHEN 'scale' THEN 0 WHEN 'measure' THEN 1 ELSE 2 END,o.distribution_score DESC
    LIMIT ?`).bind(submitLimit).all().catch(()=>({results:[]}));

  for(const a of rows(candidates)){
    if(remaining<=0||!isHttp(a.endpoint))break;
    const method=String(a.method||'POST').toUpperCase();
    if(!['POST','PUT','PATCH'].includes(method))continue;
    let payload={};try{payload=JSON.parse(a.payload_template_json||'{}')}catch{continue}
    const contentType=String(a.content_type||'application/json').toLowerCase();
    if(!['application/json','application/x-www-form-urlencoded'].includes(contentType))continue;
    const prior=await env.DB.prepare(`SELECT submission_id,status,attempts FROM distribution_submissions WHERE surface_slug=? AND asset_url='https://trytoolscout.org/' AND submission_type='auto_discovered_json' LIMIT 1`).bind(a.surface_slug).first().catch(()=>null);
    if(prior&&['submitted','pending_review','verified'].includes(String(prior.status||'')))continue;
    if(prior&&num(prior.attempts)>=3)continue;
    const submissionId=prior?.submission_id||`sub_${crypto.randomUUID()}`;
    if(!prior){
      await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
        .bind(submissionId,a.surface_slug,'https://trytoolscout.org/','auto_discovered_json','queued_external',a.payload_template_json,a.endpoint,0).run().catch(()=>{});
    }else{
      await env.DB.prepare(`UPDATE distribution_submissions SET status='queued_external',action_url=?,payload_json=?,error=NULL,updated_at=datetime('now') WHERE submission_id=? AND status NOT IN ('submitted','verified')`)
        .bind(a.endpoint,a.payload_template_json,submissionId).run().catch(()=>{});
    }
    const keyHash=await shortHash(`${a.endpoint}|${method}|${contentType}|${a.payload_template_json}`);
    const added=await enqueueJob(env,{
      jobKey:`execute:${a.surface_slug}:${submissionId}:attempt:${num(prior?.attempts)+1}:${keyHash}`,
      jobType:'authorized_http_action',
      subjectType:'surface',subjectKey:a.surface_slug,
      priority:1200+num(a.distribution_score),
      payload:{
        surfaceSlug:a.surface_slug,submissionId,endpoint:a.endpoint,method,contentType,
        body:encodedAdapterBody(contentType,payload),
        verificationEndpoint:a.verification_endpoint||null,publicUrl:a.public_url||null,
        authorizationClass:'verified_free_auto_adapter_v1'
      }
    });
    if(added){enqueued+=added;submissionJobs+=added;remaining-=added;}
  }

  if(remaining>0){
    const verifyLimit=Math.min(120,remaining);
    const pending=await env.DB.prepare(`SELECT ds.submission_id,ds.surface_slug,ds.response_url,ds.action_url,a.verification_endpoint,a.public_url,o.distribution_score
      FROM distribution_submissions ds
      JOIN distribution_auto_adapters a ON a.surface_slug=ds.surface_slug
      LEFT JOIN distribution_opportunities o ON o.surface_slug=ds.surface_slug
      WHERE ds.submission_type='auto_discovered_json' AND ds.status='submitted'
        AND COALESCE(o.status,'') NOT IN ('verified','live')
      ORDER BY ds.submitted_at ASC LIMIT ?`).bind(verifyLimit).all().catch(()=>({results:[]}));
    for(const row of rows(pending)){
      if(remaining<=0)break;
      const target=[row.response_url,row.verification_endpoint,row.public_url].find(isHttp);
      if(!target)continue;
      const keyHash=await shortHash(target);
      const verifyBucket=Math.floor(Date.now()/(6*3600000));
      const added=await enqueueJob(env,{
        jobKey:`verify:${row.surface_slug}:${row.submission_id}:bucket:${verifyBucket}:${keyHash}`,
        jobType:'authorized_verification',
        subjectType:'surface',subjectKey:row.surface_slug,
        priority:1100+num(row.distribution_score),
        payload:{surfaceSlug:row.surface_slug,submissionId:row.submission_id,targetUrl:target,actionUrl:row.action_url||null,authorizationClass:'verified_publication_check_v1'}
      });
      if(added){enqueued+=added;verificationJobs+=added;remaining-=added;}
    }
  }

  if(enqueued>0){await metricDelta(env,{queued:enqueued,created:enqueued});await budgetConsume(env,'execution',enqueued);}
  return{enqueued,submissionJobs,verificationJobs,remaining};
}
async function requeueStaleBatches(env){
  await ensureSchema(env);
  const stale=await env.DB.prepare(`SELECT batch_id,job_count FROM compute_overflow_batches
    WHERE status IN ('dispatched','running') AND dispatched_at<=datetime('now','-${BATCH_TIMEOUT_MINUTES} minutes') LIMIT 20`).all().catch(()=>({results:[]}));
  let requeued=0;
  for(const row of rows(stale)){
    await env.DB.prepare(`UPDATE contact_supply_domain SET status='unresolved',next_research_at=datetime('now','+1 hour'),updated_at=datetime('now')
      WHERE domain IN (SELECT subject_key FROM compute_overflow_jobs WHERE batch_id=? AND job_type='contact_supply_public_research' AND status='leased') AND contact_email IS NULL`).bind(row.batch_id).run().catch(()=>{});
    const w=await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now'),last_error='batch_timeout_requeued',updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(row.batch_id).run();
    const changed=Number(w?.meta?.changes||w?.changes||0);requeued+=changed;
    await env.DB.prepare(`UPDATE compute_overflow_batches SET status='timed_out',last_error='completion_timeout',updated_at=datetime('now') WHERE batch_id=?`).bind(row.batch_id).run();
    if(changed>0)await metricDelta(env,{queued:changed,leased:-changed,activeBatches:-1});
  }
  return requeued;
}
async function createBatch(env){
  await ensureSchema(env);
  const active=await env.DB.prepare(`SELECT COUNT(*) n FROM compute_overflow_batches WHERE status IN ('dispatched','running')`).first().catch(()=>null);
  if(num(active?.n)>=MAX_ACTIVE_BATCHES)return null;
  const q=await env.DB.prepare(`SELECT job_id FROM compute_overflow_jobs WHERE status='queued' AND available_at<=datetime('now') ORDER BY priority_score DESC,created_at ASC LIMIT ?`).bind(BATCH_SIZE).all().catch(()=>({results:[]}));
  const ids=rows(q).map(x=>x.job_id).filter(Boolean);
  if(!ids.length)return null;
  const batchId=`cob_${crypto.randomUUID()}`;
  const completionToken=`${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash=await sha256(completionToken);
  await env.DB.prepare(`INSERT INTO compute_overflow_batches(batch_id,completion_token_hash,status,job_count,dispatched_at,created_at,updated_at) VALUES(?,?,'dispatched',?,datetime('now'),datetime('now'),datetime('now'))`).bind(batchId,tokenHash,ids.length).run();
  const placeholders=ids.map(()=>'?').join(',');
  const leaseWrite=await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='leased',batch_id=?,leased_at=datetime('now'),attempts=attempts+1,updated_at=datetime('now') WHERE job_id IN (${placeholders}) AND status='queued'`).bind(batchId,...ids).run();
  const leased=Number(leaseWrite?.meta?.changes||leaseWrite?.changes||0);
  if(leased>0)await metricDelta(env,{queued:-leased,leased,activeBatches:1,lastDispatched:true});
  return{batchId,completionToken,count:leased};
}
async function triggerBatch(env,batch){
  if(!env.OVERFLOW_COMPUTE_URL||!batch)return{ok:false,reason:'overflow_runtime_not_configured'};
  const endpoint=new URL(`/tick/${encodeURIComponent(batch.batchId)}`,env.OVERFLOW_COMPUTE_URL).toString();
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'ToolScout-Compute-Router/1.0'},body:JSON.stringify({batchId:batch.batchId,completionToken:batch.completionToken,toolscoutBaseUrl:'https://trytoolscout.org'}),signal:AbortSignal.timeout(10000)});
    await env.DB.prepare(`UPDATE compute_overflow_batches SET trigger_http_status=?,last_error=?,updated_at=datetime('now') WHERE batch_id=?`).bind(response.status,response.ok?null:`trigger_http_${response.status}`,batch.batchId).run();
    if(!response.ok)throw new Error(`trigger_http_${response.status}`);
    await event(env,'overflow_batch_dispatched','completed',`Dispatched ${batch.count} external compute job(s).`,{batchId:batch.batchId});
    return{ok:true,httpStatus:response.status};
  }catch(error){
    const w=await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now','+1 minute'),last_error=?,updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(safe(error?.message||error,300),batch.batchId).run();
    const restored=Number(w?.meta?.changes||w?.changes||0);
    await env.DB.prepare(`UPDATE compute_overflow_batches SET status='trigger_failed',last_error=?,updated_at=datetime('now') WHERE batch_id=?`).bind(safe(error?.message||error,300),batch.batchId).run();
    if(restored>0)await metricDelta(env,{queued:restored,leased:-restored,activeBatches:-1});
    await event(env,'overflow_batch_dispatch_failed','failed',safe(error?.message||error,500),{batchId:batch.batchId});
    return{ok:false,error:safe(error?.message||error,500)};
  }
}
async function isolatedOverflowStage(env,name,fn,fallback){
  try{return await fn()}catch(error){
    const message=safe(error?.message||error,600);
    await event(env,`overflow_${name}_failed`,'failed',message).catch(()=>{});
    return {...fallback,ok:false,error:message};
  }
}
async function acquireDispatchLock(env){
  await ensureSchema(env);
  const w=await env.DB.prepare(`INSERT INTO compute_overflow_locks(lock_name,lease_until,updated_at)
    VALUES('dispatch',datetime('now','+20 seconds'),datetime('now'))
    ON CONFLICT(lock_name) DO UPDATE SET lease_until=excluded.lease_until,updated_at=datetime('now')
    WHERE compute_overflow_locks.lease_until<=datetime('now')`).run().catch(()=>null);
  return Number(w?.meta?.changes||w?.changes||0)>0;
}
async function releaseDispatchLock(env){
  await env.DB.prepare(`UPDATE compute_overflow_locks SET lease_until=datetime('now','-1 second'),updated_at=datetime('now') WHERE lock_name='dispatch'`).run().catch(()=>{});
}
async function recoverTransientDispatchDeferrals(env){
  const w=await env.DB.prepare(`UPDATE compute_overflow_jobs
    SET available_at=datetime('now'),updated_at=datetime('now')
    WHERE status='queued'
      AND available_at>datetime('now')
      AND updated_at<=datetime('now','-30 seconds')
      AND (
        last_error LIKE 'trigger_http_%'
        OR last_error LIKE '%timeout%'
        OR last_error LIKE '%timed out%'
        OR last_error LIKE '%worker_busy%'
        OR last_error LIKE '%rate_limited%'
      )`).run().catch(()=>null);
  return Number(w?.meta?.changes||w?.changes||0);
}
async function dispatchAvailableBatches(env){
  const locked=await acquireDispatchLock(env);
  if(!locked)return[];
  const runs=[];
  try{
    await recoverTransientDispatchDeferrals(env);
    for(let slot=0;slot<MAX_ACTIVE_BATCHES;slot++){
      const batch=await isolatedOverflowStage(env,'batch_create',()=>createBatch(env),null);
      if(!batch||batch.ok===false||!batch.count)break;
      const dispatch=await isolatedOverflowStage(env,'batch_trigger',()=>triggerBatch(env,batch),{ok:false});
      runs.push({batch:{batchId:batch.batchId,count:batch.count},dispatch});
      if(dispatch?.reason==='overflow_runtime_not_configured')break;
    }
    return runs;
  }finally{
    await releaseDispatchLock(env);
  }
}

async function continueDistributionExecutionHandoff(env,surfaceSlugs=[]){
  const slugs=[...new Set((Array.isArray(surfaceSlugs)?surfaceSlugs:[]).map(x=>safe(x,120)).filter(Boolean))].slice(0,BATCH_SIZE);
  if(!slugs.length)return{ok:true,status:'no_distribution_handoff',qualified:0,executionEnqueued:0,dispatchSlotsUsed:0};
  const qualification=await isolatedOverflowStage(env,'research_handoff_qualification',()=>qualifyDistributionSurfaces(env,slugs),{ok:false,checked:0,ready:0});
  const execution=await isolatedOverflowStage(env,'research_handoff_execution_enqueue',()=>enqueueAuthorizedExecution(env),{ok:false,enqueued:0,submissionJobs:0,verificationJobs:0});
  const runs=await dispatchAvailableBatches(env);
  await event(env,'distribution_research_execution_handoff',qualification?.ok===false?'partial':'completed',
    `Research handoff processed ${slugs.length} surface(s): ${num(qualification?.checked)} canonically qualified, ${num(qualification?.ready)} machine-ready, ${num(execution?.submissionJobs)} machine-safe submission job(s) authorized; ${runs.filter(x=>x.dispatch?.ok).length} batch(es) dispatched.`,
    {surfaceSlugs:slugs.slice(0,25)}).catch(()=>{});
  return{ok:qualification?.ok!==false&&execution?.ok!==false,status:'closed_loop_handoff',surfaceCount:slugs.length,qualification,execution,dispatchSlotsUsed:runs.length,dispatches:runs.map(x=>x.dispatch)};
}
async function qualifyResearchReadySweep(env){
  const q=await env.DB.prepare(`SELECT surface_slug
    FROM distribution_opportunities
    WHERE human_required=0
      AND action_url IS NOT NULL
      AND status IN ('candidate','discovered','research_required')
      AND surface_slug<>'indexnow'
    ORDER BY COALESCE(last_checked_at,'1970-01-01') ASC,distribution_score DESC
    LIMIT 25`).all().catch(()=>({results:[]}));
  const slugs=rows(q).map(x=>safe(x.surface_slug,120)).filter(Boolean);
  if(!slugs.length)return{ok:true,requested:0,checked:0,ready:0};
  return qualifyDistributionSurfaces(env,slugs);
}
async function acquireCooldownLock(env,name,seconds=300){
  await ensureSchema(env);
  const modifier=`+${Math.max(30,Math.min(1800,Number(seconds)||300))} seconds`;
  const w=await env.DB.prepare(`INSERT INTO compute_overflow_locks(lock_name,lease_until,updated_at)
    VALUES(?,datetime('now',?),datetime('now'))
    ON CONFLICT(lock_name) DO UPDATE SET lease_until=excluded.lease_until,updated_at=datetime('now')
    WHERE compute_overflow_locks.lease_until<=datetime('now')`).bind(name,modifier).run().catch(()=>null);
  return Number(w?.meta?.changes||w?.changes||0)>0;
}
async function runQualificationWatchdog(env){
  const locked=await acquireCooldownLock(env,'qualification_watchdog',300);
  if(!locked)return{ok:true,skipped:true,reason:'qualification_watchdog_cooldown'};
  const qualification=await isolatedOverflowStage(env,'qualification_watchdog',()=>qualifyResearchReadySweep(env),{ok:false,requested:0,checked:0,ready:0});
  const execution=await isolatedOverflowStage(env,'qualification_watchdog_execution',()=>enqueueAuthorizedExecution(env),{ok:false,enqueued:0,submissionJobs:0,verificationJobs:0});
  const dispatches=await dispatchAvailableBatches(env);
  await event(env,'qualification_watchdog_cycle',qualification?.ok===false?'partial':'completed',
    `Qualification watchdog checked ${num(qualification?.checked)} surface(s), produced ${num(qualification?.ready)} ready adapter(s), authorized ${num(execution?.submissionJobs)} submission job(s), dispatched ${dispatches.filter(x=>x.dispatch?.ok).length} batch(es).`).catch(()=>{});
  return{ok:qualification?.ok!==false,qualification,execution,dispatches:dispatches.length};
}

async function runOverflowTick(env){
  if(!env.OVERFLOW_COMPUTE_URL)return{ok:true,status:'awaiting_external_runtime'};
  await ensureSchema(env);
  await ensureHotIndexes(env);
  const contactSupply=await isolatedOverflowStage(env,'contact_supply_seed',()=>ensureContactSupplySeeded(env),{skipped:true});
  const requeueStage=await isolatedOverflowStage(env,'stale_batch_requeue',()=>requeueStaleBatches(env),0);
  const requeued=typeof requeueStage==='number'?requeueStage:num(requeueStage?.requeued);

  // Drain already-queued work first. Slow discovery/qualification must never starve
  // the external executor when there is an existing backlog.
  const preRuns=await dispatchAvailableBatches(env);

  const qualification=await isolatedOverflowStage(env,'canonical_qualification_sweep',()=>qualifyResearchReadySweep(env),{ok:false,requested:0,checked:0,ready:0});
  const execution=await isolatedOverflowStage(env,'authorized_execution_enqueue',()=>enqueueAuthorizedExecution(env),{enqueued:0,submissionJobs:0,verificationJobs:0,remaining:0});
  const research=await isolatedOverflowStage(env,'research_enqueue',()=>enqueueDistributionResearch(env),{enqueued:0,remaining:0,contactSupply:{enqueued:0}});

  // A second pass fills slots only if the first pass had nothing to lease or a
  // very fast executor completed while the canonical stages were running.
  const postRuns=await dispatchAvailableBatches(env);
  const runs=[...preRuns,...postRuns];
  const first=runs[0]||null;
  const dispatched=runs.filter(x=>x.dispatch?.ok).length;
  const failedStages=[contactSupply,qualification,execution,research].filter(x=>x&&x.ok===false).length;
  const ok=dispatched>0||(!runs.length&&failedStages===0);
  const status=dispatched>0?(failedStages?'degraded_dispatched':'dispatched'):(failedStages?'degraded':'idle');
  return{
    ok,status,contactSupply,qualification,execution,research,requeued,
    batch:first?.batch||null,dispatch:first?.dispatch||{ok:true,skipped:true,reason:'no_batch_available'},
    batches:runs.map(x=>x.batch),dispatches:runs.map(x=>x.dispatch),
    dispatchSlotsUsed:runs.length,dispatchSlotsMax:MAX_ACTIVE_BATCHES,failedStages
  };
}
async function batchPayload(env,batchId){
  await ensureSchema(env);
  const batch=await env.DB.prepare(`SELECT batch_id,status,job_count,completion_token_hash FROM compute_overflow_batches WHERE batch_id=? LIMIT 1`).bind(batchId).first();
  if(!batch||!['dispatched','running'].includes(String(batch.status)))return null;
  const jobs=await env.DB.prepare(`SELECT job_id,job_type,subject_type,subject_key,priority_score,payload_json FROM compute_overflow_jobs WHERE batch_id=? AND status='leased' ORDER BY priority_score DESC,created_at ASC`).bind(batchId).all();
  await env.DB.prepare(`UPDATE compute_overflow_batches SET status='running',fetched_at=COALESCE(fetched_at,datetime('now')),updated_at=datetime('now') WHERE batch_id=? AND status='dispatched'`).bind(batchId).run();
  return{batch,jobs:rows(jobs)};
}
function sameHostRoute(source,target){
  try{
    const a=new URL(source),b=new URL(target);
    const ah=a.hostname.replace(/^www\./,''),bh=b.hostname.replace(/^www\./,'');
    return ['http:','https:'].includes(b.protocol)&&(ah===bh||ah.endsWith('.'+bh)||bh.endsWith('.'+ah));
  }catch{return false}
}
const OVERFLOW_SAFE_FORM_FIELDS=new Set([
  'name','title','product_name','tool_name','startup_name','company','company_name',
  'url','website','website_url','homepage','homepage_url','product_url','tool_url','site','site_url','product_website',
  'description','short_description','summary','overview','tagline',
  'category','categories','industry','type','slug','domain'
]);
function validatedOverflowMachineCandidate(sourceUrl,route,result){
  const c=route?.machineCandidate;
  if(!c||String(route?.kind||'')!=='submission'||route?.auth||route?.captcha)return null;
  if(Array.isArray(result?.blockers)&&result.blockers.length)return null;
  if(String(c.kind||'')!=='html_form'||String(c.method||'').toUpperCase()!=='POST'||String(c.contentType||'').toLowerCase()!=='application/x-www-form-urlencoded')return null;
  if(!isHttp(c.endpoint)||!sameHostRoute(sourceUrl,c.endpoint)||!sameHostRoute(route.url,c.endpoint))return null;
  const payload=c.payload&&typeof c.payload==='object'&&!Array.isArray(c.payload)?c.payload:null;
  if(!payload)return null;
  const keys=Object.keys(payload);
  if(keys.some(k=>/csrf|token|captcha|terms|agree|consent|password|auth|payment|card/i.test(k)))return null;
  if(keys.some(k=>typeof payload[k]!=='string'||String(payload[k]).length>500))return null;
  const useful=keys.filter(k=>OVERFLOW_SAFE_FORM_FIELDS.has(k)).length;
  if(useful<2)return null;
  return{endpoint:c.endpoint,method:'POST',contentType:'application/x-www-form-urlencoded',payload,confidence:Math.max(95,Math.min(98,num(c.confidence)||96))};
}
async function applyDistributionResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug;
  if(!slug)return{applied:false};
  const routes=(Array.isArray(result?.routes)?result.routes:[]).filter(r=>r?.url&&sameHostRoute(payload.url,r.url)&&['submission','auth','captcha'].includes(String(r.kind||'')));
  const best=routes.find(r=>String(r.kind||'')==='submission'&&r.machineCandidate)
    ||routes.find(r=>String(r.kind||'')==='submission')
    ||routes.find(r=>String(r.kind||'')==='auth')
    ||routes.find(r=>String(r.kind||'')==='captcha')
    ||null;
  const machineCandidate=best?validatedOverflowMachineCandidate(payload.url,best,result):null;
  const detail=machineCandidate
    ?'External overflow research discovered and structurally validated a same-host machine-safe POST form. Canonical Cloudflare policy accepted the adapter and execution can proceed immediately.'
    :best
      ?`External overflow research discovered a ${best.kind} route. Canonical Cloudflare validation is queued before any execution.`
      :`External overflow research completed without a verified submission route. Canonical engines may continue alternate-route research.`;
  const actionUrl=best?.url||null;
  let w=null;
  if(machineCandidate){
    await env.DB.prepare(`INSERT INTO distribution_auto_adapters(surface_slug,source_url,endpoint,method,content_type,payload_template_json,confidence,policy_state,verification_source,verification_endpoint,public_url,verification_method,auth_type,auth_detail,last_checked_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'verified',?,NULL,NULL,'GET',NULL,NULL,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(surface_slug) DO UPDATE SET source_url=excluded.source_url,endpoint=excluded.endpoint,method=excluded.method,content_type=excluded.content_type,payload_template_json=excluded.payload_template_json,confidence=excluded.confidence,policy_state='verified',verification_source=excluded.verification_source,verification_endpoint=NULL,public_url=NULL,verification_method='GET',auth_type=NULL,auth_detail=NULL,last_checked_at=datetime('now'),updated_at=datetime('now')`)
      .bind(slug,actionUrl,machineCandidate.endpoint,machineCandidate.method,machineCandidate.contentType,JSON.stringify(machineCandidate.payload),machineCandidate.confidence,actionUrl).run();
    w=await env.DB.prepare(`UPDATE distribution_opportunities SET
        action_url=COALESCE(?,action_url),
        status='ready_to_submit',
        human_required=0,
        automation_potential=95,
        acceptance_probability=70,
        next_action=?,
        last_checked_at=datetime('now'),
        updated_at=datetime('now')
      WHERE surface_slug=? AND status NOT IN ('verified','live','submitted','pending_review','policy_blocked','rejected','skipped','unavailable_free')`)
      .bind(actionUrl,safe(detail,1000),slug).run().catch(()=>null);
    await env.DB.prepare(`INSERT INTO distribution_qualification_events(qualification_id,surface_slug,source_url,result,detail,created_at)
      VALUES(?,?,?,?,?,datetime('now'))`).bind(`qual_${crypto.randomUUID()}`,slug,actionUrl,'ready_to_submit',`overflow_verified_safe_form_adapter:${machineCandidate.endpoint}`).run().catch(()=>{});
  }else{
    w=await env.DB.prepare(`UPDATE distribution_opportunities SET
        action_url=COALESCE(?,action_url),
        status=CASE WHEN status IN ('candidate','discovered') THEN 'research_required' ELSE status END,
        next_action=?,
        last_checked_at=NULL,
        updated_at=datetime('now')
      WHERE surface_slug=? AND human_required=0 AND status NOT IN ('verified','live','submitted','pending_review','policy_blocked','rejected','skipped','unavailable_free')`)
      .bind(actionUrl,safe(detail,1000),slug).run().catch(()=>null);
  }
  try{await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at)
    VALUES(?,?, 'overflow_compute_research','completed',?,?,?,datetime('now'),datetime('now'))`)
    .bind(`overflow_${crypto.randomUUID()}`,slug,payload.url||null,actionUrl||payload.url||null,safe(JSON.stringify({classification:result?.classification||null,route:best||null,machineCandidate:Boolean(machineCandidate),blockers:result?.blockers||[]}),1600)).run()}catch{}
  return{applied:Number(w?.meta?.changes||w?.changes||0)>0,slug,route:best,machineCandidate:Boolean(machineCandidate)};
}
async function applyContactResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug;
  if(!slug)return{applied:0};
  const contacts=Array.isArray(result?.contactRoutes)?result.contactRoutes.slice(0,8):[];
  let applied=0;
  for(const route of contacts){
    if(!route?.url||(!sameHostRoute(payload.url,route.url)&&!String(route.url).startsWith('mailto:')))continue;
    const routeId=`overflow_${await shortHash(`${slug}:${route.kind}:${route.url}`)}`;
    const domain=(()=>{try{return new URL(payload.url).hostname.replace(/^www\./,'')}catch{return''}})();
    const w=await env.DB.prepare(`INSERT INTO distribution_contact_routes(route_id,surface_slug,domain,route_type,route_url,source_url,status,first_seen_at,last_seen_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'discovered',datetime('now'),datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(route_id) DO UPDATE SET last_seen_at=datetime('now'),updated_at=datetime('now')`)
      .bind(routeId,slug,domain,safe(route.kind||'contact',40),safe(route.url,2000),safe(payload.url,2000)).run().catch(()=>null);
    applied+=Number(w?.meta?.changes||w?.changes||0);
  }
  return{applied,slug};
}

function safeSameHostEvidence(endpoint,value){
  if(!value)return null;
  try{
    const u=new URL(String(value));if(u.protocol!=='https:'||!sameHostRoute(endpoint,u.href))return null;return u.href;
  }catch{return null}
}
async function currentAdapterAuthorization(env,slug,payload){
  const row=await env.DB.prepare(`SELECT a.endpoint,a.method,a.content_type,a.payload_template_json,a.policy_state,a.confidence,
      COALESCE(c.cost_amount,0) cost_amount,o.status opportunity_status
    FROM distribution_auto_adapters a
    JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug
    LEFT JOIN distribution_surface_costs c ON c.surface_slug=a.surface_slug
    WHERE a.surface_slug=? LIMIT 1`).bind(slug).first().catch(()=>null);
  if(!row)return{ok:false,reason:'adapter_missing'};
  if(row.policy_state!=='verified'||num(row.confidence)<95)return{ok:false,reason:'adapter_no_longer_verified'};
  if(num(row.cost_amount)>0)return{ok:false,reason:'paid_route_not_authorized'};
  if(String(row.endpoint||'')!==String(payload.endpoint||''))return{ok:false,reason:'endpoint_changed'};
  if(String(row.method||'POST').toUpperCase()!==String(payload.method||'POST').toUpperCase())return{ok:false,reason:'method_changed'};
  if(String(row.content_type||'application/json').toLowerCase()!==String(payload.contentType||'application/json').toLowerCase())return{ok:false,reason:'content_type_changed'};
  let currentPayload={};try{currentPayload=JSON.parse(row.payload_template_json||'{}')}catch{return{ok:false,reason:'payload_template_invalid'}}
  if(encodedAdapterBody(row.content_type,currentPayload)!==String(payload.body||''))return{ok:false,reason:'payload_changed'};
  if(['policy_blocked','rejected','skipped','unavailable_free'].includes(String(row.opportunity_status||'')))return{ok:false,reason:'opportunity_no_longer_authorized'};
  return{ok:true,row};
}
async function applyAuthorizedActionResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug,submissionId=payload.submissionId;
  if(!slug||!submissionId)return{applied:false,reason:'missing_action_identity'};
  const auth=await currentAdapterAuthorization(env,slug,payload);
  if(!auth.ok){
    await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(`authorization_recheck:${auth.reason}`,submissionId).run().catch(()=>{});
    return{applied:false,reason:auth.reason};
  }
  const httpStatus=num(result?.httpStatus);
  const accepted=result?.ok===true&&httpStatus>=200&&httpStatus<300;
  if(accepted){
    const evidence=safeSameHostEvidence(payload.endpoint,result?.evidenceUrl)||safeSameHostEvidence(payload.endpoint,result?.finalUrl)||payload.verificationEndpoint||payload.publicUrl||payload.endpoint;
    await env.DB.prepare(`UPDATE distribution_submissions SET status='submitted',attempts=attempts+1,last_attempt_at=datetime('now'),submitted_at=COALESCE(submitted_at,datetime('now')),response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(evidence,submissionId).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='submitted',next_action='External execution plane completed an authorized machine-safe submission. Verification remains canonical before placement is counted.',updated_at=datetime('now') WHERE surface_slug=? AND status NOT IN ('verified','live')`).bind(slug).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at)
      VALUES(?,?, 'external_authorized_submission','completed',?,?,?,datetime('now'),datetime('now'))`)
      .bind(`extsub_${crypto.randomUUID()}`,slug,payload.endpoint,evidence,`Render executed a Cloudflare-authorized verified free adapter. HTTP ${httpStatus}. Cloudflare retained decision and verification authority.`).run().catch(()=>{});
    return{applied:true,accepted:true,evidence};
  }
  await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`)
    .bind(`external_http_${httpStatus||0}:${safe(result?.error||'submission_failed',300)}`,submissionId).run().catch(()=>{});
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,detail,observed_at,created_at)
    VALUES(?,?, 'external_authorized_submission','failed',?,?,datetime('now'),datetime('now'))`)
    .bind(`extsubfail_${crypto.randomUUID()}`,slug,payload.endpoint,`Authorized external submission failed. HTTP ${httpStatus||0}: ${safe(result?.error||'unknown',300)}`).run().catch(()=>{});
  return{applied:true,accepted:false};
}
async function applyAuthorizedVerificationResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug,submissionId=payload.submissionId,target=payload.targetUrl;
  if(!slug||!submissionId||!isHttp(target))return{applied:false,reason:'missing_verification_identity'};
  const row=await env.DB.prepare(`SELECT ds.status,ds.response_url,ds.action_url,a.verification_endpoint,a.public_url
    FROM distribution_submissions ds JOIN distribution_auto_adapters a ON a.surface_slug=ds.surface_slug
    WHERE ds.submission_id=? AND ds.surface_slug=? LIMIT 1`).bind(submissionId,slug).first().catch(()=>null);
  if(!row)return{applied:false,reason:'submission_missing'};
  const allowed=[row.response_url,row.verification_endpoint,row.public_url].filter(Boolean);
  if(!allowed.some(x=>String(x)===String(target)))return{applied:false,reason:'verification_target_changed'};
  const httpStatus=num(result?.httpStatus);
  if(result?.ok===true&&httpStatus>=200&&httpStatus<300){
    const publicUrl=safeSameHostEvidence(target,result?.finalUrl)||target;
    await env.DB.prepare(`UPDATE distribution_submissions SET response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(publicUrl,submissionId).run();
    await env.DB.prepare(`UPDATE distribution_auto_adapters SET public_url=COALESCE(public_url,?),verification_endpoint=COALESCE(verification_endpoint,?),updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,target,slug).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='verified',live_url=COALESCE(live_url,?),last_checked_at=datetime('now'),next_action='External verification confirmed publication. Continue attribution and performance measurement.',updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,slug).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,destination_url,detail,observed_at,created_at)
      VALUES(?,?, 'external_publication_verification','verified',?,?,datetime('now'),datetime('now'))`)
      .bind(`extverify_${crypto.randomUUID()}`,slug,publicUrl,`Render performed the network check; Cloudflare validated the authorized verification target and recorded the public placement. HTTP ${httpStatus}.`).run().catch(()=>{});
    return{applied:true,verified:true,publicUrl};
  }
  await env.DB.prepare(`UPDATE distribution_opportunities SET last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(slug).run().catch(()=>{});
  return{applied:true,verified:false,httpStatus};
}
function roleMailbox(email){
  const m=String(email||'').trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if(!m)return null;
  if(!/^(editorial|editor|partnerships?|partners?|submissions?|submit|newsletter|press|media|growth|marketing|hello|contact|team|info)([._+-].*)?$/.test(m[1]))return null;
  return{email:m[0],local:m[1],domain:m[2].replace(/^www\./,'')};
}
function domainFamily(a,b){
  const x=String(a||'').toLowerCase().replace(/^www\./,''),y=String(b||'').toLowerCase().replace(/^www\./,'');
  return Boolean(x&&y)&&(x===y||x.endsWith('.'+y)||y.endsWith('.'+x));
}
async function applyRoleEmailResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  if(payload.authorizationClass!=='public_role_email_discovery_v1')return{applied:false,reason:'email_discovery_contract_mismatch'};
  const emails=Array.isArray(result?.roleEmails)?result.roleEmails:[];
  const candidate=emails.map(x=>({...x,parsed:roleMailbox(x?.email)})).find(x=>x.parsed&&domainFamily(x.parsed.domain,payload.domain));
  if(!candidate)return{applied:false,reason:'no_public_same_domain_role_email'};
  if(job.job_type==='publisher_role_email_research'){
    const w=await env.DB.prepare(`UPDATE distribution_network_outreach SET contact_email=?,contact_source_url=?,contact_checked_at=datetime('now'),status='contact_found',updated_at=datetime('now')
      WHERE surface_slug=? AND contact_email IS NULL AND status IN ('queued','contact_route_found')`)
      .bind(candidate.parsed.email,safe(candidate.sourceUrl||payload.url,2000),job.subject_key).run().catch(()=>null);
    const changed=Number(w?.meta?.changes||w?.changes||0);
    if(changed)await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,detail,observed_at,created_at)
      VALUES(?,?, 'publisher_contact_found','completed',?,?,datetime('now'),datetime('now'))`)
      .bind(`overflow_email_${crypto.randomUUID()}`,job.subject_key,safe(candidate.sourceUrl||payload.url,2000),'Render discovered a public same-domain role mailbox; Cloudflare validated it before admitting email outreach.').run().catch(()=>{});
    return{applied:changed>0,email:candidate.parsed.email};
  }
  if(job.job_type==='vendor_role_email_research'){
    const w=await env.DB.prepare(`UPDATE distribution_vendor_amplification SET contact_email=?,contact_source_url=?,contact_method='public_role_email',status='contact_found',updated_at=datetime('now')
      WHERE tool_slug=? AND contact_email IS NULL AND status='fallback_exhausted'`)
      .bind(candidate.parsed.email,safe(candidate.sourceUrl||payload.url,2000),job.subject_key).run().catch(()=>null);
    const changed=Number(w?.meta?.changes||w?.changes||0);
    if(changed)await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,source_url,detail,observed_at,created_at)
      VALUES(?, 'vendor_contact_found','completed','vendor_amplification',?,?,?,datetime('now'),datetime('now'))`)
      .bind(`overflow_vendor_email_${crypto.randomUUID()}`,job.subject_key,safe(candidate.sourceUrl||payload.url,2000),'Render discovered a public same-domain role mailbox; Cloudflare validated it before admitting email outreach.').run().catch(()=>{});
    return{applied:changed>0,email:candidate.parsed.email};
  }
  return{applied:false,reason:'unsupported_email_research_job'};
}
async function applyContactSupplyResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  if(payload.authorizationClass!=='public_role_email_discovery_v1')return{applied:false,reason:'contact_supply_contract_mismatch'};
  const domain=contactDomain(job.subject_key||payload.domain);
  if(!contactDomainEligible(domain))return{applied:false,reason:'invalid_contact_supply_domain'};
  const emails=Array.isArray(result?.roleEmails)?result.roleEmails:[];
  const candidate=emails.map(x=>({...x,parsed:roleMailbox(x?.email)})).find(x=>x.parsed&&domainFamily(x.parsed.domain,domain));
  const contactRoutes=Array.isArray(result?.contactRoutes)?result.contactRoutes.filter(x=>x?.url&&isHttp(x.url)&&sameHostRoute(`https://${domain}/`,x.url)).slice(0,6):[];
  const bestRoute=contactRoutes.find(x=>['form','contact_page','submission'].includes(String(x.kind||'')))||contactRoutes[0]||null;
  let applied=0;
  if(candidate){
    const email=candidate.parsed.email,source=safe(candidate.sourceUrl||payload.url||`https://${domain}/`,2000);
    const cooldown=await domainInOutreachCooldown(env,domain);
    const w=await env.DB.prepare(`UPDATE contact_supply_domain SET
      status=?,contact_email=?,contact_source='public_role_email',contact_source_url=?,provider='public_web',
      public_attempts=public_attempts+1,last_researched_at=datetime('now'),next_research_at=datetime('now','+30 days'),updated_at=datetime('now')
      WHERE domain=?`).bind(cooldown?'cooldown':'ready_email',email,source,domain).run().catch(()=>null);
    applied+=Number(w?.meta?.changes||w?.changes||0);

    await env.DB.prepare(`UPDATE distribution_vendor_amplification SET
      contact_email=?,contact_source_url=?,contact_method='public_role_email',status='contact_found',updated_at=datetime('now')
      WHERE lower(vendor_domain)=? AND contact_email IS NULL AND status NOT IN ('sent','reputation_quarantine')`)
      .bind(email,source,domain).run().catch(()=>{});
    await env.DB.prepare(`UPDATE distribution_network_outreach SET
      contact_email=?,contact_source_url=?,contact_checked_at=datetime('now'),status='contact_found',updated_at=datetime('now')
      WHERE lower(domain)=? AND contact_email IS NULL AND status NOT IN ('sent','adopted','reputation_quarantine')`)
      .bind(email,source,domain).run().catch(()=>{});
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,source_url,detail,observed_at,created_at)
      VALUES(?, 'contact_supply_email_found','completed','contact_supply',?,?,?,datetime('now'),datetime('now'))`)
      .bind(`contact_supply_${crypto.randomUUID()}`,domain,source,`Contact Supply Engine validated a public same-domain role mailbox for ${domain} and propagated it to eligible outreach lanes.`).run().catch(()=>{});
      return{applied:applied>0,email,domain,status:cooldown?'cooldown':'ready_email'};
  }

  if(bestRoute){
    const routeUrl=safe(bestRoute.url,2000),routeType=safe(bestRoute.kind||'contact_page',60);
    const w=await env.DB.prepare(`UPDATE contact_supply_domain SET
      status='ready_route',route_type=?,route_url=?,contact_source='public_contact_route',contact_source_url=?,provider='public_web',
      public_attempts=public_attempts+1,last_researched_at=datetime('now'),next_research_at=datetime('now','+14 days'),updated_at=datetime('now')
      WHERE domain=? AND contact_email IS NULL`).bind(routeType,routeUrl,routeUrl,domain).run().catch(()=>null);
    applied+=Number(w?.meta?.changes||w?.changes||0);
    const networks=await env.DB.prepare(`SELECT surface_slug FROM distribution_network_outreach WHERE lower(domain)=? LIMIT 20`).bind(domain).all().catch(()=>({results:[]}));
    for(const row of rows(networks)){
      const routeId=`contact_supply_${await shortHash(`${row.surface_slug}:${routeType}:${routeUrl}`)}`;
      await env.DB.prepare(`INSERT INTO distribution_contact_routes(route_id,surface_slug,domain,route_type,route_url,source_url,status,first_seen_at,last_seen_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'discovered',datetime('now'),datetime('now'),datetime('now'),datetime('now'))
        ON CONFLICT(route_id) DO UPDATE SET last_seen_at=datetime('now'),updated_at=datetime('now')`)
        .bind(routeId,row.surface_slug,domain,routeType,routeUrl,payload.url||routeUrl).run().catch(()=>{});
      await env.DB.prepare(`UPDATE distribution_network_outreach SET contact_source_url=COALESCE(contact_source_url,?),status=CASE WHEN status IN ('queued','suppressed_no_contact') THEN 'contact_route_found' ELSE status END,updated_at=datetime('now') WHERE surface_slug=?`)
        .bind(routeUrl,row.surface_slug).run().catch(()=>{});
    }
      return{applied:applied>0,domain,status:'ready_route',route:bestRoute};
  }

  const attempts=await env.DB.prepare(`SELECT public_attempts FROM contact_supply_domain WHERE domain=? LIMIT 1`).bind(domain).first().catch(()=>({public_attempts:0}));
  const nextAttempts=num(attempts?.public_attempts)+1;
  const newStatus=nextAttempts>=2?'provider_blocked':'unresolved';
  const delay=nextAttempts>=2?30:3;
  const w=await env.DB.prepare(`UPDATE contact_supply_domain SET
    status=?,public_attempts=?,last_researched_at=datetime('now'),next_research_at=datetime('now','+'||?||' days'),
    apollo_status='plan_blocked',updated_at=datetime('now')
    WHERE domain=? AND contact_email IS NULL`).bind(newStatus,nextAttempts,delay,domain).run().catch(()=>null);
  applied+=Number(w?.meta?.changes||w?.changes||0);
  return{applied:applied>0,domain,status:newStatus,reason:'no_public_contact_evidence'};
}
async function applyContactSupplyFailure(env,job,result){
  const domain=contactDomain(job.subject_key);if(!contactDomainEligible(domain))return{applied:false};
  const row=await env.DB.prepare(`SELECT public_attempts FROM contact_supply_domain WHERE domain=? LIMIT 1`).bind(domain).first().catch(()=>({public_attempts:0}));
  const attempts=num(row?.public_attempts)+1;
  const status=attempts>=2?'provider_blocked':'unresolved';
  const delay=attempts>=2?30:1;
  const w=await env.DB.prepare(`UPDATE contact_supply_domain SET status=?,public_attempts=?,last_researched_at=datetime('now'),next_research_at=datetime('now','+'||?||' days'),apollo_status='plan_blocked',updated_at=datetime('now') WHERE domain=? AND contact_email IS NULL`)
    .bind(status,attempts,delay,domain).run().catch(()=>null);
  return{applied:Number(w?.meta?.changes||w?.changes||0)>0,status,domain,error:safe(result?.error||'research_failed',300)};
}
async function completeBatch(request,env,ctx,batchId){
  await ensureSchema(env);
  const batch=await env.DB.prepare(`SELECT batch_id,status,completion_token_hash FROM compute_overflow_batches WHERE batch_id=? LIMIT 1`).bind(batchId).first();
  if(!batch)return Response.json({error:'unknown_batch'},{status:404,headers:JSON_H});
  if(batch.status==='completed')return Response.json({ok:true,idempotent:true,batchId},{headers:JSON_H});
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token||(await sha256(token))!==batch.completion_token_hash)return Response.json({error:'invalid_completion_capability'},{status:403,headers:JSON_H});
  let body={};try{body=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_H})}
  const results=Array.isArray(body.results)?body.results.slice(0,BATCH_SIZE):[];
  let completed=0,failed=0,retried=0,applied=0,contactSupplyTouched=false;
  const distributionHandoffSlugs=[];
  let metricQueued=0,metricLeased=0,metricCompleted=0,metricFailed=0;
  for(const result of results){
    const jobId=safe(result?.jobId,120);if(!jobId)continue;
    const job=await env.DB.prepare(`SELECT job_id,job_type,subject_key,payload_json,attempts FROM compute_overflow_jobs WHERE job_id=? AND batch_id=? AND status='leased' LIMIT 1`).bind(jobId,batchId).first();
    if(!job)continue;
    const ok=result?.ok!==false;
    if(job.job_type==='authorized_http_action'){const a=await applyAuthorizedActionResult(env,job,result);applied+=a.applied?1:0}
    else if(job.job_type==='authorized_verification'){const a=await applyAuthorizedVerificationResult(env,job,result);applied+=a.applied?1:0}
    else if(job.job_type==='contact_supply_public_research'){
      contactSupplyTouched=true;
      const a=ok?await applyContactSupplyResult(env,job,result):await applyContactSupplyFailure(env,job,result);applied+=a.applied?1:0;
    }else if(ok){
      if(job.job_type==='distribution_route_research'){
        const a=await applyDistributionResult(env,job,result);applied+=a.applied?1:0;
        if(a.applied&&a.slug)distributionHandoffSlugs.push(a.slug);
      }
      else if(job.job_type==='contact_route_research'){const a=await applyContactResult(env,job,result);applied+=num(a.applied)}
      else if(job.job_type==='publisher_role_email_research'||job.job_type==='vendor_role_email_research'){const a=await applyRoleEmailResult(env,job,result);applied+=a.applied?1:0}
    }
    const externalUnreachable=!ok&&String(result?.error||'')==='source_unreachable'&&['distribution_route_research','contact_route_research','publisher_role_email_research','vendor_role_email_research','contact_supply_public_research'].includes(String(job.job_type||''));
    const maxExternalAttempts=job.job_type==='contact_supply_public_research'?2:3;
    if(externalUnreachable&&num(job.attempts)<maxExternalAttempts){
      await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,completed_at=NULL,available_at=datetime('now','+24 hours'),result_json=?,last_error='source_unreachable_backoff',updated_at=datetime('now') WHERE job_id=?`)
        .bind(JSON.stringify(result).slice(0,24000),jobId).run();
      retried++;metricLeased-=1;metricQueued+=1;
    }else if(externalUnreachable){
      await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='completed',completed_at=datetime('now'),result_json=?,last_error=NULL,updated_at=datetime('now') WHERE job_id=?`)
        .bind(JSON.stringify({...result,outcome:'external_source_unreachable_exhausted'}).slice(0,24000),jobId).run();
      completed++;metricLeased-=1;metricCompleted+=1;
    }else{
      await env.DB.prepare(`UPDATE compute_overflow_jobs SET status=?,completed_at=datetime('now'),result_json=?,last_error=?,updated_at=datetime('now') WHERE job_id=?`)
        .bind(ok?'completed':'failed',JSON.stringify(result).slice(0,24000),ok?null:safe(result?.error||'external_compute_failed',600),jobId).run();
      if(ok){completed++;metricLeased-=1;metricCompleted+=1;}
      else{failed++;metricLeased-=1;metricFailed+=1;}
    }
  }
  const unresolved=await env.DB.prepare(`SELECT COUNT(*) n FROM compute_overflow_jobs WHERE batch_id=? AND status='leased'`).bind(batchId).first().catch(()=>({n:0}));
  if(num(unresolved?.n)>0){
    await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now','+5 minutes'),last_error='missing_from_batch_result',updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(batchId).run();
  }
  await env.DB.prepare(`UPDATE compute_overflow_batches SET status='completed',completed_at=datetime('now'),result_summary_json=?,updated_at=datetime('now') WHERE batch_id=?`)
    .bind(JSON.stringify({completed,failed,retried,applied,missing:num(unresolved?.n)}),batchId).run();
  const missing=num(unresolved?.n);
  metricLeased-=missing;metricQueued+=missing;
  await metricDelta(env,{queued:metricQueued,leased:metricLeased,completed:metricCompleted,failed:metricFailed,activeBatches:-1,completedBatches:1,lastCompleted:true});
  if(contactSupplyTouched)await refreshContactSupplyMetrics(env);
  await event(env,'overflow_batch_completed',failed?'partial':'completed',`External compute returned ${completed} completed, ${retried} externally-unreachable retry, and ${failed} operationally failed job(s); ${applied} canonical records were advanced.`,{batchId});
  const handoffSlugs=[...new Set(distributionHandoffSlugs)].slice(0,BATCH_SIZE);
  let handoffWork=null;
  if(handoffSlugs.length){
    handoffWork=continueDistributionExecutionHandoff(env,handoffSlugs).catch(async error=>{
      await event(env,'distribution_research_execution_handoff','failed',safe(error?.message||error,600),{batchId}).catch(()=>{});
      return null;
    });
  }
  const refillWork=(async()=>{
    if(handoffWork)await handoffWork;
    const refilled=await dispatchAvailableBatches(env);
    if(refilled.length)await event(env,'overflow_queue_refilled','completed',`Completion callback immediately refilled ${refilled.length} external batch slot(s) from queued work.`,{batchId}).catch(()=>{});
    return refilled;
  })().catch(async error=>{
    await event(env,'overflow_queue_refill_failed','failed',safe(error?.message||error,600),{batchId}).catch(()=>{});
    return [];
  });
  if(ctx?.waitUntil)ctx.waitUntil(refillWork);else await refillWork;
  if(ctx&&env.ADMIN_TOKEN&&applied>0){
    const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'};
    ctx.waitUntil(base.fetch(new Request('https://trytoolscout.org/api/distribution/network/refresh',{method:'POST',headers}),env,ctx).catch(()=>null));
  }
  return Response.json({ok:true,batchId,completed,failed,retried,applied,missing,distributionHandoff:handoffSlugs.length},{headers:JSON_H});
}
async function serveBatch(env,batchId){
  const out=await batchPayload(env,batchId);
  if(!out)return Response.json({error:'batch_unavailable'},{status:404,headers:JSON_H});
  return Response.json({
    batchId,
    jobs:out.jobs.map(j=>{let payload={};try{payload=JSON.parse(j.payload_json||'{}')}catch{}return{jobId:j.job_id,type:j.job_type,subjectType:j.subject_type,subjectKey:j.subject_key,priority:num(j.priority_score),payload}})
  },{headers:JSON_H});
}
async function augmentRuntime(response,env){
  if(!response?.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  data.computeOverflow=await health(env);
  if(data.primary)data.primary.researchCompute=env.OVERFLOW_COMPUTE_URL?'external_overflow':'cloudflare_only_until_external_runtime_connected';
  if(data.githubActions)data.githubActions={...data.githubActions,role:'disabled_until_october',scheduledPrimary:false};
  return Response.json(data,{status:response.status,headers:JSON_H});
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/compute/health'){
      const snapshot=await health(env);
      if(ctx?.waitUntil&&snapshot.status==='configured'&&num(snapshot.runnableQueued)>0&&num(snapshot.activeBatches)===0){
        // Health is polled by the Command Center and operational probes. Use it only
        // as a lightweight executor watchdog: lease and trigger queued work now.
        ctx.waitUntil(dispatchAvailableBatches(env).catch(async error=>{await event(env,'health_watchdog_pump_failed','failed',safe(error?.message||error,600)).catch(()=>{});return null;}));
      }
      if(ctx?.waitUntil&&snapshot.status==='configured'&&num(snapshot.distributionFunnel?.submissionRoutesFoundToday)>0){
        // Five-minute cooldown keeps this bounded while giving the canonical qualifier
        // a fallback path even if a scheduled cycle is delayed.
        ctx.waitUntil(runQualificationWatchdog(env).catch(async error=>{await event(env,'qualification_watchdog_failed','failed',safe(error?.message||error,600)).catch(()=>{});return null;}));
      }
      return Response.json(snapshot,{headers:JSON_H});
    }
    if(request.method==='GET'&&u.pathname==='/api/contact-supply/health')return Response.json(await contactSupplyHealth(env),{headers:JSON_H});
    if(request.method==='POST'&&u.pathname==='/api/contact-supply/refresh'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await seedContactSupply(env),{headers:JSON_H});
    }
    if(request.method==='GET'&&u.pathname==='/api/auth-plane/health'){
      if(u.searchParams.get('fresh')==='1')await refreshAuthBrokerRuntimeHealth(env,{force:true}).catch(()=>null);
      return Response.json(await authPlaneHealth(env),{headers:JSON_H});
    }
    if(request.method==='POST'&&u.pathname==='/api/auth-plane/classify'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await classifyAuthBacklog(env,{limit:200}),{headers:JSON_H});
    }
    const authComplete=u.pathname.match(/^\/api\/auth-plane\/handoffs\/(ah_[A-Za-z0-9-]+)\/complete$/);
    if(request.method==='POST'&&authComplete){
      const response=await completeAuthHandoff(request,env,authComplete[1]);
      if(response.ok&&ctx?.waitUntil){
        ctx.waitUntil(authenticatedResumeSweep(env,{limit:1}).catch(()=>null));
      }
      return response;
    }
    if(request.method==='POST'&&u.pathname==='/api/compute/router/refresh'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await runOverflowTick(env),{headers:JSON_H});
    }
    const getMatch=u.pathname.match(/^\/api\/compute\/batches\/(cob_[A-Za-z0-9-]+)$/);
    if(request.method==='GET'&&getMatch)return serveBatch(env,getMatch[1]);
    const completeMatch=u.pathname.match(/^\/api\/compute\/batches\/(cob_[A-Za-z0-9-]+)\/complete$/);
    if(request.method==='POST'&&completeMatch)return completeBatch(request,env,ctx,completeMatch[1]);
    if(request.method==='GET'&&u.pathname==='/api/runtime/executors')return augmentRuntime(await base.fetch(request,env,ctx),env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    if(trigger===OVERFLOW_CRON){
      const minute=new Date(Number(event?.scheduledTime)||Date.now()).getUTCMinutes();
      const work=Promise.allSettled([
        runOverflowTick(env).catch(async error=>{await event(env,'overflow_tick_failed','failed',safe(error?.message||error,800));return null}),
        minute%30===0?classifyAuthBacklog(env,{limit:200}):Promise.resolve(null),
        minute===0&&new Date(Number(event?.scheduledTime)||Date.now()).getUTCHours()%6===0?seedContactSupply(env):Promise.resolve(null),
        Promise.resolve(null),
        Promise.resolve(null)
      ]);
      if(ctx?.waitUntil)ctx.waitUntil(work);
      return;
    }
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};

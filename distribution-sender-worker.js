import base from './distribution-contact-worker.js';
import {recordExecutionProof,deferExecutionTask} from './growth-execution-contract.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const MAKE_TOKEN_SHA256='2f9522abe5fb3d87a045b86940f6b5338cc5c9fc3f51ecbc5f5fc31000e3b72c';
const PUBLIC_HANDOFF_SHA256='54ed9bf169f84acd97387ebbb4f69c603606b074dccf2552c32e781f0a627178';

async function sha256(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function integrationOk(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!t)return false;if(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)return true;return (await sha256(t))===MAKE_TOKEN_SHA256}
async function publicHandoffOk(request,env){const bearer=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(bearer&&env.ADMIN_TOKEN&&bearer===env.ADMIN_TOKEN)return true;const token=String(request.headers.get('X-ToolScout-Handoff')||'');return Boolean(token)&&(await sha256(token))===PUBLIC_HANDOFF_SHA256}
function html(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function displayToolName(row){
  const subject=String(row?.suggested_subject||'').trim();
  const match=subject.match(/^(.*?)\s+featured on ToolScout$/i);
  if(match?.[1])return match[1].trim();
  return String(row?.tool_slug||'Tool').split('-').filter(Boolean).map(part=>part.length<=3?part.toUpperCase():part.charAt(0).toUpperCase()+part.slice(1)).join(' ');
}
let networkSchemaReady=null;
async function ensureNetworkSchema(env){
  if(networkSchemaReady)return networkSchemaReady;
  networkSchemaReady=env.DB.batch([
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
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_action_events_opportunity ON growth_action_events(opportunity_key,status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_network_status_priority ON distribution_network_outreach(status,priority_score DESC)`)
  ]).catch(error=>{networkSchemaReady=null;throw error});
  return networkSchemaReady;
}
function taggedOwned(value,{source,campaign,action,growth}){
  try{
    const u=new URL(String(value||''),'https://trytoolscout.org');
    if(u.hostname!=='trytoolscout.org')return String(value||'');
    if(u.pathname==='/index.html')u.pathname='/';
    else if(/\.html$/i.test(u.pathname))u.pathname=u.pathname.replace(/\.html$/i,'');
    if(source)u.searchParams.set('utm_source',source);
    u.searchParams.set('utm_medium','distribution');
    if(campaign)u.searchParams.set('utm_campaign',campaign);
    if(action)u.searchParams.set('ts_action',action);
    if(growth)u.searchParams.set('ts_growth',growth);
    return u.toString();
  }catch{return String(value||'')}
}
function cordialOutreach(row){
  const name=displayToolName(row),slug=String(row?.tool_slug||'').toLowerCase();
  const subject=`${name} featured on ToolScout`,action=`vendor:${slug}`,growth=`tool:${slug}`;
  const asset=taggedOwned(row?.asset_url||'https://trytoolscout.org',{source:'vendor_outreach',campaign:'vendor_reference_v22',action,growth});
  const profile=taggedOwned(`https://trytoolscout.org/tools/${encodeURIComponent(slug)}`,{source:'vendor_outreach',campaign:'vendor_reference_v22',action,growth});
  const publisherKit=taggedOwned('https://trytoolscout.org/distribution/publisher-kit',{source:'vendor_outreach',campaign:'vendor_reference_v22',action,growth});
  const body=`<p>Hello,</p><p>I hope you're well. I'm Pedro Caiano from ToolScout. We recently featured ${html(name)} in one of our software buying pages for people comparing tools for a specific job to be done.</p><p>Featured page:<br><a href="${html(asset)}">${html(asset)}</a></p><p>Your ToolScout profile:<br><a href="${html(profile)}">${html(profile)}</a></p><p>If either resource is genuinely useful to your team or audience, you are welcome to share it or cite the relevant ToolScout page from an appropriate resources, press, community or partner page. We do not request reciprocal links and we do not pay for ranking links.</p><p>If your team publishes software resources, our free feed and embed kit is here:<br><a href="${html(publisherKit)}">${html(publisherKit)}</a></p><p>ToolScout rankings are based on product fit and editorial criteria. Placements are not sold, and affiliate relationships do not change ranking or recommendation eligibility.</p><p>Best regards,<br>Pedro Caiano<br>ToolScout<br><a href="https://trytoolscout.org">trytoolscout.org</a></p>`;
  return {...row,suggested_subject:subject,suggested_body:body,growth_action_id:action,growth_opportunity_key:growth,tracked_asset_url:asset,acquisition_objective:'relevant_editorial_reference'};
}

async function leaseQueue(env,limit=3){
  await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status='contact_found',updated_at=datetime('now') WHERE status='sending' AND last_attempt_at < datetime('now','-24 hours')`).run();
  const n=Math.max(1,Math.min(3,Number(limit)||3));
  const r=await env.DB.prepare(`SELECT tool_slug,asset_url,priority_score,vendor_domain,contact_email,contact_name,contact_source_url,contact_method,suggested_subject,suggested_body FROM distribution_vendor_amplification WHERE status='contact_found' AND contact_method='public_role_email' AND contact_email IS NOT NULL ORDER BY priority_score DESC LIMIT ?`).bind(n).all();
  const raw=r.results||[];
  for(const x of raw){
    await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status='sending',last_attempt_at=datetime('now'),updated_at=datetime('now') WHERE tool_slug=? AND asset_url=? AND status='contact_found'`).bind(x.tool_slug,x.asset_url).run();
    const copy=cordialOutreach(x);
    await ensureNetworkSchema(env);
    await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'leased',datetime('now'),datetime('now')) ON CONFLICT(action_id) DO UPDATE SET target_url=excluded.target_url,status='leased',updated_at=datetime('now')`).bind(copy.growth_action_id,copy.growth_opportunity_key,'vendor_amplification','email',copy.tracked_asset_url).run().catch(()=>{});
  }
  if(raw.length)await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`vlease_${crypto.randomUUID()}`,'vendor_outreach_leased','ready','vendor_amplification',`${raw.length} vendor outreach item(s) leased to the private sender.`).run();
  return {status:'connected',leaseHours:24,items:raw.map(cordialOutreach)};
}

async function currentMakeSenderTask(env){
  try{return await env.DB.prepare(`SELECT task_id,subject_type,subject_key,action,priority_score,claimed_at FROM growth_execution_contract WHERE executor='make_sender' AND status='claimed' ORDER BY priority_score DESC,claimed_at ASC LIMIT 1`).first()}catch{return null}
}
async function validateMakeSenderTask(env,taskId,subjectType,subjectKey){
  if(!taskId)return null;
  try{
    const task=await env.DB.prepare(`SELECT task_id,executor,status,subject_type,subject_key,action FROM growth_execution_contract WHERE task_id=?`).bind(String(taskId)).first();
    if(!task||task.executor!=='make_sender'||task.subject_type!==subjectType||String(task.subject_key)!==String(subjectKey))return null;
    return task;
  }catch{return null}
}
async function recordAuthorityNoOutput(env,reason,taskId=null){
  const detail=`Authority handoff produced no external action: ${String(reason||'unknown').slice(0,180)}${taskId?` · task ${String(taskId).slice(0,180)}`:''}. This is a no-output acquisition cycle, not a growth success. Discovery/network replenishment is requested automatically.`;
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`authnoop_${crypto.randomUUID()}`,'authority_handoff_no_output','no_output','backlink_acquisition',detail).run().catch(()=>{});
}
async function replenishAuthorityPipeline(env){
  if(!env.ADMIN_TOKEN)return {scheduled:false,reason:'admin_token_unavailable'};
  const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`};
  const results=[];
  for(const target of ['/api/distribution/discovery/refresh','/api/distribution/network/refresh']){
    try{
      const r=await fetch('https://trytoolscout.org'+target,{method:'POST',headers,signal:AbortSignal.timeout(15000)});
      results.push({target,status:r.status,ok:r.ok});
    }catch(e){results.push({target,status:0,ok:false,error:String(e?.message||e).slice(0,200)})}
  }
  return {scheduled:true,results};
}
async function publicCandidates(env,limit=3){
  await ensureNetworkSchema(env);
  const n=Math.max(1,Math.min(3,Number(limit)||3));
  const task=await currentMakeSenderTask(env);
  if(!task){await recordAuthorityNoOutput(env,'no_claimed_make_sender_task');return {status:'connected',limit:n,items:[],reason:'no_claimed_make_sender_task',integrity:'task-specific-bounded-v3'};}
  const items=[];
  if(task.subject_type==='tool'){
    const row=await env.DB.prepare(`SELECT v.tool_slug,v.asset_url,v.priority_score,v.vendor_domain,v.contact_email,v.contact_source_url,v.suggested_subject,v.suggested_body,v.public_dispatch_token
      FROM distribution_vendor_amplification v
      WHERE v.tool_slug=?
        AND v.status='contact_found'
        AND v.contact_method='public_role_email'
        AND v.contact_email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM distribution_vendor_amplification prior
          WHERE prior.status='sent'
            AND prior.outreach_sent_at>=datetime('now','-30 days')
            AND (prior.tool_slug=v.tool_slug OR lower(COALESCE(prior.contact_email,''))=lower(COALESCE(v.contact_email,'')))
        )
      ORDER BY v.priority_score DESC LIMIT 1`).bind(task.subject_key).first();
    if(!row){
      const release=await deferExecutionTask(env,task.task_id,'make_sender_no_ready_vendor_candidate');
      await recordAuthorityNoOutput(env,'claimed_task_has_no_ready_vendor_candidate',task.task_id);
      return {status:'connected',limit:n,items:[],reason:'claimed_task_has_no_ready_vendor_candidate',task_id:task.task_id,integrity:'task-specific-bounded-v3',release};
    }
    const token=row.public_dispatch_token||crypto.randomUUID();
    if(!row.public_dispatch_token)await env.DB.prepare(`UPDATE distribution_vendor_amplification SET public_dispatch_token=?,public_dispatch_leased_at=datetime('now'),updated_at=datetime('now') WHERE tool_slug=? AND asset_url=?`).bind(token,row.tool_slug,row.asset_url).run();
    const copy=cordialOutreach(row);
    await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'leased',datetime('now'),datetime('now')) ON CONFLICT(action_id) DO UPDATE SET target_url=excluded.target_url,status='leased',updated_at=datetime('now')`).bind(copy.growth_action_id,copy.growth_opportunity_key,'vendor_amplification','email',copy.tracked_asset_url).run().catch(()=>{});
    items.push({kind:'vendor',task_id:task.task_id,task_action:task.action,tool_slug:row.tool_slug,asset_url:row.asset_url,priority_score:row.priority_score,vendor_domain:row.vendor_domain,contact_email:row.contact_email,contact_source_url:row.contact_source_url,suggested_subject:copy.suggested_subject,suggested_body:copy.suggested_body,dispatch_token:token});
  }else if(task.subject_type==='surface'){
    const row=await env.DB.prepare(`SELECT surface_slug,surface_name,source_url,priority_score,domain,contact_email,contact_source_url,suggested_subject,suggested_body,public_dispatch_token FROM distribution_network_outreach WHERE surface_slug=? AND status='contact_found' AND contact_email IS NOT NULL LIMIT 1`).bind(task.subject_key).first();
    if(!row){
      const release=await deferExecutionTask(env,task.task_id,'make_sender_no_ready_surface_candidate');
      await recordAuthorityNoOutput(env,'claimed_task_has_no_ready_surface_candidate',task.task_id);
      return {status:'connected',limit:n,items:[],reason:'claimed_task_has_no_ready_surface_candidate',task_id:task.task_id,integrity:'task-specific-bounded-v3',release};
    }
    const token=row.public_dispatch_token||`net_${crypto.randomUUID()}`;
    if(!row.public_dispatch_token)await env.DB.prepare(`UPDATE distribution_network_outreach SET public_dispatch_token=?,public_dispatch_leased_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(token,row.surface_slug).run();
    const action=`network:${row.surface_slug}`,growth=`surface:${row.surface_slug}`;
    const kit=taggedOwned('https://trytoolscout.org/distribution/publisher-kit',{source:row.surface_slug,campaign:'distribution_network_v21',action,growth});
    const feed=taggedOwned('https://trytoolscout.org/api/distribution/feed.json',{source:row.surface_slug,campaign:'distribution_network_v21',action,growth});
    const body=String(row.suggested_body||'').replaceAll('https://trytoolscout.org/distribution/publisher-kit',kit).replaceAll('https://trytoolscout.org/api/distribution/feed.json',feed);
    await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at) VALUES(?,?,?,?,?,'leased',datetime('now'),datetime('now')) ON CONFLICT(action_id) DO UPDATE SET target_url=excluded.target_url,status='leased',updated_at=datetime('now')`).bind(action,growth,'distribution_network','email',kit).run().catch(()=>{});
    items.push({kind:'network',task_id:task.task_id,task_action:task.action,tool_slug:`publisher-${row.surface_slug}`,asset_url:row.source_url,priority_score:row.priority_score,vendor_domain:row.domain,contact_email:row.contact_email,contact_source_url:row.contact_source_url,suggested_subject:row.suggested_subject,suggested_body:body,dispatch_token:token});
  }
  return {status:'connected',limit:n,items,task_id:task.task_id,integrity:'task-specific-bounded-v3'};
}
async function publicStatus(request,env){
  let b={};try{b=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_HEADERS})}
  if(!b.dispatch_token||!b.task_id||!['sent','failed'].includes(b.status))return Response.json({error:'dispatch_token_task_id_and_status_required'},{status:400,headers:JSON_HEADERS});
  const token=String(b.dispatch_token),taskId=String(b.task_id),ok=b.status==='sent';
  const row=await env.DB.prepare(`SELECT tool_slug,asset_url,status FROM distribution_vendor_amplification WHERE public_dispatch_token=?`).bind(token).first();
  if(row){
    const task=await validateMakeSenderTask(env,taskId,'tool',row.tool_slug);
    if(!task)return Response.json({error:'task_candidate_mismatch'},{status:409,headers:JSON_HEADERS});
    if(row.status!=='sent'){
      await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status=?,attempts=attempts+1,last_attempt_at=datetime('now'),outreach_sent_at=CASE WHEN ? THEN datetime('now') ELSE outreach_sent_at END,outreach_error=?,updated_at=datetime('now') WHERE public_dispatch_token=?`).bind(ok?'sent':'send_failed',ok?1:0,ok?null:String(b.error||'make_public_dispatch_failed').slice(0,1000),token).run();
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`vpub_${crypto.randomUUID()}`,ok?'vendor_outreach_sent':'vendor_outreach_failed',ok?'completed':'failed','vendor_amplification',row.tool_slug,row.asset_url,ok?'Vendor amplification outreach sent by Make public handoff.':String(b.error||'Vendor outreach failed in Make public handoff.').slice(0,1000)).run();
      await env.DB.prepare(`UPDATE growth_action_events SET status=?,updated_at=datetime('now') WHERE action_id=?`).bind(ok?'sent':'failed',`vendor:${row.tool_slug}`).run().catch(()=>{});
    }
    const proof=await recordExecutionProof(env,{taskId,executor:'make_sender',status:ok?'verified':'failed',detail:ok?'exact_vendor_send_verified':'make_vendor_send_failed',externalId:token,evidence:{kind:'vendor',tool_slug:row.tool_slug,asset_url:row.asset_url,dispatch_token:token}});
    return Response.json({ok:true,kind:'vendor',task_id:taskId,proof},{headers:JSON_HEADERS});
  }
  await ensureNetworkSchema(env);
  const network=await env.DB.prepare(`SELECT surface_slug,source_url,status FROM distribution_network_outreach WHERE public_dispatch_token=?`).bind(token).first();
  if(!network)return Response.json({error:'unknown_dispatch_token'},{status:404,headers:JSON_HEADERS});
  const task=await validateMakeSenderTask(env,taskId,'surface',network.surface_slug);
  if(!task)return Response.json({error:'task_candidate_mismatch'},{status:409,headers:JSON_HEADERS});
  if(network.status!=='sent'&&network.status!=='adopted'){
    await env.DB.prepare(`UPDATE distribution_network_outreach SET status=?,attempts=attempts+1,outreach_sent_at=CASE WHEN ? THEN datetime('now') ELSE outreach_sent_at END,outreach_error=?,updated_at=datetime('now') WHERE public_dispatch_token=?`).bind(ok?'sent':'send_failed',ok?1:0,ok?null:String(b.error||'make_network_dispatch_failed').slice(0,1000),token).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`netpub_${crypto.randomUUID()}`,network.surface_slug,ok?'publisher_network_outreach_sent':'publisher_network_outreach_failed',ok?'completed':'failed','distribution_network',network.source_url,ok?'Publisher syndication invitation sent automatically.':String(b.error||'Publisher outreach failed in Make public handoff.').slice(0,1000)).run();
    await env.DB.prepare(`UPDATE growth_action_events SET status=?,updated_at=datetime('now') WHERE action_id=?`).bind(ok?'sent':'failed',`network:${network.surface_slug}`).run().catch(()=>{});
  }
  const proof=await recordExecutionProof(env,{taskId,executor:'make_sender',status:ok?'verified':'failed',detail:ok?'exact_network_send_verified':'make_network_send_failed',externalId:token,evidence:{kind:'network',surface_slug:network.surface_slug,source_url:network.source_url,dispatch_token:token}});
  return Response.json({ok:true,kind:'network',task_id:taskId,proof},{headers:JSON_HEADERS});
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/vendor-amplification/ready'&&request.method==='GET'){
      if(!(await integrationOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      return Response.json(await leaseQueue(env,url.searchParams.get('limit')),{headers:JSON_HEADERS});
    }
    if(url.pathname==='/api/distribution/vendor-amplification/public-candidates'&&request.method==='GET'){
      if(!(await publicHandoffOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      const handoff=request.headers.get('X-ToolScout-Handoff')||'';
      let contactRefresh=null;
      try{
        const refreshRequest=new Request('https://trytoolscout.org/api/distribution/vendor-amplification/contact-scan',{method:'POST',headers:{'X-ToolScout-Handoff':handoff}});
        const refreshed=await base.fetch(refreshRequest,env,ctx);
        contactRefresh=refreshed.ok?await refreshed.json():{ok:false,http_status:refreshed.status};
      }catch(e){contactRefresh={ok:false,error:String(e?.message||e).slice(0,300)}}
      const result=await publicCandidates(env,url.searchParams.get('limit'));
      const replenish=!(result.items||[]).length&&Boolean(env.ADMIN_TOKEN);
      if(replenish&&ctx?.waitUntil)ctx.waitUntil(replenishAuthorityPipeline(env).catch(()=>null));
      return Response.json({...result,contact_refresh:contactRefresh,authority_replenishment_scheduled:replenish},{headers:JSON_HEADERS});
    }
    if(url.pathname==='/api/distribution/vendor-amplification/public-status'&&request.method==='POST'){if(!(await publicHandoffOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});return publicStatus(request,env);}
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};

import base from './distribution-contact-worker.js';
import {recordExecutionProof,deferExecutionTask} from './growth-execution-contract.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const EMAIL_TARGET_24H=50;
const EMAIL_MAX_24H=60;
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

let reputationSchemaReady=null;
async function ensureReputationSchema(env){
  if(reputationSchemaReady)return reputationSchemaReady;
  reputationSchemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS outbound_reputation_overrides (
      override_token TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      item_key TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      issue_codes TEXT,
      template_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      gmail_message_id TEXT,
      error TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS outbound_reputation_learning (
      rule_key TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      issue_code TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      content_hash TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      learned_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_override_token TEXT
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reputation_learning_lookup ON outbound_reputation_learning(template_id,issue_code,scope_type,enabled)`)
  ]).catch(error=>{reputationSchemaReady=null;throw error});
  return reputationSchemaReady;
}
const HARD_REPUTATION_ISSUES=new Set(['internal_api_url','internal_handoff_header','internal_runtime_identifier','raw_json_payload','unresolved_template_or_object','non_public_runtime_url']);
async function reputationContentHash(subject,body){return sha256(`${String(subject||'').trim()}\n---BODY---\n${String(body||'').trim()}`)}
async function reputationPayloadHash(to,subject,body){return sha256(`${String(to||'').trim().toLowerCase()}\n---SUBJECT---\n${String(subject||'').trim()}\n---BODY---\n${String(body||'').trim()}`)}
async function applyLearnedReputationExceptions(env,review,{subject,body,template_id}){
  if(!review?.issues?.length)return review;
  await ensureReputationSchema(env);
  const contentHash=await reputationContentHash(subject,body);
  const q=await env.DB.prepare(`SELECT issue_code,scope_type,content_hash FROM outbound_reputation_learning
    WHERE enabled=1 AND template_id=?`).bind(String(template_id||'')).all().catch(()=>({results:[]}));
  const learned=new Set();
  for(const row of q.results||[]){
    if(!review.issues.includes(row.issue_code))continue;
    if(row.scope_type==='template_issue')learned.add(row.issue_code);
    else if(row.scope_type==='exact_fingerprint'&&row.content_hash===contentHash)learned.add(row.issue_code);
  }
  const issues=review.issues.filter(x=>!learned.has(x));
  return {...review,approved:issues.length===0,issues,learned_exceptions:[...learned],content_hash:contentHash};
}
async function createReputationOverride(env,{kind,key,to,subject,body,issue_codes,template_id}){
  await ensureReputationSchema(env);
  const token=`repovr_${crypto.randomUUID()}`;
  const payloadHash=await reputationPayloadHash(to,subject,body);
  const contentHash=await reputationContentHash(subject,body);
  await env.DB.prepare(`INSERT INTO outbound_reputation_overrides
    (override_token,kind,item_key,recipient,subject,body,payload_hash,content_hash,issue_codes,template_id,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?, 'pending', datetime('now'))`)
    .bind(token,kind,key,to,subject,body,payloadHash,contentHash,String(issue_codes||''),String(template_id||'')).run();
  return {token,payloadHash,contentHash};
}
async function validateReputationOverride(request,env){
  let b={};try{
    const contentType=String(request.headers.get('content-type')||'').toLowerCase();
    if(contentType.includes('application/json'))b=await request.json();
    else{const form=await request.formData();b=Object.fromEntries([...form.entries()].map(([k,v])=>[k,String(v)]))}
  }catch{return Response.json({ok:false,error:'invalid_payload'},{status:400,headers:JSON_HEADERS})}
  await ensureReputationSchema(env);
  const token=String(b.override_token||'');
  const row=await env.DB.prepare(`SELECT * FROM outbound_reputation_overrides WHERE override_token=?`).bind(token).first();
  if(!row||row.status!=='pending')return Response.json({ok:false,error:'override_not_pending'},{status:409,headers:JSON_HEADERS});
  const payloadHash=await reputationPayloadHash(b.to,b.subject,b.body);
  if(payloadHash!==row.payload_hash||String(b.kind||'')!==row.kind||String(b.key||'')!==row.item_key)return Response.json({ok:false,error:'override_payload_mismatch'},{status:409,headers:JSON_HEADERS});
  const claimed=await env.DB.prepare(`UPDATE outbound_reputation_overrides SET status='validated' WHERE override_token=? AND status='pending'`).bind(token).run();
  if(!Number(claimed?.meta?.changes||0))return Response.json({ok:false,error:'override_already_claimed'},{status:409,headers:JSON_HEADERS});
  return Response.json({ok:true,override_token:token,kind:row.kind,key:row.item_key},{headers:JSON_HEADERS});
}
async function finalizeReputationOverride(request,env){
  let b={};try{
    const contentType=String(request.headers.get('content-type')||'').toLowerCase();
    if(contentType.includes('application/json'))b=await request.json();
    else{const form=await request.formData();b=Object.fromEntries([...form.entries()].map(([k,v])=>[k,String(v)]))}
  }catch{return Response.json({ok:false,error:'invalid_payload'},{status:400,headers:JSON_HEADERS})}
  await ensureReputationSchema(env);
  const token=String(b.override_token||''),gmailId=String(b.gmail_message_id||'').slice(0,300);
  const row=await env.DB.prepare(`SELECT * FROM outbound_reputation_overrides WHERE override_token=?`).bind(token).first();
  if(!row||row.status!=='validated')return Response.json({ok:false,error:'override_not_validated'},{status:409,headers:JSON_HEADERS});
  const issues=String(row.issue_codes||'').split('|').filter(Boolean);
  for(const issue of issues){
    const scope=HARD_REPUTATION_ISSUES.has(issue)?'exact_fingerprint':'template_issue';
    const ruleKey=scope==='exact_fingerprint'
      ?`${row.template_id}|${issue}|exact|${row.content_hash}`
      :`${row.template_id}|${issue}|template`;
    await env.DB.prepare(`INSERT INTO outbound_reputation_learning(rule_key,template_id,issue_code,scope_type,content_hash,enabled,learned_at,source_override_token)
      VALUES(?,?,?,?,?,1,datetime('now'),?)
      ON CONFLICT(rule_key) DO UPDATE SET enabled=1,learned_at=datetime('now'),source_override_token=excluded.source_override_token`)
      .bind(ruleKey,row.template_id,issue,scope,scope==='exact_fingerprint'?row.content_hash:null,token).run();
  }
  await env.DB.prepare(`UPDATE outbound_reputation_overrides SET status='sent_and_learned',sent_at=datetime('now'),gmail_message_id=?,error=NULL WHERE override_token=?`)
    .bind(gmailId||null,token).run();
  if(row.kind==='vendor'){
    await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status='sent',attempts=attempts+1,outreach_sent_at=datetime('now'),outreach_error=NULL,updated_at=datetime('now') WHERE tool_slug=? AND status IN ('reputation_quarantine','owner_override_dispatching')`).bind(row.item_key).run().catch(()=>{});
  }else if(row.kind==='network'){
    await env.DB.prepare(`UPDATE distribution_network_outreach SET status='sent',attempts=attempts+1,outreach_sent_at=datetime('now'),outreach_error=NULL,updated_at=datetime('now') WHERE surface_slug=? AND status IN ('reputation_quarantine','owner_override_dispatching')`).bind(row.item_key).run().catch(()=>{});
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,detail,observed_at,created_at)
    VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`repsend_${crypto.randomUUID()}`,'outbound_reputation_override_sent','completed','reputation_boundary',`${row.kind}:${row.item_key}`,`Owner-approved quarantined email sent immediately and filter learning applied. Gmail message ${gmailId||'recorded'}.`).run().catch(()=>{});
  return Response.json({ok:true,sent:true,learned:true,override_token:token,gmail_message_id:gmailId||null},{headers:JSON_HEADERS});
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
function sanitizeExternalOutreachSubject(value,domain=''){
  const subject=String(value||'').trim();
  if(!subject||/decision\s+feed/i.test(subject))return `ToolScout publisher resources${domain?` for ${domain}`:''}`;
  return subject;
}
function sanitizeExternalOutreachBody(value){
  let body=String(value||'');
  const apiPattern=/https:\/\/trytoolscout\.org\/api\//i;
  body=body.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi,block=>(apiPattern.test(block)||/\bdecision\s+feed\b/i.test(block))?'':block);
  body=body.replace(/https:\/\/trytoolscout\.org\/api\/[^<>"'\s]*/gi,'');
  return body;
}
const OUTBOUND_REPUTATION_CONTRACT='pedro-outbound-reputation-v1';
function reviewText(value){return String(value||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
function recipientDomain(value){
  const email=String(value||'').trim().toLowerCase();
  const m=email.match(/^[^@\s]+@([^@\s]+)$/);
  return m?m[1]:'';
}
function evaluateOutboundReputation({to,subject,body,mode='manual_authorized',template_id=''}) {
  const issues=[];
  const recipient=String(to||'').trim();
  const domain=recipientDomain(recipient);
  const subj=String(subject||'').trim();
  const raw=String(body||'').trim();
  const text=reviewText(raw);
  const internalRecipient=recipient.toLowerCase()==='pcaiano@gmail.com'||domain==='trytoolscout.org';
  if(!domain)issues.push('invalid_recipient');
  if(subj.length<3||subj.length>140)issues.push('subject_length');
  if(text.length<20||text.length>12000)issues.push('body_length');
  const forbidden=[
    [/https?:\/\/trytoolscout\.org\/api\//i,'internal_api_url'],
    [/\bX-ToolScout-Handoff\b/i,'internal_handoff_header'],
    [/\b(dispatch_token|public_dispatch_token|task_id|growth_action_events|public-candidates|public-status)\b/i,'internal_runtime_identifier'],
    [/\b(Growth Brain|Distribution Engine|Chairman Queue|D1 database|Cloudflare Worker|Make scenario)\b/i,'internal_system_jargon'],
    [/\bdecision\s+feed\b/i,'internal_decision_feed'],
    [/\{\{[^}]+\}\}|\$\{[^}]+\}|\[object Object\]|\bundefined\b/i,'unresolved_template_or_object'],
    [/https?:\/\/(?:localhost|127\.0\.0\.1|[^\s"'<>]*workers\.dev)\b/i,'non_public_runtime_url']
  ];
  for(const [pattern,code] of forbidden)if(pattern.test(subj)||pattern.test(raw))issues.push(code);
  if(/\{\s*"[^"]+"\s*:\s*/.test(text)&&/\}/.test(text))issues.push('raw_json_payload');
  if(!internalRecipient&&!/\b(ToolScout|Pedro Caiano)\b/i.test(text))issues.push('identity_missing');
  if(mode==='autonomous'){
    if(template_id==='vendor_reference_v23'){
      if(!/featured on ToolScout/i.test(subj))issues.push('vendor_subject_contract');
      if(!/Your ToolScout profile:/i.test(raw))issues.push('vendor_profile_context_missing');
      if(!/distribution\/publisher-kit/i.test(raw))issues.push('public_publisher_resource_missing');
    }else if(template_id==='publisher_resources_v22'){
      if(!/ToolScout publisher resources/i.test(subj))issues.push('publisher_subject_contract');
      if(!/distribution\/publisher-kit/i.test(raw))issues.push('publisher_kit_missing');
    }else issues.push('unapproved_autonomous_template');
  }
  return {approved:issues.length===0,issues:[...new Set(issues)],contract:OUTBOUND_REPUTATION_CONTRACT,mode,template_id,recipient_domain:domain,subject:subj,body:raw};
}
async function recordReputationBlock(env,{to,issues,source='unknown'}){
  const domain=recipientDomain(to)||'invalid-recipient';
  const detail=`Pedro reputation boundary blocked outbound to ${domain} from ${source}: ${(issues||[]).join(', ')||'unspecified'}.`;
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`rep_${crypto.randomUUID()}`,'outbound_reputation_blocked','quarantined','reputation_boundary',domain,detail.slice(0,1000)).run().catch(()=>{});
}
async function reputationCheck(request,env){
  let b={};
  try{
    const contentType=String(request.headers.get('content-type')||'').toLowerCase();
    if(contentType.includes('application/json'))b=await request.json();
    else{const form=await request.formData();b=Object.fromEntries([...form.entries()].map(([k,v])=>[k,String(v)]))}
  }catch{return Response.json({approved:false,contract:OUTBOUND_REPUTATION_CONTRACT,issues:['invalid_payload']},{status:400,headers:JSON_HEADERS})}
  let result=evaluateOutboundReputation({to:b.to,subject:b.subject,body:b.body,mode:'manual_authorized',template_id:'manual_authorized'});
  result=await applyLearnedReputationExceptions(env,result,{subject:b.subject,body:b.body,template_id:'manual_authorized'});
  if(!result.approved)await recordReputationBlock(env,{to:b.to,issues:result.issues,source:String(b.source||'manual_sender')});
  return Response.json(result,{status:result.approved?200:422,headers:JSON_HEADERS});
}
function cordialOutreach(row){
  const name=displayToolName(row),slug=String(row?.tool_slug||'').toLowerCase();
  const subject=`${name} featured on ToolScout`,action=`vendor:${slug}`,growth=`tool:${slug}`;
  const asset=taggedOwned(row?.asset_url||'https://trytoolscout.org',{source:'vendor_outreach',campaign:'vendor_reference_v22',action,growth});
  const profile=taggedOwned(`https://trytoolscout.org/tools/${encodeURIComponent(slug)}`,{source:'vendor_outreach',campaign:'vendor_reference_v22',action,growth});
  const publisherKit=taggedOwned('https://trytoolscout.org/distribution/publisher-kit',{source:'vendor_outreach',campaign:'vendor_reference_v22',action,growth});
  const body=`<p>Hello,</p><p>I hope you're well. I'm Pedro Caiano from ToolScout. We recently featured ${html(name)} in one of our software buying pages for people comparing tools for a specific job to be done.</p><p>Featured page:<br><a href="${html(asset)}">${html(asset)}</a></p><p>Your ToolScout profile:<br><a href="${html(profile)}">${html(profile)}</a></p><p>If either resource is genuinely useful to your team or audience, you are welcome to share it or cite the relevant ToolScout page from an appropriate resources, press, community or partner page. We do not request reciprocal links and we do not pay for ranking links.</p><p>If your team publishes software resources, our public publisher resources and embed kit are here:<br><a href="${html(publisherKit)}">${html(publisherKit)}</a></p><p>ToolScout rankings are based on product fit and editorial criteria. Placements are not sold, and affiliate relationships do not change ranking or recommendation eligibility.</p><p>Best regards,<br>Pedro Caiano<br>ToolScout<br><a href="https://trytoolscout.org">trytoolscout.org</a></p>`;
  return {...row,suggested_subject:sanitizeExternalOutreachSubject(subject,row?.vendor_domain),suggested_body:sanitizeExternalOutreachBody(body),growth_action_id:action,growth_opportunity_key:growth,tracked_asset_url:asset,acquisition_objective:'relevant_editorial_reference'};
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

async function claimedMakeSenderTasks(env,limit=8){
  const n=Math.max(1,Math.min(8,Number(limit)||8));
  try{
    const q=await env.DB.prepare(`SELECT task_id,subject_type,subject_key,action,priority_score,claimed_at
      FROM growth_execution_contract
      WHERE executor='make_sender' AND status='claimed'
      ORDER BY priority_score DESC,claimed_at ASC
      LIMIT ?`).bind(n).all();
    return q.results||[];
  }catch{return[]}
}
function freshDispatchLease(value,minutes=20){
  if(!value)return false;
  const t=Date.parse(String(value).includes('T')?String(value):String(value).replace(' ','T')+'Z');
  return Number.isFinite(t)&&Date.now()-t<minutes*60000;
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
async function publicCandidates(env,limit=8){
  await ensureNetworkSchema(env);
  const capacity=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM distribution_events
        WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent')
          AND status='completed' AND created_at>=datetime('now','-24 hours')) sent24,
      (SELECT COUNT(*) FROM distribution_vendor_amplification
        WHERE public_dispatch_leased_at>=datetime('now','-20 minutes') AND status<>'sent')+
      (SELECT COUNT(*) FROM distribution_network_outreach
        WHERE public_dispatch_leased_at>=datetime('now','-20 minutes') AND status NOT IN ('sent','adopted')) leased_recent`).first().catch(()=>({sent24:0,leased_recent:0}));
  const sent24=Number(capacity?.sent24||0),leasedRecent=Number(capacity?.leased_recent||0),remaining=Math.max(0,EMAIL_MAX_24H-sent24-leasedRecent);
  const requested=Math.max(1,Math.min(8,Number(limit)||8));
  const n=Math.min(requested,remaining);
  if(n<=0)return {status:'capacity_reached',limit:0,items:[],reason:'rolling_24h_email_cap_reached',emailTarget24h:EMAIL_TARGET_24H,emailMax24h:EMAIL_MAX_24H,sent24h:sent24,leasedRecent,remaining24h:0,integrity:'task-specific-batch-v10-email-cap'};
  const tasks=await claimedMakeSenderTasks(env,n);
  if(!tasks.length){
    await recordAuthorityNoOutput(env,'no_claimed_make_sender_task');
    return {status:'connected',limit:n,items:[],reason:'no_claimed_make_sender_task',integrity:'task-specific-batch-v9-reputation-boundary'};
  }

  const items=[],deferredTasks=[],leasedPending=[],seenSubjects=new Set();

  for(const task of tasks){
    if(items.length>=n)break;
    const subjectKey=`${task.subject_type}:${task.subject_key}`;
    if(seenSubjects.has(subjectKey)){
      await deferExecutionTask(env,task.task_id,'make_sender_duplicate_subject_in_active_batch');
      deferredTasks.push({task_id:task.task_id,reason:'duplicate_subject_in_active_batch'});
      continue;
    }
    seenSubjects.add(subjectKey);

    if(task.subject_type==='tool'){
      const row=await env.DB.prepare(`SELECT v.tool_slug,v.asset_url,v.priority_score,v.vendor_domain,v.contact_email,v.contact_source_url,v.suggested_subject,v.suggested_body,v.public_dispatch_token,v.public_dispatch_leased_at
        FROM distribution_vendor_amplification v
        WHERE v.tool_slug=?
          AND v.status='contact_found'
          AND v.contact_method='public_role_email'
          AND v.contact_email IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM distribution_vendor_amplification prior
            WHERE prior.status='sent'
              AND prior.outreach_sent_at>=datetime('now','-30 days')
              AND (prior.tool_slug=v.tool_slug OR lower(COALESCE(prior.contact_email,''))=lower(COALESCE(v.contact_email,'')) OR lower(COALESCE(prior.vendor_domain,''))=lower(COALESCE(v.vendor_domain,'')))
          )
          AND NOT EXISTS (
            SELECT 1 FROM distribution_network_outreach prior_network
            WHERE prior_network.status IN ('sent','adopted')
              AND prior_network.outreach_sent_at>=datetime('now','-30 days')
              AND lower(COALESCE(prior_network.domain,''))=lower(COALESCE(v.vendor_domain,''))
          )
        ORDER BY v.priority_score DESC LIMIT 1`).bind(task.subject_key).first();

      if(!row){
        await deferExecutionTask(env,task.task_id,'make_sender_no_ready_vendor_candidate');
        deferredTasks.push({task_id:task.task_id,reason:'no_ready_vendor_candidate'});
        continue;
      }
      if(freshDispatchLease(row.public_dispatch_leased_at)){
        leasedPending.push(task.task_id);
        continue;
      }

      const copy=cordialOutreach(row);
      let review=evaluateOutboundReputation({to:row.contact_email,subject:copy.suggested_subject,body:copy.suggested_body,mode:'autonomous',template_id:'vendor_reference_v23'});
      review=await applyLearnedReputationExceptions(env,review,{subject:copy.suggested_subject,body:copy.suggested_body,template_id:'vendor_reference_v23'});
      if(!review.approved){
        await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status='reputation_quarantine',outreach_error=?,updated_at=datetime('now') WHERE tool_slug=? AND asset_url=?`).bind(`reputation_boundary:${review.issues.join('|')}`.slice(0,1000),row.tool_slug,row.asset_url).run().catch(()=>{});
        await deferExecutionTask(env,task.task_id,'reputation_boundary_quarantine');
        await recordReputationBlock(env,{to:row.contact_email,issues:review.issues,source:'vendor_amplification'});
        deferredTasks.push({task_id:task.task_id,reason:'reputation_boundary_quarantine',issues:review.issues});
        continue;
      }
      const token=row.public_dispatch_token||crypto.randomUUID();
      await env.DB.prepare(`UPDATE distribution_vendor_amplification
        SET public_dispatch_token=?,public_dispatch_leased_at=datetime('now'),updated_at=datetime('now')
        WHERE tool_slug=? AND asset_url=?`).bind(token,row.tool_slug,row.asset_url).run();

      await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at)
        VALUES(?,?,?,?,?,'leased',datetime('now'),datetime('now'))
        ON CONFLICT(action_id) DO UPDATE SET target_url=excluded.target_url,status='leased',updated_at=datetime('now')`)
        .bind(copy.growth_action_id,copy.growth_opportunity_key,'vendor_amplification','email',copy.tracked_asset_url).run().catch(()=>{});

      items.push({kind:'vendor',task_id:task.task_id,task_action:task.action,tool_slug:row.tool_slug,asset_url:row.asset_url,priority_score:row.priority_score,vendor_domain:row.vendor_domain,contact_email:row.contact_email,contact_source_url:row.contact_source_url,suggested_subject:copy.suggested_subject,suggested_body:copy.suggested_body,dispatch_token:token,reputation_contract:review.contract,reputation_approved:true,template_id:'vendor_reference_v23'});
      continue;
    }

    if(task.subject_type==='surface'){
      const row=await env.DB.prepare(`SELECT surface_slug,surface_name,source_url,priority_score,domain,contact_email,contact_source_url,suggested_subject,suggested_body,public_dispatch_token,public_dispatch_leased_at
        FROM distribution_network_outreach n
        WHERE n.surface_slug=? AND n.status='contact_found' AND n.contact_email IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM distribution_network_outreach prior
            WHERE prior.status IN ('sent','adopted') AND prior.outreach_sent_at>=datetime('now','-30 days')
              AND (lower(COALESCE(prior.contact_email,''))=lower(COALESCE(n.contact_email,'')) OR lower(COALESCE(prior.domain,''))=lower(COALESCE(n.domain,'')))
          )
          AND NOT EXISTS (
            SELECT 1 FROM distribution_vendor_amplification prior_vendor
            WHERE prior_vendor.status='sent' AND prior_vendor.outreach_sent_at>=datetime('now','-30 days')
              AND lower(COALESCE(prior_vendor.vendor_domain,''))=lower(COALESCE(n.domain,''))
          )
        LIMIT 1`).bind(task.subject_key).first();

      if(!row){
        await deferExecutionTask(env,task.task_id,'make_sender_no_ready_surface_candidate');
        deferredTasks.push({task_id:task.task_id,reason:'no_ready_surface_candidate'});
        continue;
      }
      if(freshDispatchLease(row.public_dispatch_leased_at)){
        leasedPending.push(task.task_id);
        continue;
      }

      const action=`network:${row.surface_slug}`,growth=`surface:${row.surface_slug}`;
      const kit=taggedOwned('https://trytoolscout.org/distribution/publisher-kit',{source:row.surface_slug,campaign:'distribution_network_v21',action,growth});
      const subject=sanitizeExternalOutreachSubject(row.suggested_subject,row.domain);
      const body=sanitizeExternalOutreachBody(String(row.suggested_body||'').replaceAll('https://trytoolscout.org/distribution/publisher-kit',kit));
      let review=evaluateOutboundReputation({to:row.contact_email,subject,body,mode:'autonomous',template_id:'publisher_resources_v22'});
      review=await applyLearnedReputationExceptions(env,review,{subject,body,template_id:'publisher_resources_v22'});
      if(!review.approved){
        await env.DB.prepare(`UPDATE distribution_network_outreach SET status='reputation_quarantine',outreach_error=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(`reputation_boundary:${review.issues.join('|')}`.slice(0,1000),row.surface_slug).run().catch(()=>{});
        await deferExecutionTask(env,task.task_id,'reputation_boundary_quarantine');
        await recordReputationBlock(env,{to:row.contact_email,issues:review.issues,source:'distribution_network'});
        deferredTasks.push({task_id:task.task_id,reason:'reputation_boundary_quarantine',issues:review.issues});
        continue;
      }
      const token=row.public_dispatch_token||`net_${crypto.randomUUID()}`;
      await env.DB.prepare(`UPDATE distribution_network_outreach
        SET public_dispatch_token=?,public_dispatch_leased_at=datetime('now'),updated_at=datetime('now')
        WHERE surface_slug=?`).bind(token,row.surface_slug).run();

      await env.DB.prepare(`INSERT INTO growth_action_events(action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at)
        VALUES(?,?,?,?,?,'leased',datetime('now'),datetime('now'))
        ON CONFLICT(action_id) DO UPDATE SET target_url=excluded.target_url,status='leased',updated_at=datetime('now')`)
        .bind(action,growth,'distribution_network','email',kit).run().catch(()=>{});

      items.push({kind:'network',task_id:task.task_id,task_action:task.action,tool_slug:`publisher-${row.surface_slug}`,asset_url:row.source_url,priority_score:row.priority_score,vendor_domain:row.domain,contact_email:row.contact_email,contact_source_url:row.contact_source_url,suggested_subject:subject,suggested_body:body,dispatch_token:token,reputation_contract:review.contract,reputation_approved:true,template_id:'publisher_resources_v22'});
      continue;
    }

    await deferExecutionTask(env,task.task_id,'make_sender_unsupported_subject_type');
    deferredTasks.push({task_id:task.task_id,reason:'unsupported_subject_type'});
  }

  if(!items.length){
    const reason=leasedPending.length?'all_ready_candidates_already_leased':'claimed_tasks_yielded_no_ready_candidate';
    await recordAuthorityNoOutput(env,reason,tasks[0]?.task_id||null);
  }

  return {
    status:'connected',
    limit:n,
    items,
    task_id:items[0]?.task_id||null,
    task_ids:items.map(x=>x.task_id),
    claimed_scanned:tasks.length,
    deferred_tasks:deferredTasks,
    leased_pending:leasedPending,
    reason:items.length?null:(leasedPending.length?'leased_candidates_pending_callback':'no_ready_candidate_after_batch_scan'),
    emailTarget24h:EMAIL_TARGET_24H,
    emailMax24h:EMAIL_MAX_24H,
    sent24h:sent24,
    leasedRecent,
    remaining24h:Math.max(0,EMAIL_MAX_24H-sent24-leasedRecent-items.length),
    integrity:'task-specific-batch-v10-email-cap'
  };
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
      const bearer=request.headers.get('Authorization')||'';
      let contactRefresh=null;
      try{
        const headers={};
        if(bearer)headers.Authorization=bearer;
        if(handoff)headers['X-ToolScout-Handoff']=handoff;
        const refreshRequest=new Request(new URL('/api/distribution/vendor-amplification/contact-scan',request.url),{method:'POST',headers});
        const refreshed=await base.fetch(refreshRequest,env,ctx);
        contactRefresh=refreshed.ok?await refreshed.json():{ok:false,http_status:refreshed.status};
      }catch(e){contactRefresh={ok:false,error:String(e?.message||e).slice(0,300)}}
      const result=await publicCandidates(env,url.searchParams.get('limit'));
      return Response.json({...result,contact_refresh:contactRefresh,replenishment_required:!(result.items||[]).length},{headers:JSON_HEADERS});
    }
    if(url.pathname==='/api/distribution/outbound-reputation/check'&&request.method==='POST'){if(!(await publicHandoffOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});return reputationCheck(request,env);}
    if(url.pathname==='/api/distribution/outbound-reputation/override-validate'&&request.method==='POST'){if(!(await publicHandoffOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});return validateReputationOverride(request,env);}
    if(url.pathname==='/api/distribution/outbound-reputation/override-status'&&request.method==='POST'){if(!(await publicHandoffOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});return finalizeReputationOverride(request,env);}
    if(url.pathname==='/api/distribution/vendor-amplification/public-status'&&request.method==='POST'){if(!(await publicHandoffOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});return publicStatus(request,env);}
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};

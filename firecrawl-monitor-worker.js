const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const MONITORS=new Set([
  '01a0a0c1-f903-77af-abb4-ad5933198b0e',
  '01a0a0c2-85be-713e-b00f-511186642d2e'
]);
const HOST_TO_TOOL=new Map([
  ['apollo.io','apollo'],
  ['lemlist.com','lemlist'],
  ['unbounce.com','unbounce'],
  ['hostinger.com','hostinger'],
  ['klaviyo.com','klaviyo'],
  ['airtable.com','airtable']
]);
const PROTECTED_STATES=new Set(['submitted','pending_review','approved_needs_link','link_acquired','active','verified','earning','rejected']);

function reply(body,status=200){return Response.json(body,{status,headers:JSON_H})}
function textBytes(value){return new TextEncoder().encode(String(value||''))}
function hexBytes(hex){
  const value=String(hex||'').trim();
  if(!/^[0-9a-f]{64}$/i.test(value))return null;
  const out=new Uint8Array(value.length/2);
  for(let i=0;i<out.length;i++)out[i]=parseInt(value.slice(i*2,i*2+2),16);
  return out;
}
async function validSignature(raw,header,secret){
  if(!secret)return false;
  const match=String(header||'').match(/^sha256=([0-9a-f]{64})$/i);
  if(!match)return false;
  const signature=hexBytes(match[1]);if(!signature)return false;
  const key=await crypto.subtle.importKey('raw',textBytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,signature,textBytes(raw));
}
function hostnameOf(value){
  try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}
}
function toolForUrl(value){
  const host=hostnameOf(value);
  for(const [domain,slug] of HOST_TO_TOOL.entries())if(host===domain||host.endsWith(`.${domain}`))return slug;
  return null;
}
function compactJudgment(value){
  if(value==null)return null;
  const text=typeof value==='string'?value:JSON.stringify(value);
  return text.length>1200?`${text.slice(0,1200)}...`:text;
}
function parseEvidence(value){
  try{const x=JSON.parse(String(value||'[]'));return Array.isArray(x)?x:[]}catch{return[]}
}
function monitoredEvent(payload,item){
  const monitorId=String(item?.monitorId||payload?.monitorId||payload?.metadata?.monitorId||'');
  const checkId=String(item?.checkId||payload?.id||'');
  return {
    monitorId,
    checkId,
    url:String(item?.url||item?.sourceUrl||''),
    pageStatus:String(item?.status||'').toLowerCase(),
    meaningful:item?.isMeaningful===true||item?.judgment?.meaningful===true,
    judgment:compactJudgment(item?.judgment),
    diff:item?.diff?.text?String(item.diff.text).slice(0,1800):null
  };
}
async function recordEvidence(env,slug,event){
  const [discovery,workflow]=await Promise.all([
    env.DB.prepare('SELECT status,official_program_url,application_url,network,evidence_json,automation_mode,confidence,blocker FROM affiliate_program_discovery WHERE tool_slug=?').bind(slug).first(),
    env.DB.prepare('SELECT status,network,program_url,application_url,blocker,evidence_json FROM affiliate_workflow WHERE tool_slug=?').bind(slug).first()
  ]);
  const evidence=parseEvidence(discovery?.evidence_json);
  const entry={type:'firecrawl_monitor',monitor_id:event.monitorId,check_id:event.checkId,url:event.url,page_status:event.pageStatus,meaningful:event.meaningful,judgment:event.judgment,diff:event.diff,observed_at:new Date().toISOString()};
  evidence.push(entry);
  const trimmed=evidence.slice(-20),current=String(workflow?.status||discovery?.status||'research_required').toLowerCase();
  const changed=['changed','new','removed'].includes(event.pageStatus)&&event.meaningful;
  const protectedState=PROTECTED_STATES.has(current);
  const nextStatus=changed&&!protectedState?'research_required':String(discovery?.status||current||'research_required');
  const blocker=changed&&!protectedState?'Firecrawl detected a meaningful change on an official affiliate-program surface. Revalidation is required before the next human or automated action.':(discovery?.blocker||workflow?.blocker||null);
  const officialUrl=discovery?.official_program_url||event.url||workflow?.program_url||null;
  await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,official_program_url,application_url,network,evidence_json,automation_mode,confidence,blocker,last_checked,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,official_program_url=COALESCE(excluded.official_program_url,affiliate_program_discovery.official_program_url),application_url=COALESCE(affiliate_program_discovery.application_url,excluded.application_url),network=COALESCE(affiliate_program_discovery.network,excluded.network),evidence_json=excluded.evidence_json,automation_mode=excluded.automation_mode,confidence=MAX(affiliate_program_discovery.confidence,excluded.confidence),blocker=excluded.blocker,last_checked=datetime('now'),updated_at=datetime('now')`)
    .bind(slug,nextStatus,officialUrl,discovery?.application_url||workflow?.application_url||null,discovery?.network||workflow?.network||'Direct',JSON.stringify(trimmed),changed&&!protectedState?'research':(discovery?.automation_mode||'monitor'),Math.max(Number(discovery?.confidence||0),changed?80:0),blocker).run();
  if(changed&&!protectedState){
    const workflowEvidence=parseEvidence(workflow?.evidence_json);workflowEvidence.push(entry);
    await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,network,program_url,application_url,blocker,evidence_json,source_actor,last_verified,updated_at)
      VALUES(?,'research_required',?,?,?,?,?,'firecrawl_monitor',datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET status='research_required',network=COALESCE(affiliate_workflow.network,excluded.network),program_url=COALESCE(excluded.program_url,affiliate_workflow.program_url),application_url=COALESCE(affiliate_workflow.application_url,excluded.application_url),blocker=excluded.blocker,evidence_json=excluded.evidence_json,source_actor='firecrawl_monitor',last_verified=datetime('now'),updated_at=datetime('now')`)
      .bind(slug,workflow?.network||discovery?.network||'Direct',officialUrl,workflow?.application_url||discovery?.application_url||null,blocker,JSON.stringify(workflowEvidence.slice(-20))).run();
  }
  return {slug,changed,protected:protectedState,status:changed&&!protectedState?'research_required':current};
}

export async function handleFirecrawlWebhook(request,env){
  if(!env.FIRECRAWL_WEBHOOK_SECRET)return reply({ok:false,error:'firecrawl_webhook_not_configured'},503);
  const size=Number(request.headers.get('content-length')||0);if(size>262144)return reply({ok:false,error:'payload_too_large'},413);
  const raw=await request.text();
  if(!await validSignature(raw,request.headers.get('X-Firecrawl-Signature'),env.FIRECRAWL_WEBHOOK_SECRET))return reply({ok:false,error:'invalid_signature'},401);
  let payload;try{payload=JSON.parse(raw)}catch{return reply({ok:false,error:'invalid_json'},400)}
  if(String(payload?.type||'')!=='monitor.page')return reply({ok:true,ignored:true,reason:'unsupported_event_type'},202);
  const items=Array.isArray(payload?.data)?payload.data:(payload?.data?[payload.data]:[]),results=[];
  for(const item of items){
    const event=monitoredEvent(payload,item);
    if(!MONITORS.has(event.monitorId)){results.push({ignored:true,reason:'unknown_monitor'});continue}
    if(event.pageStatus==='same'||(event.pageStatus==='changed'&&!event.meaningful)){results.push({ignored:true,reason:'no_meaningful_change',monitorId:event.monitorId,url:event.url});continue}
    const slug=toolForUrl(event.url);if(!slug){results.push({ignored:true,reason:'unmapped_vendor',url:event.url});continue}
    try{results.push(await recordEvidence(env,slug,event))}catch{results.push({slug,error:'persistence_failed'})}
  }
  return reply({ok:true,processed:results.filter(x=>x.slug&&!x.error).length,results},200);
}
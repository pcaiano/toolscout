const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const HUBSPOT_SUBSCRIPTION_TYPE_ID='3781890361';
const HUBSPOT_SUBSCRIPTION_NAME='Marketing Information';
const HUBSPOT_SYNC_BATCH=25;

function normalizeEmail(value){
  const email=String(value||'').trim().toLowerCase();
  if(email.length<5||email.length>254)return null;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return null;
  return email;
}
function safeText(value,max=180){return String(value||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max)}
function consented(value){return value===true||['1','true','yes','on'].includes(String(value||'').toLowerCase())}
async function body(request){
  const type=String(request.headers.get('content-type')||'').toLowerCase();
  if(type.includes('application/json'))return await request.json().catch(()=>({}));
  if(type.includes('application/x-www-form-urlencoded')||type.includes('multipart/form-data')){
    const form=await request.formData().catch(()=>null),out={};
    if(form)for(const [key,value] of form.entries())out[key]=typeof value==='string'?value:'';
    return out;
  }
  return{};
}
function sameOrigin(request){
  const origin=request.headers.get('Origin');
  if(!origin)return true;
  try{
    const a=new URL(origin),b=new URL(request.url);
    return a.protocol===b.protocol&&a.hostname===b.hostname;
  }catch{return false}
}
function hubspotHeaders(env){
  return{
    Authorization:'Bearer '+String(env.HUBSPOT_ACCESS_TOKEN||''),
    'Content-Type':'application/json',
    Accept:'application/json'
  };
}
async function hubspotJson(env,url,options={}){
  if(!env.HUBSPOT_ACCESS_TOKEN)throw new Error('hubspot_access_token_missing');
  const response=await fetch(url,{...options,headers:{...hubspotHeaders(env),...(options.headers||{})},signal:AbortSignal.timeout(12000)});
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{}}catch{data={raw:text.slice(0,800)}}
  if(!response.ok){
    const detail=String(data?.message||data?.category||response.statusText||'hubspot_request_failed').slice(0,500);
    throw new Error('hubspot_'+response.status+':'+detail);
  }
  return data;
}
async function upsertHubSpotContact(env,email){
  const data=await hubspotJson(env,'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert',{
    method:'POST',
    body:JSON.stringify({inputs:[{id:email,idProperty:'email',properties:{email}}]})
  });
  const row=Array.isArray(data?.results)?data.results[0]:null;
  const id=String(row?.id||row?.properties?.hs_object_id||'').trim();
  if(!id)throw new Error('hubspot_contact_id_missing');
  return id;
}
async function subscribeHubSpotContact(env,email){
  return hubspotJson(env,'https://api.hubapi.com/communication-preferences/v4/statuses/'+encodeURIComponent(email),{
    method:'POST',
    body:JSON.stringify({
      subscriptionId:Number(HUBSPOT_SUBSCRIPTION_TYPE_ID),
      statusState:'SUBSCRIBED',
      legalBasis:'CONSENT_WITH_NOTICE',
      legalBasisExplanation:'Contact explicitly subscribed to ToolScout software updates on trytoolscout.org.',
      channel:'EMAIL'
    })
  });
}
async function markHubSpotSync(env,email,status,{contactId=null,error=null}={}){
  await env.DB.prepare(`UPDATE newsletter_subscribers
    SET hubspot_sync_status=?,
        hubspot_contact_id=COALESCE(?,hubspot_contact_id),
        hubspot_synced_at=CASE WHEN ?='synced' THEN datetime('now') ELSE hubspot_synced_at END,
        hubspot_sync_error=?,
        hubspot_sync_attempts=COALESCE(hubspot_sync_attempts,0)+1,
        hubspot_subscription_type_id=?,
        updated_at=datetime('now')
    WHERE email=?`)
    .bind(status,contactId,status,error?String(error).slice(0,700):null,HUBSPOT_SUBSCRIPTION_TYPE_ID,email).run();
}
export async function syncNewsletterSubscriberToHubSpot(env,email){
  if(!env.HUBSPOT_ACCESS_TOKEN)return{ok:false,status:'configuration_required',error:'hubspot_access_token_missing'};
  const normalized=normalizeEmail(email);
  if(!normalized)return{ok:false,status:'invalid_email'};
  try{
    const contactId=await upsertHubSpotContact(env,normalized);
    await subscribeHubSpotContact(env,normalized);
    await markHubSpotSync(env,normalized,'synced',{contactId});
    await env.DB.prepare(`INSERT INTO newsletter_events(event_id,email,event_type,source,source_path,created_at)
      SELECT ?,email,'hubspot_synced',source,source_path,datetime('now') FROM newsletter_subscribers WHERE email=?`)
      .bind('nl_'+crypto.randomUUID(),normalized).run().catch(()=>null);
    return{ok:true,status:'synced',contact_id:contactId,subscription_type_id:HUBSPOT_SUBSCRIPTION_TYPE_ID};
  }catch(error){
    await markHubSpotSync(env,normalized,'failed',{error:error?.message||error}).catch(()=>null);
    return{ok:false,status:'failed',error:String(error?.message||error).slice(0,700)};
  }
}
export async function runNewsletterHubSpotSync(env,{limit=HUBSPOT_SYNC_BATCH}={}){
  if(!env.HUBSPOT_ACCESS_TOKEN)return{ok:false,status:'configuration_required',error:'hubspot_access_token_missing',subscription_type_id:HUBSPOT_SUBSCRIPTION_TYPE_ID};
  const rows=await env.DB.prepare(`SELECT email FROM newsletter_subscribers
    WHERE status='subscribed'
      AND hubspot_sync_status IN ('pending','failed')
      AND COALESCE(hubspot_sync_attempts,0)<8
    ORDER BY CASE hubspot_sync_status WHEN 'pending' THEN 0 ELSE 1 END, updated_at ASC
    LIMIT ?`).bind(Math.max(1,Math.min(Number(limit)||HUBSPOT_SYNC_BATCH,100))).all();
  let synced=0,failed=0;
  for(const row of rows.results||[]){
    const result=await syncNewsletterSubscriberToHubSpot(env,row.email);
    if(result.ok)synced++;else failed++;
  }
  return{ok:true,status:'completed',processed:(rows.results||[]).length,synced,failed,subscription_type_id:HUBSPOT_SUBSCRIPTION_TYPE_ID,subscription_name:HUBSPOT_SUBSCRIPTION_NAME};
}
async function subscriberMetrics(env){
  const row=await env.DB.prepare(`SELECT
      SUM(CASE WHEN status='subscribed' THEN 1 ELSE 0 END) subscribers,
      SUM(CASE WHEN status='subscribed' AND last_subscribed_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) signups_24h,
      SUM(CASE WHEN status='subscribed' AND last_subscribed_at>=datetime('now','start of month') THEN 1 ELSE 0 END) signups_mtd,
      SUM(CASE WHEN status='subscribed' AND hubspot_sync_status='pending' THEN 1 ELSE 0 END) hubspot_pending,
      SUM(CASE WHEN status='subscribed' AND hubspot_sync_status='failed' THEN 1 ELSE 0 END) hubspot_failed,
      SUM(CASE WHEN status='subscribed' AND hubspot_sync_status='synced' THEN 1 ELSE 0 END) hubspot_synced
    FROM newsletter_subscribers`).first();
  return{
    subscribers:Number(row?.subscribers||0),
    signups_24h:Number(row?.signups_24h||0),
    signups_mtd:Number(row?.signups_mtd||0),
    hubspot_pending:Number(row?.hubspot_pending||0),
    hubspot_failed:Number(row?.hubspot_failed||0),
    hubspot_synced:Number(row?.hubspot_synced||0),
    hubspot_configured:Boolean(env.HUBSPOT_ACCESS_TOKEN),
    hubspot_subscription_type_id:HUBSPOT_SUBSCRIPTION_TYPE_ID,
    hubspot_subscription_name:HUBSPOT_SUBSCRIPTION_NAME
  };
}
async function subscribe(request,env,ctx){
  if(!sameOrigin(request))return Response.json({ok:false,error:'invalid_origin'},{status:403,headers:JSON_H});
  const data=await body(request);
  if(safeText(data.company,120))return Response.json({ok:true,subscribed:true},{headers:JSON_H});
  const email=normalizeEmail(data.email);
  if(!email)return Response.json({ok:false,error:'valid_email_required'},{status:400,headers:JSON_H});
  if(!consented(data.consent))return Response.json({ok:false,error:'consent_required'},{status:400,headers:JSON_H});
  const source=safeText(data.source||'unknown',80)||'unknown';
  const sourcePath=safeText(data.source_path||'',180)||null;
  const prior=await env.DB.prepare(`SELECT status FROM newsletter_subscribers WHERE email=? LIMIT 1`).bind(email).first().catch(()=>null);
  await env.DB.prepare(`INSERT INTO newsletter_subscribers(
      email,status,source,source_path,consent_version,first_subscribed_at,last_subscribed_at,unsubscribed_at,hubspot_sync_status,hubspot_sync_error,hubspot_sync_attempts,hubspot_subscription_type_id,updated_at
    ) VALUES(?,'subscribed',?,?,'toolscout-updates-v1',datetime('now'),datetime('now'),NULL,'pending',NULL,0,?,datetime('now'))
    ON CONFLICT(email) DO UPDATE SET
      status='subscribed',
      source=excluded.source,
      source_path=excluded.source_path,
      consent_version=excluded.consent_version,
      last_subscribed_at=datetime('now'),
      unsubscribed_at=NULL,
      hubspot_sync_status=CASE WHEN newsletter_subscribers.hubspot_sync_status='synced' THEN 'synced' ELSE 'pending' END,
      hubspot_sync_error=NULL,
      hubspot_subscription_type_id=excluded.hubspot_subscription_type_id,
      updated_at=datetime('now')`)
    .bind(email,source,sourcePath,HUBSPOT_SUBSCRIPTION_TYPE_ID).run();
  const eventType=prior?.status==='subscribed'?'subscribe_repeat':'subscribed';
  await env.DB.prepare(`INSERT INTO newsletter_events(event_id,email,event_type,source,source_path,created_at)
      VALUES(?,?,?,?,?,datetime('now'))`)
    .bind('nl_'+crypto.randomUUID(),email,eventType,source,sourcePath).run().catch(()=>null);
  if(env.HUBSPOT_ACCESS_TOKEN){
    const sync=syncNewsletterSubscriberToHubSpot(env,email);
    if(ctx?.waitUntil)ctx.waitUntil(sync);else await sync;
  }
  return Response.json({
    ok:true,
    subscribed:true,
    already_subscribed:prior?.status==='subscribed',
    crm:'hubspot',
    crm_status:env.HUBSPOT_ACCESS_TOKEN?'syncing':'configuration_required'
  },{headers:JSON_H});
}
export async function handleNewsletterRoute(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/newsletter/subscribe')return subscribe(request,env,ctx);
  if(request.method==='POST'&&url.pathname==='/api/newsletter/sync'){
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
    return Response.json(await runNewsletterHubSpotSync(env,{limit:HUBSPOT_SYNC_BATCH}),{headers:JSON_H});
  }
  if(request.method==='GET'&&url.pathname==='/api/newsletter/metrics'){
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
    return Response.json({ok:true,...await subscriberMetrics(env)},{headers:JSON_H});
  }
  return null;
}

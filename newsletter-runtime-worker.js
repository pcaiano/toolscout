const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};

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
async function subscriberMetrics(env){
  const row=await env.DB.prepare(`SELECT
      SUM(CASE WHEN status='subscribed' THEN 1 ELSE 0 END) subscribers,
      SUM(CASE WHEN status='subscribed' AND last_subscribed_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) signups_24h,
      SUM(CASE WHEN status='subscribed' AND last_subscribed_at>=datetime('now','start of month') THEN 1 ELSE 0 END) signups_mtd,
      SUM(CASE WHEN status='subscribed' AND hubspot_sync_status='pending' THEN 1 ELSE 0 END) hubspot_pending
    FROM newsletter_subscribers`).first();
  return{
    subscribers:Number(row?.subscribers||0),
    signups_24h:Number(row?.signups_24h||0),
    signups_mtd:Number(row?.signups_mtd||0),
    hubspot_pending:Number(row?.hubspot_pending||0)
  };
}
async function subscribe(request,env){
  if(!sameOrigin(request))return Response.json({ok:false,error:'invalid_origin'},{status:403,headers:JSON_H});
  const data=await body(request);
  // Honeypot: acknowledge bot submissions without polluting the audience ledger.
  if(safeText(data.company,120))return Response.json({ok:true,subscribed:true},{headers:JSON_H});
  const email=normalizeEmail(data.email);
  if(!email)return Response.json({ok:false,error:'valid_email_required'},{status:400,headers:JSON_H});
  if(!consented(data.consent))return Response.json({ok:false,error:'consent_required'},{status:400,headers:JSON_H});
  const source=safeText(data.source||'unknown',80)||'unknown';
  const sourcePath=safeText(data.source_path||'',180)||null;
  const prior=await env.DB.prepare(`SELECT status FROM newsletter_subscribers WHERE email=? LIMIT 1`).bind(email).first().catch(()=>null);
  await env.DB.prepare(`INSERT INTO newsletter_subscribers(
      email,status,source,source_path,consent_version,first_subscribed_at,last_subscribed_at,unsubscribed_at,hubspot_sync_status,updated_at
    ) VALUES(?,'subscribed',?,?,'toolscout-updates-v1',datetime('now'),datetime('now'),NULL,'pending',datetime('now'))
    ON CONFLICT(email) DO UPDATE SET
      status='subscribed',
      source=excluded.source,
      source_path=excluded.source_path,
      consent_version=excluded.consent_version,
      last_subscribed_at=datetime('now'),
      unsubscribed_at=NULL,
      hubspot_sync_status=CASE WHEN newsletter_subscribers.hubspot_sync_status='synced' THEN 'synced' ELSE 'pending' END,
      updated_at=datetime('now')`)
    .bind(email,source,sourcePath).run();
  const eventType=prior?.status==='subscribed'?'subscribe_repeat':'subscribed';
  await env.DB.prepare(`INSERT INTO newsletter_events(event_id,email,event_type,source,source_path,created_at)
      VALUES(?,?,?,?,?,datetime('now'))`)
    .bind('nl_'+crypto.randomUUID(),email,eventType,source,sourcePath).run().catch(()=>null);
  return Response.json({ok:true,subscribed:true,already_subscribed:prior?.status==='subscribed'},{headers:JSON_H});
}
export async function handleNewsletterRoute(request,env){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/newsletter/subscribe')return subscribe(request,env);
  if(request.method==='GET'&&url.pathname==='/api/newsletter/metrics'){
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
    return Response.json({ok:true,...await subscriberMetrics(env)},{headers:JSON_H});
  }
  return null;
}

import base from './distribution-contact-worker.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const MAKE_TOKEN_SHA256='2f9522abe5fb3d87a045b86940f6b5338cc5c9fc3f51ecbc5f5fc31000e3b72c';

async function sha256(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function integrationOk(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!t)return false;if(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)return true;return (await sha256(t))===MAKE_TOKEN_SHA256}

async function leaseQueue(env,limit=3){
  await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status='contact_found',updated_at=datetime('now') WHERE status='sending' AND last_attempt_at < datetime('now','-24 hours')`).run();
  const n=Math.max(1,Math.min(3,Number(limit)||3));
  const r=await env.DB.prepare(`SELECT tool_slug,asset_url,priority_score,vendor_domain,contact_email,contact_name,contact_source_url,contact_method,suggested_subject,suggested_body FROM distribution_vendor_amplification WHERE status='contact_found' AND contact_method='public_role_email' AND contact_email IS NOT NULL ORDER BY priority_score DESC LIMIT ?`).bind(n).all();
  const items=r.results||[];
  for(const x of items){await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status='sending',last_attempt_at=datetime('now'),updated_at=datetime('now') WHERE tool_slug=? AND asset_url=? AND status='contact_found'`).bind(x.tool_slug,x.asset_url).run()}
  if(items.length)await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`vlease_${crypto.randomUUID()}`,'vendor_outreach_leased','ready','vendor_amplification',`${items.length} vendor outreach item(s) leased to the private sender.`).run();
  return {status:'connected',leaseHours:24,items};
}

async function publicCandidates(env,limit=3){
  const n=Math.max(1,Math.min(3,Number(limit)||3));
  const r=await env.DB.prepare(`SELECT tool_slug,asset_url,priority_score,vendor_domain,contact_source_url,suggested_subject,suggested_body,public_dispatch_token FROM distribution_vendor_amplification WHERE status='contact_found' AND contact_method='public_role_email' AND contact_email IS NOT NULL ORDER BY priority_score DESC LIMIT ?`).bind(n).all();
  const items=[];
  for(const row of r.results||[]){
    const token=row.public_dispatch_token||crypto.randomUUID();
    if(!row.public_dispatch_token)await env.DB.prepare(`UPDATE distribution_vendor_amplification SET public_dispatch_token=?,public_dispatch_leased_at=datetime('now'),updated_at=datetime('now') WHERE tool_slug=? AND asset_url=?`).bind(token,row.tool_slug,row.asset_url).run();
    items.push({tool_slug:row.tool_slug,asset_url:row.asset_url,priority_score:row.priority_score,vendor_domain:row.vendor_domain,contact_source_url:row.contact_source_url,suggested_subject:row.suggested_subject,suggested_body:row.suggested_body,dispatch_token:token});
  }
  return {status:'connected',limit:n,items};
}

async function publicStatus(request,env){
  let b={};try{b=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_HEADERS})}
  if(!b.dispatch_token||!['sent','failed'].includes(b.status))return Response.json({error:'dispatch_token_and_status_required'},{status:400,headers:JSON_HEADERS});
  const row=await env.DB.prepare(`SELECT tool_slug,asset_url,status FROM distribution_vendor_amplification WHERE public_dispatch_token=?`).bind(String(b.dispatch_token)).first();
  if(!row)return Response.json({error:'unknown_dispatch_token'},{status:404,headers:JSON_HEADERS});
  if(row.status==='sent')return Response.json({ok:true,idempotent:true},{headers:JSON_HEADERS});
  const ok=b.status==='sent';
  await env.DB.prepare(`UPDATE distribution_vendor_amplification SET status=?,attempts=attempts+1,last_attempt_at=datetime('now'),outreach_sent_at=CASE WHEN ? THEN datetime('now') ELSE outreach_sent_at END,outreach_error=?,updated_at=datetime('now') WHERE public_dispatch_token=?`).bind(ok?'sent':'send_failed',ok?1:0,ok?null:String(b.error||'make_public_dispatch_failed').slice(0,1000),String(b.dispatch_token)).run();
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`vpub_${crypto.randomUUID()}`,ok?'vendor_outreach_sent':'vendor_outreach_failed',ok?'completed':'failed','vendor_amplification',row.tool_slug,row.asset_url,ok?'Vendor amplification outreach sent by Make public handoff.':String(b.error||'Vendor outreach failed in Make public handoff.').slice(0,1000)).run();
  return Response.json({ok:true},{headers:JSON_HEADERS});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/vendor-amplification/ready'&&request.method==='GET'){
      if(!(await integrationOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      return Response.json(await leaseQueue(env,url.searchParams.get('limit')),{headers:JSON_HEADERS});
    }
    if(url.pathname==='/api/distribution/vendor-amplification/public-candidates'&&request.method==='GET')return Response.json(await publicCandidates(env,url.searchParams.get('limit')),{headers:JSON_HEADERS});
    if(url.pathname==='/api/distribution/vendor-amplification/public-status'&&request.method==='POST')return publicStatus(request,env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};

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

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/vendor-amplification/ready'&&request.method==='GET'){
      if(!(await integrationOk(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      return Response.json(await leaseQueue(env,url.searchParams.get('limit')),{headers:JSON_HEADERS});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};

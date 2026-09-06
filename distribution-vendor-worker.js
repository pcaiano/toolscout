import base from './distribution-radar-worker.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
async function assetJson(request,env,path,fallback){try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback;}catch{return fallback;}}
function safe(v,n=2000){return String(v??'').slice(0,n)}

async function candidateAssets(request,env){
  try{
    const r=await env.ASSETS.fetch(new Request(new URL('/sitemap.xml',request.url)));if(!r.ok)return [];
    const xml=await r.text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim()).filter(u=>/(\-vs-|best-|alternatives)/i.test(u));
  }catch{return [];}
}

async function refreshVendorAmplification(request,env){
  const [tools,affiliate,assets]=await Promise.all([
    assetJson(request,env,'/data/tools.json',[]),
    assetJson(request,env,'/data/affiliate.json',{}),
    candidateAssets(request,env)
  ]);
  let queued=0;
  for(const tool of tools){
    const slug=String(tool.slug||'');if(!slug)continue;
    const matched=assets.filter(u=>new URL(u).pathname.toLowerCase().includes(slug.toLowerCase())).slice(0,3);
    for(const assetUrl of matched){
      const aff=affiliate?.[slug];
      const priority=Math.min(100,55+(aff?.enabled&&aff?.url?20:0)+(assetUrl.includes('-vs-')?15:8));
      let domain=null;try{domain=new URL(tool.sourceUrl||'').hostname.replace(/^www\./,'');}catch{}
      const title=assetUrl.split('/').filter(Boolean).pop()?.replace(/\.html$/i,'').replace(/-/g,' ')||'ToolScout feature';
      const subject=`${tool.name} featured on ToolScout`;
      const body=`ToolScout recently featured ${tool.name} in ${title}. The page is designed for software buyers comparing options for a specific job-to-be-done. If useful, you can share the analysis with your audience or use a ToolScout Pick/Compare embed that links back to the source. ${assetUrl}`;
      await env.DB.prepare(`INSERT INTO distribution_vendor_amplification(tool_slug,asset_url,trigger_type,priority_score,status,vendor_domain,suggested_subject,suggested_body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug,asset_url) DO UPDATE SET priority_score=excluded.priority_score,vendor_domain=excluded.vendor_domain,suggested_subject=excluded.suggested_subject,suggested_body=excluded.suggested_body,updated_at=datetime('now')`)
        .bind(slug,assetUrl,assetUrl.includes('-vs-')?'comparison':'editorial_feature',priority,'queued',domain,subject,body).run();
      queued++;
    }
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`vendor_${crypto.randomUUID()}`,'vendor_amplification_refresh','completed','vendor_amplification',`Vendor amplification queue refreshed: ${queued} tool/page opportunities prepared.`).run();
  return {ok:true,queued};
}

async function vendorQueue(env){
  const r=await env.DB.prepare(`SELECT tool_slug,asset_url,trigger_type,priority_score,status,vendor_domain,contact_name,contact_email,suggested_subject,suggested_body,attempts,last_attempt_at,updated_at FROM distribution_vendor_amplification ORDER BY CASE status WHEN 'queued' THEN 0 WHEN 'contact_found' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,priority_score DESC LIMIT 100`).all();
  return {status:'connected',items:r.results||[]};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/vendor-amplification'&&request.method==='GET'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      return Response.json(await vendorQueue(env),{headers:JSON_HEADERS});
    }
    if(url.pathname==='/api/distribution/vendor-amplification/refresh'&&request.method==='POST'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      try{return Response.json(await refreshVendorAmplification(request,env),{headers:JSON_HEADERS});}catch(e){return Response.json({error:'vendor_refresh_failed',message:String(e?.message||e)},{status:500,headers:JSON_HEADERS});}
    }
    if(url.pathname==='/api/stats'&&request.method==='GET'){
      const upstream=await base.fetch(request,env,ctx);if(!upstream.ok)return upstream;
      const data=await upstream.json();
      let queue={status:'unavailable',items:[]};try{queue=await vendorQueue(env);}catch{}
      return Response.json({...data,vendorAmplification:{status:queue.status,queued:queue.items.filter(x=>x.status==='queued').length,contactFound:queue.items.filter(x=>x.status==='contact_found').length,sent:queue.items.filter(x=>x.status==='sent').length,top:queue.items.slice(0,10)}},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, max-age=60'}});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    if(base.scheduled)await base.scheduled(event,env,ctx);
    ctx.waitUntil(refreshVendorAmplification(new Request('https://trytoolscout.org/'),env).catch(()=>{}));
  }
};

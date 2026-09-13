import base from './distribution-throughput-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const EDITORIAL_TYPE_RE=/(newsletter|editorial|media|journal|community|content|syndication|research)/i;
const TERMINAL=new Set(['policy_blocked','rejected','skipped','unavailable_free','verified','live']);

function authorized(request,env){const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);}
function safe(value,n=3000){return String(value??'').slice(0,n);}
function validAsset(item){try{const u=new URL(String(item?.url||''));return u.protocol==='https:'&&u.hostname==='trytoolscout.org'&&item?.assetType==='original_research';}catch{return false;}}

async function loadAssets(env){
  try{
    const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org/reports/linkable-assets.json'));
    if(!r.ok)return[];
    const data=await r.json();
    return (data.items||[]).filter(validAsset).slice(0,10);
  }catch{return[];}
}

async function queueIndexNow(env,item){
  try{
    const prior=await env.DB.prepare(`SELECT submission_id,status FROM distribution_submissions WHERE surface_slug='indexnow' AND asset_url=? AND submission_type='http_json' LIMIT 1`).bind(item.url).first();
    if(prior)return {queued:false,status:prior.status};
    const payload={host:'trytoolscout.org',urlList:[item.url],asset_type:item.assetType,asset_id:item.id||null};
    await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`sub_${crypto.randomUUID()}`,'indexnow',item.url,'http_json','ready',JSON.stringify(payload),'https://api.indexnow.org/indexnow',0).run();
    return {queued:true,status:'ready'};
  }catch(error){return {queued:false,status:'error',error:safe(error?.message||error,400)};}
}

async function queueEditorial(env,item){
  let rows=[];
  try{
    const q=await env.DB.prepare(`SELECT surface_slug,surface_name,surface_type,status,action_url,human_required,distribution_score FROM distribution_opportunities WHERE action_url IS NOT NULL ORDER BY distribution_score DESC LIMIT 120`).all();
    rows=(q.results||[]).filter(row=>EDITORIAL_TYPE_RE.test(String(row.surface_type||''))&&!TERMINAL.has(String(row.status||''))).slice(0,5);
  }catch{return {eligible:0,queued:0,deduped:0};}
  let queued=0,deduped=0;
  for(const row of rows){
    try{
      const prior=await env.DB.prepare(`SELECT submission_id FROM distribution_submissions WHERE surface_slug=? AND asset_url=? AND submission_type='research_asset' LIMIT 1`).bind(row.surface_slug,item.url).first();
      if(prior){deduped++;continue;}
      const payload={asset_type:item.assetType,title:item.title,url:item.url,data_url:item.dataUrl||null,claims:item.claims||[],policy:item.distributionPolicy||null};
      await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`sub_${crypto.randomUUID()}`,row.surface_slug,item.url,'research_asset','human_required',JSON.stringify(payload),row.action_url,1).run();
      queued++;
    }catch{}
  }
  return {eligible:rows.length,queued,deduped};
}

export async function syncLinkableAssets(env){
  const assets=await loadAssets(env);
  let indexNowQueued=0,editorialQueued=0,editorialEligible=0,deduped=0;
  for(const item of assets){
    const indexNow=await queueIndexNow(env,item);
    if(indexNow.queued)indexNowQueued++;else if(indexNow.status!=='error')deduped++;
    const editorial=await queueEditorial(env,item);
    editorialQueued+=editorial.queued;editorialEligible+=editorial.eligible;deduped+=editorial.deduped;
  }
  if(assets.length){
    try{await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,source_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`research_${crypto.randomUUID()}`,'linkable_research_sync','completed','original_research',assets[0]?.id||null,assets[0]?.url||null,`Synced ${assets.length} verified research asset(s): ${indexNowQueued} new IndexNow queue item(s), ${editorialQueued} editorial/community package(s), ${deduped} duplicate(s) skipped. Editorial outreach remains human-required unless a separately verified safe adapter exists.`).run();}catch{}
  }
  return {ok:true,assets:assets.length,indexNowQueued,editorialEligible,editorialQueued,deduped};
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/distribution/linkable-assets/sync'&&request.method==='POST'){
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});
      return Response.json(await syncLinkableAssets(env),{headers:H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    await syncLinkableAssets(env).catch(()=>({ok:false}));
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

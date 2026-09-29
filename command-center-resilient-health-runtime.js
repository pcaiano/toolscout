const PUBLIC_H={
  'Content-Type':'application/json; charset=UTF-8',
  'Cache-Control':'no-store',
  'X-ToolScout-Read-Mode':'read-only',
  'X-ToolScout-Route-Contract':'v2'
};

async function editorialQueueRows(env){
  try{
    const result=await env.DB.prepare(`SELECT queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,updated_at
      FROM distribution_editorial_queue
      WHERE human_required=1 AND status='prepared' AND target_url IS NOT NULL
      ORDER BY CASE WHEN target_name='Stremit' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 20`).all();
    return result?.results||[];
  }catch{return[]}
}

export async function handleCommandCenterResilientHealthRoute(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/command-center-resilient-health')return null;
  const editorial=await editorialQueueRows(env);
  const stremit=editorial.find(x=>x.target_name==='Stremit')||null;
  return Response.json({
    ok:true,
    service:'toolscout-command-center-resilient',
    version:6,
    statsMode:'direct-d1-resilient',
    trafficTruth:'strict-human-v1',
    externalLinkVerificationInStats:false,
    affiliateCanonicalTruth:'verified-outbound-v1',
    autonomousGrowthIncluded:true,
    catalogGrowthIncluded:true,
    chairmanPayloadVersion:'chairman-quality-v1',
    preparedEditorialCount:editorial.length,
    stremitPayloadPresent:Boolean(stremit&&stremit.suggested_title&&stremit.suggested_body&&stremit.target_url)
  },{headers:PUBLIC_H});
}

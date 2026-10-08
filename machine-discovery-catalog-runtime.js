const TOOLSCOUT_DESCRIPTOR='Independent Software Discovery & Decision Engine';
const TOOLSCOUT_PLUGIN_NAME='ToolScout: Software Decision Engine';
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=300','Access-Control-Allow-Origin':'*'};
const LINKSET_H={'Content-Type':'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"','Cache-Control':'public, max-age=3600','Link':'</.well-known/api-catalog>; rel="api-catalog"'};

export async function recentDistributionAssets(env,limit=20){
  try{
    const r=await env.DB.prepare(`SELECT asset_url,asset_type,last_seen_at FROM distribution_asset_state WHERE asset_url IS NOT NULL ORDER BY last_seen_at DESC LIMIT ?`).bind(limit).all();
    return (r.results||[]).filter(x=>/^https:\/\/trytoolscout\.org\//.test(String(x.asset_url||'')));
  }catch{return[]}
}

function apiCatalog(){
  return new Response(JSON.stringify({linkset:[{
    anchor:'https://trytoolscout.org/api/recommend',
    'service-desc':[{href:'https://trytoolscout.org/openapi.json',type:'application/vnd.oai.openapi+json;version=3.1'}],
    'service-doc':[{href:'https://trytoolscout.org/agents.md',type:'text/markdown'}],
    'service-meta':[
      {href:'https://trytoolscout.org/apis.json',type:'application/json'},
      {href:'https://trytoolscout.org/.well-known/toolscout-distribution.json',type:'application/json'}
    ]
  }]}),{headers:LINKSET_H});
}

async function manifest(env){
  const items=await recentDistributionAssets(env,12);
  return Response.json({
    name:'ToolScout',
    descriptor:TOOLSCOUT_DESCRIPTOR,
    plugin_display_name:TOOLSCOUT_PLUGIN_NAME,
    canonical_identity:`ToolScout | ${TOOLSCOUT_DESCRIPTOR} | trytoolscout.org`,
    canonical_url:'https://trytoolscout.org',
    decision_engine:{
      primary_capabilities:['decide_software','compare_for_use_case','find_alternatives','check_stack_fit','recent_changes'],
      secondary_lookup_capabilities:['recommend_tools','search_tools','get_tool','compare_tools','get_ai_compatibility'],
      positioning:'Softonic helps you find software. ToolScout helps you decide which software is right for you.',
      no_pay_to_rank:true
    },
    machine_discovery:{
      llms_txt:'https://trytoolscout.org/llms.txt',
      agent_guidance:'https://trytoolscout.org/agents.md',
      sitemap:'https://trytoolscout.org/sitemap.xml',
      apis_json:'https://trytoolscout.org/apis.json',
      openapi:'https://trytoolscout.org/openapi.json',
      api_catalog:'https://trytoolscout.org/.well-known/api-catalog',
      recommendation_api:'https://trytoolscout.org/api/recommend'
    },
    distribution:{
      publisher_kit:'https://trytoolscout.org/distribution/publisher-kit',
      widget_script:'https://trytoolscout.org/embed/toolscout.js',
      pick_script:'https://trytoolscout.org/embed/toolscout-pick.js',
      finder_script:'https://trytoolscout.org/embed/toolscout-finder.js',
      finder_modes:['full','mini'],
      compare_script:'https://trytoolscout.org/embed/toolscout-compare.js',
      badge_svg:'https://trytoolscout.org/embed/badge.svg',
      json_feed:'https://trytoolscout.org/api/distribution/feed.json',
      rss_feed:'https://trytoolscout.org/distribution/feed.xml'
    },
    embed_examples:{
      generic:'<div data-toolscout-embed="card"></div><script async src="https://trytoolscout.org/embed/toolscout.js"></script>',
      finder:'<script async src="https://trytoolscout.org/embed/toolscout-finder.js" data-publisher="YOUR-SITE" data-mode="full"></script>',
      finder_mini:'<script async src="https://trytoolscout.org/embed/toolscout-finder.js" data-publisher="YOUR-SITE" data-mode="mini"></script>',
      pick:'<script async src="https://trytoolscout.org/embed/toolscout-pick.js" data-tool="TOOL-SLUG"></script>',
      compare:'<script async src="https://trytoolscout.org/embed/toolscout-compare.js" data-a="TOOL-A" data-b="TOOL-B"></script>',
      badge:'<a href="https://trytoolscout.org/go/embed?type=badge&placement=badge"><img src="https://trytoolscout.org/embed/badge.svg" alt="Powered by ToolScout"></a>'
    },
    tracking:{
      medium:'distribution',
      campaign_family:'embedded_distribution',
      event_endpoint:'https://trytoolscout.org/api/distribution/embed-event',
      publisher_attribution:'data-publisher',
      raw_finder_query_stored:false
    },
    recent_assets:items.map(x=>x.asset_url)
  },{headers:JSON_H});
}

export async function handleMachineDiscoveryCatalogRoute(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/.well-known/toolscout-distribution.json'&&request.method==='GET')return manifest(env);
  if(u.pathname==='/.well-known/api-catalog'&&(request.method==='GET'||request.method==='HEAD')){
    const response=apiCatalog();
    return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
  }
  return null;
}

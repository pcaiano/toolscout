import fs from 'node:fs';
import {canonicalPublicUrl} from '../public-canonical-contract.js';

const BASE=(process.env.TOOLSCOUT_BASE_URL||'https://trytoolscout.org').replace(/\/$/,'');
const errors=[],warnings=[];
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
const canonical=html=>String(html||'').match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]||String(html||'').match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]||null;
const sitemapUrls=xml=>new Set([...String(xml||'').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim()).filter(Boolean));
const fileFor=pathname=>pathname==='/'?'index.html':pathname.replace(/^\//,'')+'.html';

async function fetchText(pathname,{redirect='follow',headers={}}={}){
  try{
    const response=await fetch(BASE+pathname,{redirect,headers:{'User-Agent':'ToolScout-2.0-PostDeploy-Smoke/1.0',...headers}});
    const text=await response.text();
    return{ok:response.ok,status:response.status,text,url:response.url,headers:response.headers};
  }catch(error){
    return{ok:false,status:0,text:'',url:BASE+pathname,error:String(error?.message||error),headers:new Headers()};
  }
}

// Live sitemap must contain every URL in the deployed repository sitemap.
const repoSitemap=fs.readFileSync('sitemap.xml','utf8');
const expectedSitemap=sitemapUrls(repoSitemap);
const liveSitemapResponse=await fetchText('/sitemap.xml');
if(!liveSitemapResponse.ok)errors.push({code:'live_sitemap_unavailable',status:liveSitemapResponse.status});
else{
  const live=sitemapUrls(liveSitemapResponse.text);
  for(const url of expectedSitemap)if(!live.has(url))errors.push({code:'live_sitemap_missing_url',url});
}

// Check the highest-value demand pages plus core navigation surfaces.
const portfolio=readJson('reports/editorial-authority-portfolio.json',{portfolio:[]});
const paths=[...new Set([
  '/',
  '/tools',
  '/guides',
  '/compare',
  '/software-trends-index',
  ...(portfolio.portfolio||[]).slice(0,10).map(row=>row.page).filter(Boolean)
])];

for(const pathname of paths){
  const live=await fetchText(pathname);
  if(!live.ok){errors.push({code:'critical_page_unavailable',pathname,status:live.status});continue;}
  const file=fileFor(pathname);
  if(!fs.existsSync(file))continue;
  const liveCanonical=canonical(live.text);
  const expectedCanonical=canonicalPublicUrl(new URL(live.url).pathname);
  if(liveCanonical!==expectedCanonical){
    errors.push({code:'live_canonical_mismatch',pathname,expected:expectedCanonical,actual:liveCanonical});
  }
}

// Architecture contracts must be live after the 2.0 Worker deploy.
for(const [pathname,kind] of [['/api/runtime/route-contract','route'],['/api/runtime/schedule-contract','schedule']]){
  const live=await fetchText(pathname);
  if(!live.ok){errors.push({code:'runtime_contract_unavailable',kind,status:live.status});continue;}
  try{
    const data=JSON.parse(live.text);
    if(data.architecture!=='toolscout-2.0')errors.push({code:'runtime_contract_wrong_architecture',kind,architecture:data.architecture||null});
  }catch{errors.push({code:'runtime_contract_invalid_json',kind});}
}

const health=await fetchText('/api/command-center-simplified-health');
if(!health.ok)errors.push({code:'command_center_health_unavailable',status:health.status});
else{
  try{
    const data=JSON.parse(health.text);
    if(!Array.isArray(data.cards)||!data.cards.includes('Editorial Authority'))errors.push({code:'editorial_authority_card_not_live'});
  }catch{errors.push({code:'command_center_health_invalid_json'});}
}



// The direct editorial public plane must be live for software news and the
// citation-ready Software Trends dataset.
for(const pathname of ['/news/zapier-next-gen-zaps-mcp','/software-trends-index']){
  const live=await fetchText(pathname);
  if(!live.ok)errors.push({code:'editorial_public_plane_unavailable',pathname,status:live.status});
  else if(live.headers.get('x-toolscout-public-plane')!=='editorial-v1'){
    errors.push({code:'editorial_public_plane_not_active',pathname,owner:live.headers.get('x-toolscout-public-plane')});
  }
}
const trendsDataset=await fetchText('/software-trends-index.json');
if(!trendsDataset.ok)errors.push({code:'software_trends_dataset_unavailable',status:trendsDataset.status});
else{
  try{
    const data=JSON.parse(trendsDataset.text);
    if(Number(data.version||0)<4)errors.push({code:'software_trends_dataset_not_v4',version:data.version||null});
    if(!Array.isArray(data.updates)||!data.updates.length)errors.push({code:'software_trends_dataset_empty'});
    if(!data.updates?.every(row=>row.sourceUrl&&row.changeType&&row.buyerImpact)){
      errors.push({code:'software_trends_dataset_missing_editorial_evidence'});
    }
    if(trendsDataset.headers.get('x-toolscout-public-plane')!=='editorial-v1'){
      errors.push({code:'software_trends_dataset_not_on_editorial_plane'});
    }
  }catch{errors.push({code:'software_trends_dataset_invalid_json'});}
}

// Command Center and authority health are read-only direct owners in 2.0.
const analyticsPage=await fetchText('/analytics');
if(!analyticsPage.ok)errors.push({code:'command_center_page_unavailable',status:analyticsPage.status});
else if(!/Editorial Authority/.test(analyticsPage.text))errors.push({code:'command_center_editorial_authority_missing'});

const adminStatsUnauthorized=await fetchText('/api/stats');
if(adminStatsUnauthorized.status!==401)errors.push({code:'admin_stats_auth_regressed',status:adminStatsUnauthorized.status});
else{
  if(adminStatsUnauthorized.headers.get('x-toolscout-route-owner')!=='admin_stats')errors.push({code:'admin_stats_wrong_route_owner',owner:adminStatsUnauthorized.headers.get('x-toolscout-route-owner')});
  if(adminStatsUnauthorized.headers.get('x-toolscout-compatibility-composition')!=='legacy-stats-v1')errors.push({code:'admin_stats_compatibility_header_missing'});
  try{
    const data=JSON.parse(adminStatsUnauthorized.text);
    if(data?.error!=='unauthorized')errors.push({code:'admin_stats_unauthorized_payload_regressed'});
  }catch{errors.push({code:'admin_stats_unauthorized_invalid_json'});}
}

const trafficHealth=await fetchText('/api/traffic-integrity-health');
if(!trafficHealth.ok)errors.push({code:'traffic_integrity_health_unavailable',status:trafficHealth.status});
else{
  if(trafficHealth.headers.get('x-toolscout-read-mode')!=='read-only')errors.push({code:'traffic_integrity_health_wrong_read_mode'});
  if(trafficHealth.headers.get('x-toolscout-route-owner')!=='traffic_integrity_health')errors.push({code:'traffic_integrity_health_wrong_route_owner',owner:trafficHealth.headers.get('x-toolscout-route-owner')});
  try{
    const data=JSON.parse(trafficHealth.text);
    if(!data||!data.browserGuard||!data.strictHumanTruth||!data.visitorIntegrity||!data.commandCenterIntegrity||!data.operationalTruthReconciliation){
      errors.push({code:'traffic_integrity_health_payload_regressed'});
    }
    if(data.strictHumanTruth?.version!=='strict-human-v1')errors.push({code:'traffic_integrity_truth_version_regressed'});
  }catch{errors.push({code:'traffic_integrity_health_invalid_json'});}
}

const resilientHealth=await fetchText('/api/command-center-resilient-health');
if(!resilientHealth.ok)errors.push({code:'command_center_resilient_health_unavailable',status:resilientHealth.status});
else{
  if(resilientHealth.headers.get('x-toolscout-read-mode')!=='read-only')errors.push({code:'resilient_health_wrong_read_mode'});
  if(resilientHealth.headers.get('x-toolscout-route-owner')!=='command_center_resilient_health')errors.push({code:'resilient_health_wrong_route_owner',owner:resilientHealth.headers.get('x-toolscout-route-owner')});
  try{
    const data=JSON.parse(resilientHealth.text);
    if(data.service!=='toolscout-command-center-resilient'||Number(data.version)!==6)errors.push({code:'resilient_health_payload_regressed'});
  }catch{errors.push({code:'resilient_health_invalid_json'});}
}

const authorityHealth=await fetchText('/api/distribution/authority/closed-loop-health?fresh=1');
if(!authorityHealth.ok)errors.push({code:'authority_health_unavailable',status:authorityHealth.status});
else{
  try{
    const data=JSON.parse(authorityHealth.text);
    if(data.readOnly!==true)errors.push({code:'authority_health_not_read_only'});
    if(data.owner!=='authority_health_v2')errors.push({code:'authority_health_wrong_owner',owner:data.owner||null});
  }catch{errors.push({code:'authority_health_invalid_json'});}
}



for(const pathname of ['/.well-known/agent-card.json','/.well-known/toolscout-distribution.json','/.well-known/api-catalog']){
  const live=await fetchText(pathname);
  if(!live.ok)errors.push({code:'machine_discovery_endpoint_unavailable',pathname,status:live.status});
}
const routeContractLive=await fetchText('/api/runtime/route-contract');
if(routeContractLive.ok){
  try{
    const data=JSON.parse(routeContractLive.text);
    const groups=Array.isArray(data.groups)?data.groups:[];
    const owner=id=>groups.find(group=>group.id===id)?.owner||null;
    if(owner('agent_recommendation_protocol')!=='agent_protocol_core')errors.push({code:'agent_protocol_direct_owner_not_live'});
    if(owner('agent_discovery_catalog')!=='machine_discovery_catalog')errors.push({code:'machine_discovery_catalog_not_live'});
    if(owner('command_center_resilient_health')!=='command_center_resilient_health')errors.push({code:'command_center_resilient_health_not_live'});
    if(owner('traffic_integrity_health')!=='traffic_integrity_health')errors.push({code:'traffic_integrity_health_direct_owner_not_live'});
    if(owner('admin_stats')!=='admin_stats')errors.push({code:'admin_stats_direct_owner_not_live'});
    if(owner('analytics_chairman_queue')!=='analytics_chairman')errors.push({code:'analytics_chairman_direct_owner_not_live'});
    if(owner('analytics_stats')!=='analytics_stats')errors.push({code:'analytics_stats_direct_owner_not_live'});
    if(owner('analytics_human_actions')!=='analytics_human_actions')errors.push({code:'analytics_human_actions_direct_owner_not_live'});
    if(owner('public_decision_pages')!=='public_decision')errors.push({code:'public_decision_owner_not_live'});
    if(owner('public_navigation_hubs')!=='public_navigation')errors.push({code:'public_navigation_owner_not_live'});
  }catch{}
}



const decisionPaths=[
  ...fs.readdirSync('tools')
    .filter(name=>name.endsWith('.html')&&name!=='index.html')
    .sort()
    .map(name=>'/tools/'+name.replace(/\.html$/,'')),
  ...fs.readdirSync('.')
    .filter(name=>/^best-[a-z0-9-]+\.html$/i.test(name))
    .sort()
    .map(name=>'/'+name.replace(/\.html$/,''))
];

for(let i=0;i<decisionPaths.length;i+=12){
  const batch=decisionPaths.slice(i,i+12);
  const results=await Promise.all(batch.map(async pathname=>[
    pathname,
    await fetchText(pathname+'?toolscout_v2_decision_smoke='+Date.now(),{
      headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}
    })
  ]));
  for(const [pathname,live] of results){
    if(!live.ok){
      errors.push({code:'public_decision_page_unavailable',pathname,status:live.status});
      continue;
    }
    if(live.headers.get('x-toolscout-route-owner')!=='public_decision'){
      errors.push({code:'public_decision_wrong_route_owner',pathname,owner:live.headers.get('x-toolscout-route-owner')});
    }
    if(live.headers.get('x-toolscout-public-plane')!=='decision-v1'){
      errors.push({code:'public_decision_plane_not_live',pathname});
    }
    if(live.headers.get('x-toolscout-public-parity')!=='verified-v1'){
      errors.push({code:'public_decision_verified_parity_missing',pathname,parity:live.headers.get('x-toolscout-public-parity')});
    }
    const expected=canonicalPublicUrl(pathname);
    const actual=canonical(live.text);
    if(actual!==expected){
      errors.push({code:'public_decision_canonical_mismatch',pathname,expected,actual});
    }
    if(!/Official (?:product )?source|Editorial evidence:|Primary sources:/i.test(live.text)){
      errors.push({code:'public_decision_editorial_evidence_missing',pathname});
    }
  }
}

const navigationHubs=[
  {pathname:'/tools'},
  {pathname:'/guides'},
  {pathname:'/compare',query:'?a=airtable&b=semrush&source=phase13-smoke'},
  {pathname:'/categories'},
  {pathname:'/crm-tools'},
  {pathname:'/seo-tools'},
  {pathname:'/blog/'}
];

for(const hub of navigationHubs){
  const target=hub.pathname+(hub.query||'');
  const live=await fetchText(target,{
    headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}
  });
  if(!live.ok){
    errors.push({code:'public_navigation_hub_unavailable',pathname:hub.pathname,status:live.status});
    continue;
  }
  if(live.headers.get('x-toolscout-route-owner')!=='public_navigation'){
    errors.push({code:'public_navigation_wrong_route_owner',pathname:hub.pathname,owner:live.headers.get('x-toolscout-route-owner')});
  }
  if(live.headers.get('x-toolscout-public-plane')!=='navigation-v1'){
    errors.push({code:'public_navigation_plane_not_live',pathname:hub.pathname});
  }
  if(live.headers.get('x-toolscout-public-parity')!=='verified-v1'){
    errors.push({code:'public_navigation_verified_parity_missing',pathname:hub.pathname,parity:live.headers.get('x-toolscout-public-parity')});
  }
  const expected=canonicalPublicUrl(hub.pathname);
  const actual=canonical(live.text);
  if(actual!==expected){
    errors.push({code:'public_navigation_canonical_mismatch',pathname:hub.pathname,expected,actual});
  }
  if(!/href=["']\/privacy["']/.test(live.text)){
    errors.push({code:'public_navigation_privacy_link_missing',pathname:hub.pathname});
  }
  if(!/href=["']\/analytics-consent\?choice=/.test(live.text)){
    errors.push({code:'public_navigation_consent_link_missing',pathname:hub.pathname});
  }
  if(hub.pathname==='/blog/'){
    if(!/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*follow/i.test(live.text)){
      errors.push({code:'public_blog_noindex_missing',pathname:hub.pathname});
    }
    if(!/Research before publication\./.test(live.text)){
      errors.push({code:'public_blog_editorial_control_copy_missing',pathname:hub.pathname});
    }
  }
  if(hub.pathname==='/compare'){
    for(const [code,re] of [
      ['compare_query_params_missing',/URLSearchParams\(location\.search\)/],
      ['compare_events_missing',/\/api\/events/],
      ['compare_catalog_missing',/data\/tools\.json/],
      ['compare_assets_missing',/data\/tool-assets\.json/],
      ['compare_commercial_cta_missing',/\/go\//],
      ['compare_history_state_missing',/history\.replaceState/]
    ])if(!re.test(live.text))errors.push({code,pathname:hub.pathname});
  }
  if(hub.pathname==='/tools'){
    for(const [code,re] of [
      ['tools_catalog_missing',/\/data\/tools\.json/],
      ['tools_pending_affiliate_missing',/\/data\/pending-affiliate-tools\.json/],
      ['tools_assets_missing',/\/data\/tool-assets\.json/]
    ])if(!re.test(live.text))errors.push({code,pathname:hub.pathname});
  }
}

// Protect the commercial redirect plane without generating a real click.
// The health-check header is explicitly synthetic in trackedRedirect.
const affiliate=readJson('data/affiliate.json',{});
const smokeAffiliate=Object.entries(affiliate).find(([,entry])=>entry&&entry.enabled&&entry.url);
if(!smokeAffiliate)warnings.push({code:'no_active_affiliate_route_available_for_smoke'});
else{
  const [slug]=smokeAffiliate;
  const redirect=await fetchText('/go/'+encodeURIComponent(slug),{
    redirect:'manual',
    headers:{'X-ToolScout-Health-Check':'affiliate-route'}
  });
  const location=redirect.headers.get('location')||'';
  if(![301,302,303,307,308].includes(redirect.status)){
    errors.push({code:'affiliate_redirect_not_redirecting',slug,status:redirect.status});
  }else{
    try{
      const target=new URL(location,BASE);
      if(!['http:','https:'].includes(target.protocol))throw new Error('bad_protocol');
      if(target.origin===new URL(BASE).origin&&target.pathname.startsWith('/tools')){
        errors.push({code:'affiliate_redirect_fell_back_to_internal_tools',slug});
      }
    }catch{errors.push({code:'affiliate_redirect_invalid_location',slug});}
  }
}

const result={ok:errors.length===0,checkedAt:new Date().toISOString(),baseUrl:BASE,sitemapUrls:expectedSitemap.size,criticalPages:paths.length,decisionPages:decisionPaths.length,navigationHubs:navigationHubs.length,errors,warnings};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;

import commercialCore from './distribution-embed-worker.js';
import {catalogFallbackRedirect} from './affiliate-workflow-worker.js';
import {applyAffiliateRedirectIntegrity} from './outbound-integrity-worker.js';
import {linkVisitorAfterRequest} from './visitor-integrity-worker.js';

async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function safe(value,max=120){return String(value||'').slice(0,max)}

async function recordSocialAffiliateRedirect(request,env,url,response){
  if(url.searchParams.get('ts_affiliate')!=='1'||response.status<300||response.status>=400||!response.headers.get('Location'))return;
  const platform=String(url.searchParams.get('utm_source')||'unknown').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40);
  const tool=url.pathname.slice(4).toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!tool)return;
  const ua=request.headers.get('User-Agent')||'',hash=await sha256(ua),bucket=Math.floor(Date.now()/300000);
  const id=await sha256(`${tool}|${platform}|${hash}|${bucket}`);
  await env.DB.prepare(`INSERT OR IGNORE INTO social_affiliate_redirects(redirect_id,tool_slug,platform,utm_campaign,user_agent_hash,country,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind(id,tool,platform,safe(url.searchParams.get('utm_campaign')),hash,String(request.cf?.country||'').slice(0,8)||null).run();
}

export const AFFILIATE_REDIRECT_RUNTIME_CONTRACT=Object.freeze({
  owner:'affiliate_redirect',
  path:'/go/*',
  method:'GET',
  compatibilityCore:'distribution-embed-worker.js',
  stages:['commercial_redirect','social_affiliate_attribution','outbound_integrity','visitor_linkage'],
  invariants:[
    'preserve_affiliate_destination_and_subid',
    'preserve_catalog_public_fallback',
    'preserve_go_embed_tracking',
    'known_automation_never_counts_as_monetized',
    'synthetic_health_checks_never_record_clicks',
    'outbound_proof_never_manufactures_page_confirmation',
    'redirects_are_noindex_and_no_store'
  ]
});

// The compute router owns /go/* directly; the old affiliate-workflow
// default wrapper is not executed in production. Enforce the vendor-visit
// invariant here, before social attribution and integrity stages.
export async function enforceExternalProductDestination(request,env,url,response){
  if(url.pathname==='/go/embed')return response;
  const location=response?.headers?.get('Location');
  try{
    const target=location?new URL(location,url.origin):null;
    if(response.status>=300&&response.status<400&&target&&
      ['https:','http:'].includes(target.protocol)&&
      !/(^|\.)trytoolscout\.org$/i.test(target.hostname))return response;
  }catch{}
  const slug=url.pathname.slice(4).toLowerCase();
  if(/^[a-z0-9][a-z0-9-]*$/.test(slug)){
    try{
      const fallback=await catalogFallbackRedirect(request,env,slug);
      if(fallback?.status>=300&&fallback.status<400){
        const target=new URL(fallback.headers.get('Location'),url.origin);
        if(target.protocol==='https:'&&!/(^|\.)trytoolscout\.org$/i.test(target.hostname))return fallback;
      }
    }catch{}
  }
  return new Response('Product destination unavailable',{status:404,
    headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}

export async function handleAffiliateRedirectRoute(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'||!url.pathname.startsWith('/go/'))return null;

  // Preserve the proven commercial core while bypassing the unrelated upper
  // decorator chain. This core includes /go/embed, catalog fallback and the
  // canonical trackedRedirect implementation that snapshots affiliate state.
  let response=await commercialCore.fetch(request,env,ctx);
  response=await enforceExternalProductDestination(request,env,url,response);

  // These stages historically lived above the commercial core in separate
  // wrappers. Keep their ordering explicit so the commercial truth semantics
  // remain identical while route ownership becomes direct.
  if(url.searchParams.get('ts_affiliate')==='1'){
    try{await recordSocialAffiliateRedirect(request,env,url,response)}catch{}
  }
  response=await applyAffiliateRedirectIntegrity(request,env,url,response);
  try{await linkVisitorAfterRequest(request,env,url,response,null)}catch{}

  const headers=new Headers(response.headers);
  headers.set('X-ToolScout-Commercial-Core','bounded-compat-v1');
  headers.set('X-ToolScout-Outbound-Release','live-external-only-v2-20261010');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

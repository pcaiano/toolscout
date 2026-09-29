import {publicRuntimeToolResponse,publicQualityEnhancedToolResponse,publicRuntimeRankingResponse} from './catalog-autonomy-worker.js';
import {transformSeoPublicPage} from './seo-cloudflare-runtime-worker.js';
import {canonicalizePublicHtmlResponse} from './public-canonical-contract.js';
import {injectToolScoutSocialFooter} from './social-profiles.js';
import {addPublicEditorialEvidence} from './public-editorial-evidence.js';

function route(pathname){
  const p=String(pathname||'');
  const tool=p.match(/^\/tools\/([a-z0-9][a-z0-9-]*)(?:\.html)?\/?$/i);
  if(tool)return{kind:'tool',slug:tool[1].toLowerCase(),canonical:`/tools/${tool[1].toLowerCase()}`};
  const best=p.match(/^\/(best-[a-z0-9-]+)(?:\.html)?\/?$/i);
  if(best)return{kind:'guide',slug:best[1].toLowerCase(),canonical:`/${best[1].toLowerCase()}`};
  return null;
}

async function assetHtml(env,request,canonical){
  if(!env?.ASSETS?.fetch)return null;
  const candidates=[canonical,canonical+'.html'];
  for(const pathname of candidates){
    try{
      const u=new URL(request.url);u.pathname=pathname;
      const response=await env.ASSETS.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}));
      if(response?.ok&&String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
    }catch{}
  }
  return null;
}

async function finish(request,response,env){
  if(!response)return null;
  const evidenced=await addPublicEditorialEvidence(request,response,env);
  const canonical=await canonicalizePublicHtmlResponse(evidenced,new URL(request.url).pathname);
  const seo=await transformSeoPublicPage(request,canonical,env);
  const social=await injectToolScoutSocialFooter(seo);
  const headers=new Headers(social.headers);
  headers.set('X-ToolScout-Public-Plane','decision-v1');
  headers.set('X-ToolScout-Route-Contract','v2');
  headers.set('X-ToolScout-Public-Parity','candidate');
  return new Response(social.body,{status:social.status,statusText:social.statusText,headers});
}

export function publicDecisionRoute(pathname){return route(pathname)}

export async function renderPublicDecisionCandidate(request,env){
  if(request.method!=='GET')return null;
  const r=route(new URL(request.url).pathname);
  if(!r)return null;

  // Existing static/indexed pages are sovereign. Runtime catalog content is
  // creation-only fallback for genuinely new tool/guide surfaces.
  let response=await assetHtml(env,request,r.canonical);

  if(r.kind==='tool'){
    if(response)response=await publicQualityEnhancedToolResponse(response,env,r.slug);
    else response=await publicRuntimeToolResponse(env,r.slug);
  }else if(r.kind==='guide'){
    if(!response)response=await publicRuntimeRankingResponse(env,r.canonical);
  }

  return finish(request,response,env);
}

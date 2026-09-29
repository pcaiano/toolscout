import {transformSeoPublicPage} from './seo-cloudflare-runtime-worker.js';
import {injectToolScoutSocialFooter} from './social-profiles.js';

function canonicalNewsPath(pathname){
  const p=String(pathname||'');
  if(!/^\/news\/[a-z0-9][a-z0-9-]*(?:\.html)?\/?$/i.test(p))return null;
  return p.replace(/\.html\/?$/i,'').replace(/\/$/,'');
}

export function ownsPublicEditorialPath(pathname){
  return Boolean(canonicalNewsPath(pathname));
}

export async function handlePublicEditorialRoute(request,env){
  if(request.method!=='GET')return null;
  const url=new URL(request.url);
  const canonical=canonicalNewsPath(url.pathname);
  if(!canonical)return null;

  if(/\.html\/?$/i.test(url.pathname)){
    const target=new URL(url.toString());
    target.pathname=canonical;
    return Response.redirect(target.toString(),308);
  }

  if(!env.ASSETS?.fetch)return null;
  const asset=await env.ASSETS.fetch(request);
  if(!asset?.ok)return null;

  // Preserve the two useful public transformations while bypassing the legacy
  // control/observability decorator chain.
  const seo=await transformSeoPublicPage(request,asset,env);
  const finalResponse=await injectToolScoutSocialFooter(seo);
  const headers=new Headers(finalResponse.headers);
  headers.set('X-ToolScout-Public-Plane','editorial-v1');
  headers.set('X-ToolScout-Route-Contract','v2');
  return new Response(finalResponse.body,{status:finalResponse.status,statusText:finalResponse.statusText,headers});
}

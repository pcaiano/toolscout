import {transformSeoPublicPage} from './seo-cloudflare-runtime-worker.js';
import {injectToolScoutSocialFooter} from './social-profiles.js';
import {canonicalizePublicHtmlResponse} from './public-canonical-contract.js';
import {injectNewsletterSignup} from './newsletter-public-runtime.js';
import {transformPublicOutboundPolicyResponse,transformPublicRedesignResponse} from './public-redesign-runtime.js';

function editorialRoute(pathname){
  const p=String(pathname||'');
  if(/^\/news\/[a-z0-9][a-z0-9-]*(?:\.html)?\/?$/i.test(p)){
    const canonical=p.replace(/\.html\/?$/i,'').replace(/\/$/,'');
    return{kind:'html',canonical,redirect:/\.html\/?$/i.test(p),surface:'news'};
  }
  if(p==='/software-trends-index.json')return{kind:'json',canonical:p,redirect:false,surface:'software_trends_dataset'};
  if(['/software-trends-index','/software-trends-index/','/software-trends-index.html'].includes(p)){
    return{kind:'html',canonical:'/software-trends-index',redirect:p==='/software-trends-index.html',surface:'software_trends'};
  }
  return null;
}

export function ownsPublicEditorialPath(pathname){
  return Boolean(editorialRoute(pathname));
}

export async function handlePublicEditorialRoute(request,env){
  if(request.method!=='GET')return null;
  const url=new URL(request.url);
  const route=editorialRoute(url.pathname);
  if(!route)return null;

  if(route.redirect){
    const target=new URL(url.toString());
    target.pathname=route.canonical;
    return Response.redirect(target.toString(),308);
  }

  if(!env.ASSETS?.fetch)return null;
  const asset=await env.ASSETS.fetch(request);
  if(!asset?.ok)return null;

  if(route.kind==='json'){
    const headers=new Headers(asset.headers);
    headers.set('Content-Type','application/json; charset=UTF-8');
    headers.set('Cache-Control','public, max-age=300');
    headers.set('X-ToolScout-Public-Plane','editorial-v1');
    headers.set('X-ToolScout-Route-Contract','v2');
    headers.delete('Content-Length');
    return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
  }

  // Keep editorial pages on the same ToolScout 2.0 visual and outbound
  // contract as every other public HTML surface, even though this owner bypasses
  // the generic public asset pipeline.
  const seo=await transformSeoPublicPage(request,asset,env);
  const newsletter=route.surface==='news'?await injectNewsletterSignup(seo,{source:'news-article'}):seo;
  const redesigned=await transformPublicRedesignResponse(request,newsletter);
  const social=await injectToolScoutSocialFooter(redesigned);
  const canonical=await canonicalizePublicHtmlResponse(social,url.pathname);
  const finalResponse=await transformPublicOutboundPolicyResponse(request,canonical);
  const headers=new Headers(finalResponse.headers);
  headers.set('X-ToolScout-Public-Plane','editorial-v1');
  headers.set('X-ToolScout-Editorial-Surface',route.surface);
  headers.set('X-ToolScout-Route-Contract','v2');
  return new Response(finalResponse.body,{status:finalResponse.status,statusText:finalResponse.statusText,headers});
}

import {transformSeoPublicPage} from './seo-cloudflare-runtime-worker.js';
import {canonicalizePublicHtmlResponse} from './public-canonical-contract.js';
import {injectToolScoutSocialFooter} from './social-profiles.js';

const HUBS=Object.freeze({
  '/tools':'/tools.html',
  '/guides':'/guides.html',
  '/compare':'/compare.html',
  '/categories':'/categories.html',
  '/crm-tools':'/crm-tools.html',
  '/seo-tools':'/seo-tools.html'
});

function normalizedHubPath(pathname){
  let p=String(pathname||'');
  if(p.endsWith('.html'))p=p.slice(0,-5);
  if(p.length>1&&p.endsWith('/'))p=p.slice(0,-1);
  return Object.prototype.hasOwnProperty.call(HUBS,p)?p:null;
}

async function asset(env,request,hub){
  if(!env?.ASSETS?.fetch)return null;
  const u=new URL(request.url);
  u.pathname=HUBS[hub];
  u.search='';
  try{
    const response=await env.ASSETS.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}));
    if(!response?.ok)return null;
    if(!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return null;
    return response;
  }catch{return null}
}

async function finish(request,response,env){
  if(!response)return null;
  const hub=normalizedHubPath(new URL(request.url).pathname);
  const canonicalized=await canonicalizePublicHtmlResponse(response,hub||new URL(request.url).pathname);
  const seo=await transformSeoPublicPage(request,canonicalized,env);
  const social=await injectToolScoutSocialFooter(seo);
  const headers=new Headers(social.headers);
  headers.set('X-ToolScout-Public-Plane','navigation-v1');
  headers.set('X-ToolScout-Route-Contract','v2');
  headers.set('X-ToolScout-Public-Parity','candidate');
  return new Response(social.body,{status:social.status,statusText:social.statusText,headers});
}

export function publicNavigationHub(pathname){return normalizedHubPath(pathname)}

export async function renderPublicNavigationCandidate(request,env){
  if(request.method!=='GET')return null;
  const hub=normalizedHubPath(new URL(request.url).pathname);
  if(!hub)return null;
  return finish(request,await asset(env,request,hub),env);
}

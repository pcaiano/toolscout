import base from './command-center-affiliate-table-worker.js';
import { withPrivateAssets } from './private-assets.js';
import { augmentMachineDiscoveryStats, decorateMachineDiscoveryPage } from './machine-discovery-extension.js';
import { augmentTrafficTruthStats, decorateTrafficTruthPage } from './traffic-truth-extension.js';
import { analyticsConsentResponse, decoratePublicAnalytics } from './analytics-consent.js';
import {affiliateChairmanAdmissionState,affiliateChairmanAllowed,filterChairmanQueueAffiliates} from './affiliate-chairman-filter.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const PUBLIC_BASE='https://trytoolscout.org';

function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/analytics-v2'||path==='/analytics-v2/'||path==='/analytics-v2.html'}
function cleanPublicMarkup(value){return String(value||'').replace(/https:\/\/trytoolscout\.org(\/[^"'<>\s?#]*)\.html(?=([?#"'<>\s]|$))/g,`${PUBLIC_BASE}$1`).replace(/(["'])(\/[^"'<>\s?#]*)\.html(?=([?#]|["']))/g,'$1$2').replace(/(["'])(\.\/[^"'<>\s?#]*)\.html(?=([?#]|["']))/g,'$1$2')}
function rebuiltResponse(response,body,contentType){const headers=new Headers(response.headers);if(contentType)headers.set('Content-Type',contentType);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');return new Response(body,{status:response.status,statusText:response.statusText,headers})}
async function cleanSitemap(request,env){try{const response=await env.ASSETS.fetch(new Request(new URL('/sitemap.xml',request.url)));if(!response.ok)return response;const xml=(await response.text()).replace(/\.html(?=<\/loc>)/g,'');return rebuiltResponse(response,xml,'application/xml; charset=UTF-8')}catch{return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://trytoolscout.org/</loc></url></urlset>',{status:200,headers:{'Content-Type':'application/xml; charset=UTF-8','Cache-Control':'public, max-age=3600'}})}}
async function cleanPublicHtml(request,response){const type=String(response.headers.get('Content-Type')||'').toLowerCase();if(!response.ok||!type.includes('text/html'))return response;const html=decoratePublicAnalytics(request,cleanPublicMarkup(await response.text()));return rebuiltResponse(response,html,response.headers.get('Content-Type')||'text/html; charset=UTF-8')}


function filterHumanActionData(data,state){
  const affiliate=(Array.isArray(data?.affiliate)?data.affiliate:[]).filter(item=>affiliateChairmanAllowed(item,state));
  const distribution=Array.isArray(data?.distribution)?data.distribution:[];
  return {...data,affiliate,distribution,total:affiliate.length+distribution.length};
}

function filterChairmanQueueAffiliates(queue,state){
  if(!queue||typeof queue!=='object')return queue;
  const items=(Array.isArray(queue.items)?queue.items:[]).filter(item=>item.engine!=='affiliate'||affiliateChairmanAllowed(item,state));
  const broken=(Array.isArray(queue.broken_links)?queue.broken_links:[]).filter(item=>item.engine!=='affiliate'||affiliateChairmanAllowed(item,state));
  const external=(Array.isArray(queue.external_verification_issues)?queue.external_verification_issues:[]).filter(item=>item.engine!=='affiliate'||affiliateChairmanAllowed(item,state));
  return {...queue,items,broken_links:broken,external_verification_issues:external,total:items.length,estimated_minutes:items.reduce((sum,item)=>sum+Number(item.estimated_minutes||0),0),rule:'Affiliate human actions require qualified publisher-affiliate evidence, high-confidence discovery and an exact validated application URL. Watchlist, no-program, rejected and paused states are excluded.'};
}

async function filteredHumanActions(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return upstream}
  const state=await affiliateChairmanAdmissionState(env);
  return Response.json(filterHumanActionData(data,state),{headers:JSON_H});
}

async function filteredStats(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return upstream}
  const state=await affiliateChairmanAdmissionState(env);
  if(data?.growthOps?.chairmanQueue){
    data={...data,growthOps:{...data.growthOps,chairmanQueue:filterChairmanQueueAffiliates(data.growthOps.chairmanQueue,state)}};
  }
  data=await augmentTrafficTruthStats(data,request,env);
  data=await augmentMachineDiscoveryStats(data,env);
  return Response.json(data,{headers:JSON_H});
}

async function filteredChairmanQueue(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return upstream}
  const state=await affiliateChairmanAdmissionState(env);
  return Response.json(filterChairmanQueueAffiliates(data,state),{headers:JSON_H});
}

async function decoratedAnalytics(request,env,ctx){
  let response=await base.fetch(request,env,ctx);
  response=await decorateMachineDiscoveryPage(response);
  return decorateTrafficTruthPage(response);
}

const filteredBase={
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics-consent')return analyticsConsentResponse(request);
    if(request.method==='GET'&&url.pathname==='/sitemap.xml')return cleanSitemap(request,env);
    if(request.method==='GET'&&url.pathname==='/analytics/api/human-actions')return filteredHumanActions(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return filteredStats(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/chairman-queue')return filteredChairmanQueue(request,env,ctx);
    if(request.method==='GET'&&analyticsPath(url.pathname))return decoratedAnalytics(request,env,ctx);
    const upstream=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&!analyticsPath(url.pathname))return cleanPublicHtml(request,upstream);
    return upstream;
  },
  async scheduled(event,env,ctx){
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

export default withPrivateAssets(filteredBase);

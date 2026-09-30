import attributionCore from './ga4-attribution-24h-worker.js';
import {OWNER_SOURCE,OWNER_MEDIUM,markerState,cookieValue} from './ga4-owner-context.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const COMMAND_CENTER_SESSION_COOKIE='toolscout_cc';
const COMMAND_CENTER_SESSION_TTL_SECONDS=86400;

function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
async function digestHex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function sessionBucket(now=Date.now()){return Math.floor(now/(COMMAND_CENTER_SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function validCommandCenterSession(request,env){
  if(!env.ADMIN_TOKEN)return false;
  const supplied=cookieValue(request,COMMAND_CENTER_SESSION_COOKIE);if(!supplied)return false;
  const bucket=sessionBucket();
  for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;
  return false;
}

async function ownerSafeAcquisition24h(request,env,ctx){
  const target=new URL(request.url);target.pathname='/analytics/api/google/acquisition-24h';target.search='';
  const upstreamRequest=new Request(target.toString(),{method:'GET',headers:new Headers(request.headers)});
  const upstream=await attributionCore.fetch(upstreamRequest,env,ctx);
  const raw=await upstream.json().catch(()=>null);
  if(!upstream.ok||!raw||raw.status!=='connected')return {
    status:'unavailable',
    reason:raw?.reason||'GA4 rolling 24h acquisition is unavailable.',
    marker:markerState(request),
    fetchedAt:new Date().toISOString()
  };

  const sources=Array.isArray(raw.sources)?raw.sources:[];
  const ownerRows=sources.filter(row=>String(row.source||'')===OWNER_SOURCE&&String(row.medium||'')===OWNER_MEDIUM);
  const externalSources=sources.filter(row=>!(String(row.source||'')===OWNER_SOURCE&&String(row.medium||'')===OWNER_MEDIUM));
  const ownerSessions=ownerRows.reduce((sum,row)=>sum+n(row.sessions),0);
  const ownerEngagedSessions=ownerRows.reduce((sum,row)=>sum+n(row.engagedSessions),0);
  const totalSessions=n(raw.sessions),totalEngagedSessions=n(raw.engagedSessions);
  const candidateSessions=Math.max(0,totalSessions-ownerSessions);
  const candidateEngagedSessions=Math.max(0,totalEngagedSessions-ownerEngagedSessions);
  const marker=markerState(request),ready=marker.ready;
  const engagementRate=ready&&candidateSessions
    ?Number((candidateEngagedSessions/candidateSessions*100).toFixed(1))
    :ready?0:null;

  return {
    status:'connected',
    propertyId:raw.propertyId,
    window:'rolling_24h',
    marker,
    total:{sessions:totalSessions,engagedSessions:totalEngagedSessions,engagementRate:n(raw.engagementRate)},
    owner:{sessions:ownerSessions,engagedSessions:ownerEngagedSessions,source:OWNER_SOURCE,medium:OWNER_MEDIUM},
    external:{
      status:ready?'ready':'warming_up',
      sessions:ready?candidateSessions:null,
      engagedSessions:ready?candidateEngagedSessions:null,
      engagementRate,
      candidateSessions,
      candidateEngagedSessions,
      sources:externalSources
    },
    growthSignal:{
      status:ready?'ready':'warming_up',
      metric:'ga4_external_sessions_24h',
      learningAllowed:ready,
      sessions:ready?candidateSessions:null,
      engagedSessions:ready?candidateEngagedSessions:null,
      sources:ready?externalSources:[],
      reason:ready
        ?'Owner-marked GA4 sessions are excluded from a full rolling 24h window.'
        :'Owner exclusion is warming up. Channel promotion and penalization from GA4 acquisition must remain disabled until the clean window is complete.'
    },
    fetchedAt:new Date().toISOString(),
    note:ready
      ?'GA4 external sessions exclude only traffic explicitly marked toolscout_owner / internal. Country is never used as an exclusion rule.'
      :'Historical sessions before owner marking cannot be classified retroactively. This device is now marked as owner. The external acquisition metric becomes operational after 24 hours of clean coverage.'
  };
}

export async function handleGa4OwnerExclusionRoute(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/analytics/api/google/external-24h')return null;
  if(!(await validCommandCenterSession(request,env))){
    return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  }
  const data=await ownerSafeAcquisition24h(request,env,ctx);
  return Response.json(data,{status:data.status==='connected'?200:503,headers:JSON_H});
}

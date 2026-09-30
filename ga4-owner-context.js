export const OWNER_COOKIE='toolscout_owner';
export const OWNER_SINCE_COOKIE='toolscout_owner_since';
export const OWNER_SOURCE='toolscout_owner';
export const OWNER_MEDIUM='internal';
export const OWNER_COOKIE_TTL_SECONDS=31536000;
export const CLEAN_WINDOW_HOURS=24;
export const GA_MEASUREMENT_ID='G-9VR80SYYH7';

export function cookieValue(request,name){
  const raw=String(request?.headers?.get('Cookie')||'');
  const match=raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?decodeURIComponent(match[1]):'';
}

export function ownerSinceMs(request){
  const raw=Number(cookieValue(request,OWNER_SINCE_COOKIE));
  return Number.isFinite(raw)&&raw>0?raw:null;
}

export function markerState(request,now=Date.now()){
  const marked=cookieValue(request,OWNER_COOKIE)==='1',since=ownerSinceMs(request);
  const coverageHours=marked&&since?Math.max(0,Math.min(CLEAN_WINDOW_HOURS,(now-since)/3600000)):0;
  const ready=marked&&Boolean(since)&&coverageHours>=CLEAN_WINDOW_HOURS;
  return {
    marked,since,
    coverageHours:Number(coverageHours.toFixed(2)),
    ready,
    warmupRemainingHours:Number(Math.max(0,CLEAN_WINDOW_HOURS-coverageHours).toFixed(2)),
    scope:'this_browser'
  };
}

export function withOwnerMarker(response,request){
  const headers=new Headers(response.headers);
  headers.append('Set-Cookie',`${OWNER_COOKIE}=1; Path=/; Max-Age=${OWNER_COOKIE_TTL_SECONDS}; SameSite=Lax; Secure`);
  if(!ownerSinceMs(request)){
    headers.append('Set-Cookie',`${OWNER_SINCE_COOKIE}=${Date.now()}; Path=/; Max-Age=${OWNER_COOKIE_TTL_SECONDS}; SameSite=Lax; Secure`);
  }
  headers.delete('Content-Length');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export function ownerGaConfig(){
  return `gtag('config','${GA_MEASUREMENT_ID}',{campaign_source:'${OWNER_SOURCE}',campaign_medium:'${OWNER_MEDIUM}',campaign_name:'owner_exclusion_v1'});`;
}

export function markOwnerAnalyticsHtml(html){
  let value=String(html||'');
  const plain=`gtag('config','${GA_MEASUREMENT_ID}');`,owner=ownerGaConfig();
  if(value.includes(plain))value=value.replace(plain,owner);
  return value;
}

export async function markPublicOwnerAnalytics(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(!response.ok||!type.includes('text/html'))return response;
  const html=markOwnerAnalyticsHtml(await response.text());
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

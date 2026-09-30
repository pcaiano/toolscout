import {analyticsConsentResponse,decoratePublicAnalytics} from './analytics-consent.js';

const PUBLIC_BASE='https://trytoolscout.org';

export function cleanPublicMarkup(value){
  return String(value||'')
    .replace(/https:\/\/trytoolscout\.org(\/[^"'<>\s?#]*)\.html(?=([?#"'<>\s]|$))/g,`${PUBLIC_BASE}$1`)
    .replace(/(["'])(\/[^"'<>\s?#]*)\.html(?=([?#]|["']))/g,'$1$2')
    .replace(/(["'])(\.\/[^"'<>\s?#]*)\.html(?=([?#]|["']))/g,'$1$2');
}

function rebuiltResponse(response,body,contentType){
  const headers=new Headers(response.headers);
  if(contentType)headers.set('Content-Type',contentType);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export async function handlePublicAnalyticsRoute(request){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/analytics-consent')return analyticsConsentResponse(request);
  return null;
}

export async function transformPublicAnalyticsResponse(request,response){
  const type=String(response.headers.get('Content-Type')||'').toLowerCase();
  if(!response.ok||!type.includes('text/html'))return response;
  const html=decoratePublicAnalytics(request,cleanPublicMarkup(await response.text()));
  return rebuiltResponse(response,html,response.headers.get('Content-Type')||'text/html; charset=UTF-8');
}

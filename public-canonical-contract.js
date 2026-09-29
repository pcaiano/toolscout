const BASE='https://trytoolscout.org';

export function canonicalSeoPath(pathname){
  const p=String(pathname||'/');
  if(p==='/index.html')return'/';
  return p.replace(/\.html$/i,'')||'/';
}

export function canonicalPublicUrl(pathname){
  return BASE+canonicalSeoPath(pathname);
}

export function canonicalizeOwnedMarkup(value){
  return String(value||'')
    .replace(/https:\/\/www\.trytoolscout\.org/gi,BASE)
    .replace(/https:\/\/trytoolscout\.org(\/[^"'<>\\\s?#]*?)\.html(?=([?#"'<>\\\s]|$))/gi,BASE+'$1')
    .replace(/(["'=])((?:\.\/|\/)[^"'<>\\\s?#]*?)\.html(?=([?#"'<>\\\s]|$))/gi,'$1$2');
}

export async function canonicalizePublicHtmlResponse(response,pathname=''){
  if(!response||!response.ok)return response;
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('text/html'))return response;
  const body=canonicalizeOwnedMarkup(await response.text());
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('Content-Type','text/html; charset=UTF-8');
  headers.set('X-ToolScout-SEO-Canonical','extensionless-v1');
  headers.set('X-ToolScout-Canonical-Path',canonicalSeoPath(pathname));
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

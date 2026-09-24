export const TOOLSCOUT_SOCIAL_PROFILES=Object.freeze([
  {key:'linkedin',label:'LinkedIn',url:'https://www.linkedin.com/company/146229906/'},
  {key:'x',label:'X / Twitter',url:'https://x.com/trytoolscout'},
  {key:'bluesky',label:'Bluesky',url:'https://bsky.app/profile/trytoolscout.bsky.social'},
  {key:'devto',label:'DEV Community',url:'https://dev.to/trytoolscout'},
  {key:'pinterest',label:'Pinterest',url:'https://www.pinterest.com/trytoolscout/'},
  {key:'threads',label:'Threads',url:'https://www.threads.com/@trytoolscout'}
]);

function footerHtml(){
  const links=TOOLSCOUT_SOCIAL_PROFILES.map(p=>`<a href="${p.url}" rel="me noopener" target="_blank" data-social-network="${p.key}">${p.label}</a>`).join('');
  return `<footer data-toolscout-social-footer="1" style="max-width:1180px;margin:48px auto 0;padding:24px 22px 34px;border-top:1px solid #e4e7ec;font-family:Inter,system-ui,-apple-system,sans-serif"><div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><span style="font-size:12px;color:#667085">Follow ToolScout</span><nav aria-label="ToolScout social profiles" style="display:flex;gap:14px;flex-wrap:wrap">${links}</nav></div><style>[data-toolscout-social-footer] a{font-size:12px;font-weight:700;color:#475467;text-decoration:none}[data-toolscout-social-footer] a:hover{text-decoration:underline}</style></footer>`;
}

export async function injectToolScoutSocialFooter(response){
  if(!response?.ok)return response;
  const type=String(response.headers.get('Content-Type')||'').toLowerCase();
  if(type.includes('json')||type.includes('xml')||type.startsWith('image/')||type.startsWith('video/')||type.startsWith('audio/')||type.includes('pdf'))return response;
  let probe;try{probe=await response.clone().text()}catch{return response}
  if(!/^\s*(?:<!doctype html|<html)/i.test(probe))return response;
  let html=probe;
  if(html.includes('data-toolscout-social-footer="1"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const footer=footerHtml();
  html=html.includes('</body>')?html.replace('</body>',footer+'</body>'):html+footer;
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  headers.set('Content-Type','text/html; charset=UTF-8');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

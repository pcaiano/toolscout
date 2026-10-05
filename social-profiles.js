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
  return `<footer data-toolscout-social-footer="1" style="max-width:1180px;margin:24px auto 0;padding:18px 22px 22px;border-top:1px solid #DDE2DC;font-family:Inter,system-ui,-apple-system,sans-serif"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px 24px;flex-wrap:wrap"><span style="font-size:10px;letter-spacing:.09em;text-transform:uppercase;font-weight:800;color:#777E77">ToolScout elsewhere</span><nav aria-label="ToolScout social profiles" style="display:flex;gap:10px 18px;flex-wrap:wrap">${links}</nav></div><style>[data-toolscout-social-footer] a{font-size:11px;font-weight:700;color:#555D55;text-decoration:none}[data-toolscout-social-footer] a:hover{text-decoration:underline}@media(max-width:700px){[data-toolscout-social-footer]{margin-top:16px!important;padding:16px 18px 20px!important}[data-toolscout-social-footer] nav{gap:9px 15px!important}}</style></footer>`;
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

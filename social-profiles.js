export const TOOLSCOUT_SOCIAL_PROFILES=Object.freeze([
  {key:'linkedin',label:'LinkedIn',url:'https://www.linkedin.com/company/146229906/'},
  {key:'x',label:'X',url:'https://x.com/trytoolscout'},
  {key:'bluesky',label:'Bluesky',url:'https://bsky.app/profile/trytoolscout.bsky.social'},
  {key:'devto',label:'DEV',url:'https://dev.to/trytoolscout'},
  {key:'pinterest',label:'Pinterest',url:'https://www.pinterest.com/trytoolscout/'},
  {key:'threads',label:'Threads',url:'https://www.threads.com/@trytoolscout'}
]);

function socialRailHtml(){
  const links=TOOLSCOUT_SOCIAL_PROFILES.map(p=>`<a href="${p.url}" rel="me noopener" target="_blank" data-social-network="${p.key}"><span>${p.label}</span><span aria-hidden="true">↗</span></a>`).join('');
  return `<div data-toolscout-social-footer="1" class="ts-social-rail"><div class="ts-social-rail-inner"><div class="ts-social-copy"><span class="ts-social-kicker">ToolScout elsewhere</span><span class="ts-social-note">Product updates and editorial notes.</span></div><div class="ts-social-links" role="navigation" aria-label="ToolScout social profiles">${links}</div></div><style>
[data-toolscout-social-footer]{margin-top:26px!important;padding-top:18px!important;border-top:1px solid #DDE2DC!important;font-family:Inter,system-ui,-apple-system,sans-serif!important}
[data-toolscout-social-footer] .ts-social-rail-inner{display:grid!important;grid-template-columns:minmax(150px,190px) 1fr!important;align-items:start!important;gap:18px 28px!important}
[data-toolscout-social-footer] .ts-social-copy{display:flex!important;flex-direction:column!important;gap:5px!important}
[data-toolscout-social-footer] .ts-social-kicker{font-size:10px!important;line-height:1.2!important;letter-spacing:.1em!important;text-transform:uppercase!important;font-weight:850!important;color:#777E77!important}
[data-toolscout-social-footer] .ts-social-note{font-size:11px!important;line-height:1.4!important;color:#8A918A!important}
[data-toolscout-social-footer] .ts-social-links{display:flex!important;align-items:center!important;justify-content:flex-start!important;flex-wrap:wrap!important;gap:8px!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
[data-toolscout-social-footer] .ts-social-links a{display:inline-flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-height:36px!important;margin:0!important;padding:9px 11px!important;border:1px solid #DDE2DC!important;border-radius:7px!important;background:#F8F9F6!important;color:#3F463F!important;text-decoration:none!important;font-size:11px!important;line-height:1!important;font-weight:760!important;letter-spacing:0!important;white-space:nowrap!important;transition:transform 140ms cubic-bezier(.2,.7,.2,1),border-color 140ms cubic-bezier(.2,.7,.2,1),background 140ms cubic-bezier(.2,.7,.2,1)!important}
[data-toolscout-social-footer] .ts-social-links a:hover{transform:translateY(-1px)!important;border-color:#AEB7AD!important;background:#fff!important;text-decoration:none!important}
[data-toolscout-social-footer] .ts-social-links a span:last-child{font-size:11px!important;color:#777E77!important}
@media(max-width:700px){
  [data-toolscout-social-footer]{margin-top:22px!important;padding-top:18px!important}
  [data-toolscout-social-footer] .ts-social-rail-inner{grid-template-columns:1fr!important;gap:13px!important}
  [data-toolscout-social-footer] .ts-social-copy{gap:3px!important}
  [data-toolscout-social-footer] .ts-social-links{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;width:100%!important}
  [data-toolscout-social-footer] .ts-social-links a{width:100%!important;min-height:40px!important;padding:10px 11px!important;font-size:12px!important}
}
@media(max-width:380px){
  [data-toolscout-social-footer] .ts-social-links{grid-template-columns:1fr!important}
}
</style></div>`;
}

function standaloneFooterHtml(){
  return `<footer class="ts-social-footer-shell" style="max-width:1180px;margin:0 auto;padding:0 22px 22px;font-family:Inter,system-ui,-apple-system,sans-serif">${socialRailHtml()}</footer>`;
}

function injectSocialRail(html){
  const rail=socialRailHtml();
  const trust=/(<section\b[^>]*class=["'][^"']*\btrust\b[^"']*["'][^>]*>[\s\S]*?)(<\/section>)/i;
  if(trust.test(html))return html.replace(trust,(match,body,close)=>body+rail+close);
  const footerClose=html.toLowerCase().lastIndexOf('</footer>');
  if(footerClose>=0)return html.slice(0,footerClose)+rail+html.slice(footerClose);
  const footer=standaloneFooterHtml();
  return html.includes('</body>')?html.replace('</body>',footer+'</body>'):html+footer;
}

export async function injectToolScoutSocialFooter(response){
  if(!response?.ok)return response;
  const type=String(response.headers.get('Content-Type')||'').toLowerCase();
  if(type.includes('json')||type.includes('xml')||type.startsWith('image/')||type.startsWith('video/')||type.startsWith('audio/')||type.includes('pdf'))return response;
  let probe;try{probe=await response.clone().text()}catch{return response}
  if(!/^\s*(?:<!doctype html|<html)/i.test(probe))return response;
  let html=probe;
  if(html.includes('data-toolscout-social-footer="1"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  html=injectSocialRail(html);
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  headers.set('Content-Type','text/html; charset=UTF-8');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

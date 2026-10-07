export const TOOLSCOUT_PUBLIC_IDENTITY=Object.freeze({name:'ToolScout',descriptor:'Independent Software Discovery & Decision Engine',domain:'trytoolscout.org',pluginDisplayName:'ToolScout: Software Decision Engine'});

export const TOOLSCOUT_SOCIAL_PROFILES=Object.freeze([
  {key:'linkedin',label:'LinkedIn',url:'https://www.linkedin.com/company/146229906/'},
  {key:'x',label:'X',url:'https://x.com/trytoolscout'},
  {key:'bluesky',label:'Bluesky',url:'https://bsky.app/profile/trytoolscout.bsky.social'},
  {key:'devto',label:'DEV',url:'https://dev.to/trytoolscout'},
  {key:'pinterest',label:'Pinterest',url:'https://www.pinterest.com/trytoolscout/'},
  {key:'threads',label:'Threads',url:'https://www.threads.com/@trytoolscout'}
]);

function socialFooterHtml(){
  const links=TOOLSCOUT_SOCIAL_PROFILES.map(p=>`<a href="${p.url}" rel="me noopener" target="_blank" data-toolscout-social-link="1" data-social-network="${p.key}"><span>${p.label}</span><span class="ts-social-arrow" aria-hidden="true">↗</span></a>`).join('');
  return `<div data-toolscout-social-footer="2" class="ts-social-follow"><div class="ts-social-follow-inner"><div class="ts-social-follow-copy"><span class="ts-social-kicker">ToolScout elsewhere</span><span class="ts-social-note">Independent Software Discovery & Decision Engine · trytoolscout.org</span></div><div class="ts-social-follow-links" role="navigation" aria-label="ToolScout social profiles">${links}</div></div><style>
[data-toolscout-social-footer="2"]{margin-top:30px!important;padding-top:22px!important;border-top:1px solid #DDE2DC!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
[data-toolscout-social-footer="2"] .ts-social-follow-inner{display:grid!important;grid-template-columns:minmax(170px,210px) minmax(0,1fr)!important;align-items:start!important;gap:22px 36px!important}
[data-toolscout-social-footer="2"] .ts-social-follow-copy{display:flex!important;flex-direction:column!important;gap:6px!important}
[data-toolscout-social-footer="2"] .ts-social-kicker{font-size:10px!important;line-height:1.2!important;letter-spacing:.11em!important;text-transform:uppercase!important;font-weight:850!important;color:#555D55!important}
[data-toolscout-social-footer="2"] .ts-social-note{max-width:190px!important;font-size:11px!important;line-height:1.45!important;color:#858C85!important}
[data-toolscout-social-footer="2"] .ts-social-follow-links{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;column-gap:24px!important;row-gap:0!important;width:100%!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
[data-toolscout-social-footer="2"] .ts-social-follow-links a{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-width:0!important;margin:0!important;padding:11px 2px 10px!important;border:0!important;border-bottom:1px solid #DDE2DC!important;border-radius:0!important;background:transparent!important;color:#303630!important;text-decoration:none!important;font-size:12px!important;line-height:1.2!important;font-weight:720!important;letter-spacing:0!important;white-space:nowrap!important;transition:color 140ms cubic-bezier(.2,.7,.2,1),padding-left 140ms cubic-bezier(.2,.7,.2,1),border-color 140ms cubic-bezier(.2,.7,.2,1)!important}
[data-toolscout-social-footer="2"] .ts-social-follow-links a:hover{padding-left:6px!important;color:#0B0D0C!important;border-bottom-color:#AEB7AD!important;text-decoration:none!important}
[data-toolscout-social-footer="2"] .ts-social-arrow{flex:0 0 auto!important;font-size:11px!important;line-height:1!important;color:#7E867E!important;transition:color 140ms cubic-bezier(.2,.7,.2,1),transform 140ms cubic-bezier(.2,.7,.2,1)!important}
[data-toolscout-social-footer="2"] .ts-social-follow-links a:hover .ts-social-arrow{color:#78A823!important;transform:translate(1px,-1px)!important}
@media(max-width:700px){
  [data-toolscout-social-footer="2"]{margin-top:26px!important;padding-top:20px!important}
  [data-toolscout-social-footer="2"] .ts-social-follow-inner{grid-template-columns:1fr!important;gap:14px!important}
  [data-toolscout-social-footer="2"] .ts-social-note{max-width:none!important}
  [data-toolscout-social-footer="2"] .ts-social-follow-links{grid-template-columns:repeat(2,minmax(0,1fr))!important;column-gap:18px!important}
  [data-toolscout-social-footer="2"] .ts-social-follow-links a{min-height:42px!important;padding:12px 2px 11px!important;font-size:12px!important}
}
@media(max-width:380px){
  [data-toolscout-social-footer="2"] .ts-social-follow-links{grid-template-columns:1fr!important}
}
</style></div>`;
}

function injectSocialFooter(html){
  const block=socialFooterHtml();
  const trust=/(<section\b[^>]*class=["'][^"']*\btrust\b[^"']*["'][^>]*>[\s\S]*?)(<\/section>)/i;
  if(trust.test(html))return html.replace(trust,(match,body,close)=>body+block+close);
  const footerClose=String(html||'').toLowerCase().lastIndexOf('</footer>');
  if(footerClose>=0)return html.slice(0,footerClose)+block+html.slice(footerClose);
  const shell=`<footer class="ts-social-footer-shell" style="max-width:1180px;margin:0 auto;padding:0 24px 30px">${block}</footer>`;
  return html.includes('</body>')?html.replace('</body>',shell+'</body>'):html+shell;
}

export async function injectToolScoutSocialFooter(response){
  if(!response?.ok)return response;
  const type=String(response.headers.get('Content-Type')||'').toLowerCase();
  if(type.includes('json')||type.includes('xml')||type.startsWith('image/')||type.startsWith('video/')||type.startsWith('audio/')||type.includes('pdf'))return response;
  let html;try{html=await response.clone().text()}catch{return response}
  if(!/^\s*(?:<!doctype html|<html)/i.test(html))return response;
  if(html.includes('data-toolscout-social-footer="2"'))return response;
  html=injectSocialFooter(html);
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  headers.set('Content-Type','text/html; charset=UTF-8');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

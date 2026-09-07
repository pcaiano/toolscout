import base from './distribution-command-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=300'};
const JS_H={'Content-Type':'application/javascript; charset=UTF-8','Cache-Control':'public, max-age=3600'};
const SVG_H={'Content-Type':'image/svg+xml; charset=UTF-8','Cache-Control':'public, max-age=86400'};
const XML_H={'Content-Type':'application/rss+xml; charset=UTF-8','Cache-Control':'public, max-age=900'};
const safe=(v,n=500)=>String(v??'').slice(0,n);
const escXml=v=>String(v??'').replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'}[c]));
function hostOf(v){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function toolscoutTarget(sourceHost,placement='widget'){
  const u=new URL('https://trytoolscout.org/');
  u.searchParams.set('utm_source',sourceHost||'embedded');
  u.searchParams.set('utm_medium','distribution');
  u.searchParams.set('utm_campaign','embedded_distribution');
  u.searchParams.set('utm_content',placement);
  return u.toString();
}
async function recentAssets(env,limit=20){
  try{const r=await env.DB.prepare(`SELECT asset_url,asset_type,last_seen_at FROM distribution_asset_state WHERE asset_url IS NOT NULL ORDER BY last_seen_at DESC LIMIT ?`).bind(limit).all();return (r.results||[]).filter(x=>/^https:\/\/trytoolscout\.org\//.test(String(x.asset_url||'')));}catch{return[]}
}
function widgetScript(){return `(function(){
var d=document,s=d.currentScript,host='';try{host=(new URL(d.referrer||location.href)).hostname.replace(/^www\\./,'')}catch(e){}
function target(p){var u=new URL('https://trytoolscout.org/');u.searchParams.set('utm_source',host||'embedded');u.searchParams.set('utm_medium','distribution');u.searchParams.set('utm_campaign','embedded_distribution');u.searchParams.set('utm_content',p||'widget');return u.toString()}
function mount(el){var mode=el.getAttribute('data-toolscout-embed')||'card',label=el.getAttribute('data-toolscout-label')||'Find the right tool. Faster.',a=d.createElement('a');a.href=target(mode);a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;a.setAttribute('aria-label','Open ToolScout');a.style.cssText='display:inline-flex;align-items:center;gap:8px;font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-decoration:none;color:#111;border:1px solid #d9d9d9;border-radius:12px;padding:10px 14px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)';var dot=d.createElement('span');dot.style.cssText='width:10px;height:10px;border:2px solid currentColor;border-radius:50%;display:inline-block;box-sizing:border-box';a.prepend(dot);el.replaceChildren(a)}
function run(){d.querySelectorAll('[data-toolscout-embed]').forEach(mount)}if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',run);else run();
})();`}
function badgeSvg(){return `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="36" viewBox="0 0 190 36" role="img" aria-label="Powered by ToolScout"><rect x=".5" y=".5" width="189" height="35" rx="10" fill="white" stroke="#d8d8d8"/><circle cx="20" cy="18" r="7" fill="none" stroke="#111" stroke-width="2"/><circle cx="20" cy="18" r="2" fill="#111"/><text x="35" y="22" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="600" fill="#111">Powered by ToolScout</text></svg>`}
async function logEmbedClick(request,env){
  const u=new URL(request.url),placement=safe(u.searchParams.get('placement')||'widget',80),embedType=safe(u.searchParams.get('type')||'widget',80),ref=request.headers.get('Referer')||'',source=hostOf(ref)||safe(u.searchParams.get('source')||'embedded',120),target=toolscoutTarget(source,placement);
  try{await env.DB.prepare(`INSERT INTO distribution_embed_clicks(click_id,embed_type,source_host,placement,target_url,referrer,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(`emb_${crypto.randomUUID()}`,embedType,source,placement,target,safe(ref,800)).run();}catch{}
  return Response.redirect(target,302);
}
async function feedJson(env){const items=await recentAssets(env,30);return Response.json({name:'ToolScout Distribution Feed',home:'https://trytoolscout.org',updated_at:new Date().toISOString(),items:items.map(x=>({url:x.asset_url,type:x.asset_type,last_seen_at:x.last_seen_at}))},{headers:JSON_H});}
async function feedRss(env){const items=await recentAssets(env,30);const xml=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ToolScout Distribution Feed</title><link>https://trytoolscout.org/</link><description>Recent ToolScout decision assets for syndication and discovery.</description>${items.map(x=>`<item><title>${escXml(x.asset_type||'ToolScout decision asset')}</title><link>${escXml(x.asset_url)}</link><guid>${escXml(x.asset_url)}</guid><pubDate>${new Date((x.last_seen_at||'').replace(' ','T')+'Z').toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;return new Response(xml,{headers:XML_H});}
async function manifest(env){const items=await recentAssets(env,12);return Response.json({name:'ToolScout',canonical_url:'https://trytoolscout.org',distribution:{widget_script:'https://trytoolscout.org/embed/toolscout.js',badge_svg:'https://trytoolscout.org/embed/badge.svg',json_feed:'https://trytoolscout.org/api/distribution/feed.json',rss_feed:'https://trytoolscout.org/distribution/feed.xml'},embed:{html:`<div data-toolscout-embed="card"></div><script async src="https://trytoolscout.org/embed/toolscout.js"></script>`,badge:`<a href="https://trytoolscout.org/go/embed?type=badge&placement=badge"><img src="https://trytoolscout.org/embed/badge.svg" alt="Powered by ToolScout"></a>`},recent_assets:items.map(x=>x.asset_url)},{headers:JSON_H});}
export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/embed/toolscout.js'&&request.method==='GET')return new Response(widgetScript(),{headers:JS_H});
    if(u.pathname==='/embed/badge.svg'&&request.method==='GET')return new Response(badgeSvg(),{headers:SVG_H});
    if(u.pathname==='/api/distribution/feed.json'&&request.method==='GET')return feedJson(env);
    if(u.pathname==='/distribution/feed.xml'&&request.method==='GET')return feedRss(env);
    if(u.pathname==='/.well-known/toolscout-distribution.json'&&request.method==='GET')return manifest(env);
    if(u.pathname==='/go/embed'&&request.method==='GET')return logEmbedClick(request,env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};

const COOKIE_NAME='ts_analytics_consent';
const GA_MEASUREMENT_ID='G-9VR80SYYH7';

function cookieChoice(request){
  const raw=String(request.headers.get('Cookie')||'');
  const match=raw.match(new RegExp('(?:^|;\\s*)'+COOKIE_NAME+'=(granted|denied)(?:;|$)'));
  return match?match[1]:'';
}

function safeReturnPath(value){
  const path=String(value||'/');
  return path.startsWith('/')&&!path.startsWith('//')?path:'/';
}

export function analyticsConsentResponse(request){
  const url=new URL(request.url);
  const choice=String(url.searchParams.get('choice')||'').toLowerCase();
  const returnPath=safeReturnPath(url.searchParams.get('return'));
  const headers=new Headers({Location:new URL(returnPath,url.origin).toString(),'Cache-Control':'no-store'});
  if(choice==='granted'||choice==='denied'){
    headers.append('Set-Cookie',`${COOKIE_NAME}=${choice}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  }else if(choice==='reset'){
    headers.append('Set-Cookie',`${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Secure`);
  }
  return new Response(null,{status:303,headers});
}

function googleTag(){
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');(function(){var mirrored={session_started:true,recommendation_started:true,recommendation_completed:true,recommendation_result_viewed:true};var originalFetch=window.fetch;if(typeof originalFetch==='function'){window.fetch=function(input,init){try{var rawUrl=typeof input==='string'?input:(input&&input.url)||'';var url=new URL(rawUrl,location.href);if(url.origin===location.origin&&url.pathname==='/api/events'&&init&&typeof init.body==='string'){var payload=JSON.parse(init.body);if(payload&&mirrored[payload.event_type]){var params={};if(payload.intent_slug)params.intent_slug=String(payload.intent_slug).slice(0,100);if(payload.source)params.acquisition_source=String(payload.source).slice(0,100);if(payload.path)params.toolscout_path=String(payload.path).slice(0,200);gtag('event',payload.event_type,params);}}}catch(e){}return originalFetch.apply(this,arguments);};}document.addEventListener('click',function(event){try{var anchor=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!anchor)return;var url=new URL(anchor.href,location.href);if(url.origin!==location.origin||url.pathname.indexOf('/go/')!==0)return;var slug=url.pathname.slice(4).split('/')[0]||'unknown';gtag('event','vendor_outbound',{vendor_slug:slug,link_url:url.href,transport_type:'beacon'});}catch(e){}},true);})();</script>`;
}

function consentBanner(pathname){
  const back=encodeURIComponent(pathname||'/');
  return `<div id="ts-analytics-consent" role="dialog" aria-label="Analytics choice" style="position:fixed;z-index:2147483646;left:18px;right:18px;bottom:18px;max-width:760px;margin:auto;padding:18px 20px;background:#101828;color:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(16,24,40,.28);font:14px/1.5 Inter,system-ui,sans-serif"><div style="font-weight:750;margin-bottom:6px">Help improve ToolScout</div><div style="color:#d0d5dd">ToolScout uses Google Analytics only with your permission to understand site usage and improve recommendations. <a href="/privacy" style="color:#fff;text-decoration:underline">Learn more</a>.</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><a href="/analytics-consent?choice=granted&return=${back}" style="display:inline-block;border-radius:9px;padding:9px 13px;background:#fff;color:#101828;text-decoration:none;font-weight:750">Accept analytics</a><a href="/analytics-consent?choice=denied&return=${back}" style="display:inline-block;border:1px solid #667085;border-radius:9px;padding:9px 13px;background:transparent;color:#fff;text-decoration:none;font-weight:650">Decline</a></div></div>`;
}

export function decoratePublicAnalytics(request,html){
  let value=String(html||'');
  if(!value||!/<\/head>/i.test(value))return value;
  const choice=cookieChoice(request);
  if(choice==='granted'&&!value.includes('googletagmanager.com/gtag/js'))value=value.replace(/<\/head>/i,`${googleTag()}</head>`);
  if(!choice&&!value.includes('id="ts-analytics-consent"'))value=value.replace(/<\/body>/i,`${consentBanner(new URL(request.url).pathname)}</body>`);
  return value;
}

export { GA_MEASUREMENT_ID };

const COOKIE_NAME='ts_analytics_consent';
const OWNER_COOKIE='toolscout_owner';
const GA_MEASUREMENT_ID='G-9VR80SYYH7';
const POSTHOG_PROJECT_TOKEN='phc_nfdxJMD4XSLvFVVQmGDTBoyCb88dBWB9R8AMwvReDCBp';
const POSTHOG_API_HOST='https://eu.i.posthog.com';

function cookieChoice(request){
  const raw=String(request.headers.get('Cookie')||'');
  const match=raw.match(new RegExp('(?:^|;\\s*)'+COOKIE_NAME+'=(granted|denied)(?:;|$)'));
  return match?match[1]:'';
}

function ownerAnalytics(request){
  const raw=String(request.headers.get('Cookie')||'');
  return new RegExp('(?:^|;\\s*)'+OWNER_COOKIE+'=1(?:;|$)').test(raw);
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

function analyticsTags(owner=false){
  const gaConfig=owner
    ? `gtag('config','${GA_MEASUREMENT_ID}',{campaign_source:'toolscout_owner',campaign_medium:'internal',campaign_name:'owner_exclusion_v1'});`
    : `gtag('config','${GA_MEASUREMENT_ID}');`;
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gaConfig}!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],u.toString=function(t){var e='posthog';return'posthog'!==a&&(e+='.'+a),t||(e+=' (stub)'),e},u.people.toString=function(){return u.toString(1)+'.people (stub)'},o='init capture register register_once register_for_session unregister unregister_for_session identify reset get_distinct_id get_session_id captureException opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing set_config'.split(' '),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${POSTHOG_PROJECT_TOKEN}',{api_host:'${POSTHOG_API_HOST}',defaults:'2026-05-30',autocapture:false,capture_pageview:true,capture_pageleave:true,capture_dead_clicks:false,capture_heatmaps:false,capture_exceptions:true,capture_performance:true,disable_session_recording:true,disable_surveys:true,person_profiles:'identified_only',cross_subdomain_cookie:false});(function(){var mirrored={session_started:true,recommendation_started:true,recommendation_completed:true,recommendation_result_viewed:true};function send(name,params){try{gtag('event',name,params||{});}catch(e){}try{if(window.posthog&&typeof window.posthog.capture==='function')window.posthog.capture(name,params||{});}catch(e){}}var originalFetch=window.fetch;if(typeof originalFetch==='function'){window.fetch=function(input,init){try{var rawUrl=typeof input==='string'?input:(input&&input.url)||'';var url=new URL(rawUrl,location.href);if(url.origin===location.origin&&url.pathname==='/api/events'&&init&&typeof init.body==='string'){var payload=JSON.parse(init.body);if(payload&&mirrored[payload.event_type]){var params={};if(payload.intent_slug)params.intent_slug=String(payload.intent_slug).slice(0,100);if(payload.source)params.acquisition_source=String(payload.source).slice(0,100);if(payload.path)params.toolscout_path=String(payload.path).slice(0,200);send(payload.event_type,params);}}}catch(e){}return originalFetch.apply(this,arguments);};}document.addEventListener('click',function(event){try{var anchor=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!anchor)return;var url=new URL(anchor.href,location.href);if(url.origin!==location.origin||url.pathname.indexOf('/go/')!==0)return;var slug=url.pathname.slice(4).split('/')[0]||'unknown';send('vendor_outbound',{vendor_slug:slug,link_url:url.href});}catch(e){}},true);})();</script>`;
}

function consentBanner(pathname){
  const back=encodeURIComponent(pathname||'/');
  return `<div id="ts-analytics-consent" role="dialog" aria-label="Analytics choice" style="position:fixed;z-index:2147483646;left:18px;right:18px;bottom:18px;max-width:760px;margin:auto;padding:18px 20px;background:#101828;color:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(16,24,40,.28);font:14px/1.5 Inter,system-ui,sans-serif"><div style="font-weight:750;margin-bottom:6px">Help improve ToolScout</div><div style="color:#d0d5dd">ToolScout uses Google Analytics and PostHog only with your permission to understand site usage, improve recommendations and detect technical issues. <a href="/privacy" style="color:#fff;text-decoration:underline">Learn more</a>.</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><a href="/analytics-consent?choice=granted&return=${back}" style="display:inline-block;border-radius:9px;padding:9px 13px;background:#fff;color:#101828;text-decoration:none;font-weight:750">Accept analytics</a><a href="/analytics-consent?choice=denied&return=${back}" style="display:inline-block;border:1px solid #667085;border-radius:9px;padding:9px 13px;background:transparent;color:#fff;text-decoration:none;font-weight:650">Decline</a></div></div>`;
}

export function decoratePublicAnalytics(request,html){
  let value=String(html||'');
  if(!value||!/<\/head>/i.test(value))return value;
  const choice=cookieChoice(request);
  if(choice==='granted'&&!value.includes('googletagmanager.com/gtag/js'))value=value.replace(/<\/head>/i,`${analyticsTags(ownerAnalytics(request))}</head>`);
  if(!choice&&!value.includes('id="ts-analytics-consent"'))value=value.replace(/<\/body>/i,`${consentBanner(new URL(request.url).pathname)}</body>`);
  return value;
}

export { GA_MEASUREMENT_ID, POSTHOG_API_HOST };

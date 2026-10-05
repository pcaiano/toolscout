const PRIVATE_PREFIXES=['/analytics','/command-center','/admin','/api/','/oauth','/go/'];
const HOME_PATHS=new Set(['/','/index.html']);

function isHtml(response){
  return response&&response.ok&&String(response.headers.get('content-type')||'').toLowerCase().includes('text/html');
}
function isPublicVisualPath(pathname){
  if(HOME_PATHS.has(pathname))return false;
  return !PRIVATE_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix));
}
function styleTag(){
  return `<style data-toolscout-public-redesign="2">
:root{--ts-g:#0B0D0C;--ts-c:#141715;--ts-o:#F3F5F1;--ts-soft:#F8F9F6;--ts-m:#90978F;--ts-line:#DDE2DC;--ts-l:#B7FF3C;--ts-fast:140ms;--ts-base:180ms;--ts-ease:cubic-bezier(.2,.7,.2,1);--ts-out:cubic-bezier(.16,1,.3,1)}
html{background:var(--ts-o)}
html[data-toolscout-redesign="2"] body{margin:0!important;background:var(--ts-o)!important;color:var(--ts-g)!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
html[data-toolscout-redesign="2"] body *{box-sizing:border-box}
.ts2-global-nav{background:var(--ts-o);border-bottom:1px solid var(--ts-line)}
.ts2-global-nav-inner{height:76px;max-width:1180px;margin:auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.ts2-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ts-g);font-size:21px;font-weight:850;letter-spacing:-.045em}.ts2-brand img{width:24px;height:24px;border-radius:5px}
.ts2-actions{display:flex;align-items:center;gap:24px}.ts2-links{display:flex;align-items:center;gap:26px}.ts2-links a{color:#5F665F;text-decoration:none;font-size:13px;font-weight:650;transition:color var(--ts-fast) var(--ts-ease)}.ts2-links a:hover{color:var(--ts-g)}
.ts2-cta{background:var(--ts-g);color:var(--ts-l);padding:11px 14px;border-radius:7px;font-weight:800;text-decoration:none;white-space:nowrap}
.ts2-global-nav + .wrap > nav:first-child,.ts2-global-nav + .wrap > .brand:first-child{display:none!important}
html[data-toolscout-redesign="2"] body>.wrap,html[data-toolscout-redesign="2"] body .wrap{max-width:1180px!important;margin:auto!important;padding-left:24px!important;padding-right:24px!important}
html[data-toolscout-redesign="2"] body main,html[data-toolscout-redesign="2"] body .hero{animation:ts2Enter var(--ts-base) var(--ts-out) both}
@keyframes ts2Enter{from{opacity:.35;transform:translateY(7px)}to{opacity:1;transform:none}}
html[data-toolscout-redesign="2"] body .eyebrow,html[data-toolscout-redesign="2"] body .kicker,html[data-toolscout-redesign="2"] body .meta{font-size:10px!important;letter-spacing:.1em!important;text-transform:uppercase!important;font-weight:850!important;color:#737A73!important}
html[data-toolscout-redesign="2"] body h1{font-size:clamp(48px,7vw,78px)!important;line-height:.96!important;letter-spacing:-.06em!important;color:var(--ts-g)!important}
html[data-toolscout-redesign="2"] body h2{letter-spacing:-.045em!important;color:var(--ts-g)!important}
html[data-toolscout-redesign="2"] body .lead,html[data-toolscout-redesign="2"] body .hero p,html[data-toolscout-redesign="2"] body .sub{color:#626962!important;line-height:1.65!important}
html[data-toolscout-redesign="2"] body .hero{padding-top:64px!important;padding-bottom:44px!important}
html[data-toolscout-redesign="2"] body .section{border-top-color:var(--ts-line)!important}
html[data-toolscout-redesign="2"] body .card,html[data-toolscout-redesign="2"] body .panel,html[data-toolscout-redesign="2"] body details,html[data-toolscout-redesign="2"] body .tool,html[data-toolscout-redesign="2"] body .relatedCard,html[data-toolscout-redesign="2"] body .related-card,html[data-toolscout-redesign="2"] body .editorialIntro,html[data-toolscout-redesign="2"] body .links a{background:#fff!important;border-color:var(--ts-line)!important;border-radius:9px!important;box-shadow:none!important}
html[data-toolscout-redesign="2"] body .card,html[data-toolscout-redesign="2"] body .tool,html[data-toolscout-redesign="2"] body .relatedCard,html[data-toolscout-redesign="2"] body .related-card{transition:transform var(--ts-fast) var(--ts-ease),border-color var(--ts-fast) var(--ts-ease)!important}
html[data-toolscout-redesign="2"] body .card:hover,html[data-toolscout-redesign="2"] body .tool:hover,html[data-toolscout-redesign="2"] body .relatedCard:hover,html[data-toolscout-redesign="2"] body .related-card:hover{transform:translateY(-1px);border-color:#BCC4BB!important}
html[data-toolscout-redesign="2"] body .cta,html[data-toolscout-redesign="2"] body .btn,html[data-toolscout-redesign="2"] body .compareBtn,html[data-toolscout-redesign="2"] body .card>a[href*="/go/"],html[data-toolscout-redesign="2"] body .tool-link{border-radius:7px!important;box-shadow:none!important;transition:transform var(--ts-fast) var(--ts-ease),background var(--ts-fast) var(--ts-ease)!important}
html[data-toolscout-redesign="2"] body .cta,html[data-toolscout-redesign="2"] body .btn,html[data-toolscout-redesign="2"] body .compareBtn,html[data-toolscout-redesign="2"] body .card>a[href*="/go/"]{background:var(--ts-g)!important;color:#fff!important;border-color:var(--ts-g)!important}
html[data-toolscout-redesign="2"] body .cta:hover,html[data-toolscout-redesign="2"] body .btn:hover,html[data-toolscout-redesign="2"] body .compareBtn:hover{transform:translateY(-1px)}
html[data-toolscout-redesign="2"] body .secondaryCta,html[data-toolscout-redesign="2"] body .btn.secondary{background:transparent!important;color:var(--ts-g)!important;border:1px solid var(--ts-line)!important}
html[data-toolscout-redesign="2"] body .toolLogo,html[data-toolscout-redesign="2"] body .logoFallback,html[data-toolscout-redesign="2"] body .tool-logo,html[data-toolscout-redesign="2"] body .miniFallback{border-radius:10px!important;border-color:var(--ts-line)!important;box-shadow:none!important;background:#fff!important}
html[data-toolscout-redesign="2"] body .chips span,html[data-toolscout-redesign="2"] body .features span,html[data-toolscout-redesign="2"] body .chip{border-radius:6px!important;background:var(--ts-soft)!important;border:1px solid var(--ts-line)!important;color:#555D55!important}
html[data-toolscout-redesign="2"] body .aiProof,html[data-toolscout-redesign="2"] body .aiFacts span,html[data-toolscout-redesign="2"] body [data-ai-comparison="1"]{border-radius:9px!important;box-shadow:none!important}
html[data-toolscout-redesign="2"] body table{border-collapse:collapse!important;width:100%}html[data-toolscout-redesign="2"] body th,html[data-toolscout-redesign="2"] body td{border-color:var(--ts-line)!important}
html[data-toolscout-redesign="2"] body details summary{cursor:pointer}
html[data-toolscout-redesign="2"] body footer,html[data-toolscout-redesign="2"] body .disclosure{color:#737A73!important}
@media(max-width:720px){
  .ts2-global-nav-inner{height:auto;min-height:68px;padding:12px 18px 10px;flex-wrap:wrap;row-gap:10px}.ts2-actions{display:contents}.ts2-cta{order:2;margin-left:auto;padding:9px 11px}.ts2-links{order:3;width:100%;gap:18px;overflow-x:auto;overscroll-behavior-inline:contain;padding:1px 0 3px;scrollbar-width:none}.ts2-links::-webkit-scrollbar{display:none}.ts2-links a{display:inline-flex!important;white-space:nowrap;font-size:12px}
  html[data-toolscout-redesign="2"] body>.wrap,html[data-toolscout-redesign="2"] body .wrap{padding-left:18px!important;padding-right:18px!important}
  html[data-toolscout-redesign="2"] body h1{font-size:48px!important}
  html[data-toolscout-redesign="2"] body .hero{padding-top:46px!important}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>`;
}
function navHtml(){
  return `<header class="ts2-global-nav"><div class="ts2-global-nav-inner"><a class="ts2-brand" href="/" aria-label="ToolScout home"><img src="/favicon.svg" alt="" width="24" height="24">ToolScout</a><div class="ts2-actions"><nav class="ts2-links" aria-label="Primary"><a href="/tools.html">Tools</a><a href="/guides.html">Guides</a><a href="/compare.html">Compare</a><a href="/whats-new.html">What's new</a></nav><a class="ts2-cta" href="/#finder">Find my tools →</a></div></div></header>`;
}
export async function transformPublicRedesignResponse(request,response){
  if(request.method!=='GET'||!isHtml(response))return response;
  const url=new URL(request.url);
  if(!isPublicVisualPath(url.pathname))return response;
  let html=await response.text();
  if(!/<body\b/i.test(html))return response;
  if(!html.includes('data-toolscout-public-redesign="2"'))html=html.replace('</head>',styleTag()+'</head>');
  if(!/<html\b[^>]*data-toolscout-redesign=["']2["']/i.test(html))html=html.replace(/<html\b([^>]*)>/i,(match,attrs)=>'<html'+attrs+' data-toolscout-redesign="2">');
  if(!html.includes('class="ts2-global-nav"'))html=html.replace(/<body\b[^>]*>/i,m=>m+navHtml());
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Vary',headers.get('Vary')||'Accept-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

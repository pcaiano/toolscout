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
body[data-toolscout-redesign="2"]{margin:0!important;background:var(--ts-o)!important;color:var(--ts-g)!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
body[data-toolscout-redesign="2"] *{box-sizing:border-box}
.ts2-global-nav{background:var(--ts-o);border-bottom:1px solid var(--ts-line)}
.ts2-global-nav-inner{height:76px;max-width:1180px;margin:auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.ts2-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ts-g);font-size:21px;font-weight:850;letter-spacing:-.045em}.ts2-brand img{width:24px;height:24px;border-radius:5px}
.ts2-links{display:flex;align-items:center;gap:26px}.ts2-links a{color:#5F665F;text-decoration:none;font-size:13px;font-weight:650;transition:color var(--ts-fast) var(--ts-ease)}.ts2-links a:hover{color:var(--ts-g)}
.ts2-links .ts2-cta{background:var(--ts-g);color:var(--ts-l);padding:11px 14px;border-radius:7px;font-weight:800}
.ts2-global-nav + .wrap > nav:first-child,.ts2-global-nav + .wrap > .brand:first-child{display:none!important}
body[data-toolscout-redesign="2"]>.wrap,body[data-toolscout-redesign="2"] .wrap{max-width:1180px!important;margin:auto!important;padding-left:24px!important;padding-right:24px!important}
body[data-toolscout-redesign="2"] main,body[data-toolscout-redesign="2"] .hero{animation:ts2Enter var(--ts-base) var(--ts-out) both}
@keyframes ts2Enter{from{opacity:.35;transform:translateY(7px)}to{opacity:1;transform:none}}
body[data-toolscout-redesign="2"] .eyebrow,body[data-toolscout-redesign="2"] .kicker,body[data-toolscout-redesign="2"] .meta{font-size:10px!important;letter-spacing:.1em!important;text-transform:uppercase!important;font-weight:850!important;color:#737A73!important}
body[data-toolscout-redesign="2"] h1{font-size:clamp(48px,7vw,78px)!important;line-height:.96!important;letter-spacing:-.06em!important;color:var(--ts-g)!important}
body[data-toolscout-redesign="2"] h2{letter-spacing:-.045em!important;color:var(--ts-g)!important}
body[data-toolscout-redesign="2"] .lead,body[data-toolscout-redesign="2"] .hero p,body[data-toolscout-redesign="2"] .sub{color:#626962!important;line-height:1.65!important}
body[data-toolscout-redesign="2"] .hero{padding-top:64px!important;padding-bottom:44px!important}
body[data-toolscout-redesign="2"] .section{border-top-color:var(--ts-line)!important}
body[data-toolscout-redesign="2"] .card,body[data-toolscout-redesign="2"] .panel,body[data-toolscout-redesign="2"] details,body[data-toolscout-redesign="2"] .tool,body[data-toolscout-redesign="2"] .relatedCard,body[data-toolscout-redesign="2"] .related-card,body[data-toolscout-redesign="2"] .editorialIntro,body[data-toolscout-redesign="2"] .links a{background:#fff!important;border-color:var(--ts-line)!important;border-radius:9px!important;box-shadow:none!important}
body[data-toolscout-redesign="2"] .card,body[data-toolscout-redesign="2"] .tool,body[data-toolscout-redesign="2"] .relatedCard,body[data-toolscout-redesign="2"] .related-card{transition:transform var(--ts-fast) var(--ts-ease),border-color var(--ts-fast) var(--ts-ease)!important}
body[data-toolscout-redesign="2"] .card:hover,body[data-toolscout-redesign="2"] .tool:hover,body[data-toolscout-redesign="2"] .relatedCard:hover,body[data-toolscout-redesign="2"] .related-card:hover{transform:translateY(-1px);border-color:#BCC4BB!important}
body[data-toolscout-redesign="2"] .cta,body[data-toolscout-redesign="2"] .btn,body[data-toolscout-redesign="2"] .compareBtn,body[data-toolscout-redesign="2"] .card>a[href*="/go/"],body[data-toolscout-redesign="2"] .tool-link{border-radius:7px!important;box-shadow:none!important;transition:transform var(--ts-fast) var(--ts-ease),background var(--ts-fast) var(--ts-ease)!important}
body[data-toolscout-redesign="2"] .cta,body[data-toolscout-redesign="2"] .btn,body[data-toolscout-redesign="2"] .compareBtn,body[data-toolscout-redesign="2"] .card>a[href*="/go/"]{background:var(--ts-g)!important;color:#fff!important;border-color:var(--ts-g)!important}
body[data-toolscout-redesign="2"] .cta:hover,body[data-toolscout-redesign="2"] .btn:hover,body[data-toolscout-redesign="2"] .compareBtn:hover{transform:translateY(-1px)}
body[data-toolscout-redesign="2"] .secondaryCta,body[data-toolscout-redesign="2"] .btn.secondary{background:transparent!important;color:var(--ts-g)!important;border:1px solid var(--ts-line)!important}
body[data-toolscout-redesign="2"] .toolLogo,body[data-toolscout-redesign="2"] .logoFallback,body[data-toolscout-redesign="2"] .tool-logo,body[data-toolscout-redesign="2"] .miniFallback{border-radius:10px!important;border-color:var(--ts-line)!important;box-shadow:none!important;background:#fff!important}
body[data-toolscout-redesign="2"] .chips span,body[data-toolscout-redesign="2"] .features span,body[data-toolscout-redesign="2"] .chip{border-radius:6px!important;background:var(--ts-soft)!important;border:1px solid var(--ts-line)!important;color:#555D55!important}
body[data-toolscout-redesign="2"] .aiProof,body[data-toolscout-redesign="2"] .aiFacts span,body[data-toolscout-redesign="2"] [data-ai-comparison="1"]{border-radius:9px!important;box-shadow:none!important}
body[data-toolscout-redesign="2"] table{border-collapse:collapse!important;width:100%}body[data-toolscout-redesign="2"] th,body[data-toolscout-redesign="2"] td{border-color:var(--ts-line)!important}
body[data-toolscout-redesign="2"] details summary{cursor:pointer}
body[data-toolscout-redesign="2"] footer,body[data-toolscout-redesign="2"] .disclosure{color:#737A73!important}
@media(max-width:720px){
  .ts2-global-nav-inner{height:68px;padding:0 18px}.ts2-links{gap:12px}.ts2-links a:not(.ts2-cta):not([href="/tools.html"]){display:none}.ts2-links .ts2-cta{padding:9px 11px}
  body[data-toolscout-redesign="2"]>.wrap,body[data-toolscout-redesign="2"] .wrap{padding-left:18px!important;padding-right:18px!important}
  body[data-toolscout-redesign="2"] h1{font-size:48px!important}
  body[data-toolscout-redesign="2"] .hero{padding-top:46px!important}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>`;
}
function navHtml(){
  return `<header class="ts2-global-nav"><div class="ts2-global-nav-inner"><a class="ts2-brand" href="/" aria-label="ToolScout home"><img src="/favicon.svg" alt="" width="24" height="24">ToolScout</a><nav class="ts2-links" aria-label="Primary"><a href="/compare.html">Compare</a><a href="/guides.html">Best picks</a><a href="/whats-new.html">What's new</a><a href="/tools.html">Tools</a><a class="ts2-cta" href="/#finder">Find my tools →</a></nav></div></header>`;
}
export async function transformPublicRedesignResponse(request,response){
  if(request.method!=='GET'||!isHtml(response))return response;
  const url=new URL(request.url);
  if(!isPublicVisualPath(url.pathname))return response;
  let html=await response.text();
  if(!/<body\b/i.test(html))return response;
  if(!html.includes('data-toolscout-public-redesign="2"'))html=html.replace('</head>',styleTag()+'</head>');
  if(!/data-toolscout-redesign=["']2["']/i.test(html))html=html.replace(/<body\b/i,'<body data-toolscout-redesign="2"');
  if(!html.includes('class="ts2-global-nav"'))html=html.replace(/<body\b[^>]*>/i,m=>m+navHtml());
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Vary',headers.get('Vary')||'Accept-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

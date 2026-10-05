const PRIVATE_PREFIXES=['/analytics','/command-center','/admin','/api/','/oauth','/go/'];
const HOME_PATHS=new Set(['/','/index.html']);

function isHtml(response){
  return response&&response.ok&&String(response.headers.get('content-type')||'').toLowerCase().includes('text/html');
}
function isPublicVisualPath(pathname){
  if(HOME_PATHS.has(pathname))return false;
  return !PRIVATE_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix));
}
function isCommercialDecisionPath(pathname){
  const p=String(pathname||'').replace(/\.html\/?$/i,'').replace(/\/$/,'');
  return /^\/tools\/[a-z0-9][a-z0-9-]*$/i.test(p)||/^\/best-[a-z0-9-]+$/i.test(p)||/^\/[a-z0-9-]+-vs-[a-z0-9-]+$/i.test(p);
}
function publicSurface(pathname){
  const p=String(pathname||'').replace(/\.html\/?$/i,'').replace(/\/$/,'')||'/';
  if(p==='/tools')return'tools';
  if(p==='/guides')return'guides';
  if(p==='/compare')return'compare';
  if(p==='/whats-new')return'whats-new';
  return'public';
}
function stripCommercialVendorSourceLinks(html){
  let out=String(html||'');
  out=out.replace(/<section\b[^>]*data-toolscout-editorial-evidence=["']1["'][^>]*>[\s\S]*?<\/section>/gi,'');
  out=out.replace(/<p\b[^>]*class=["'][^"']*source-note[^"']*["'][^>]*>[\s\S]*?<\/p>/gi,'');
  out=out.replace(/\s*(?:·\s*)?<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>\s*Official(?:\s+product)?\s+source\s*<\/a>/gi,'');
  out=out.replace(/\s*(?:·\s*)?<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>\s*[^<]{0,120}\s+official(?:\s+product)?\s+source\s*<\/a>/gi,'');
  out=out.replace(/<strong>\s*Editorial evidence:\s*<\/strong>\s*/gi,'');
  out=out.replace(/<strong>\s*Primary sources:\s*<\/strong>\s*/gi,'');
  out=out.replace(/>\s*[.·]\s*Source data last checked\s*/gi,'>Information last checked ');
  out=out.replace(/\bSource data last checked\b/gi,'Information last checked');
  return out;
}
function styleTag(){
  return `<style data-toolscout-public-redesign="2">
:root{--ts-g:#0B0D0C;--ts-c:#141715;--ts-o:#F3F5F1;--ts-soft:#F8F9F6;--ts-m:#90978F;--ts-line:#DDE2DC;--ts-l:#B7FF3C;--ts-fast:140ms;--ts-base:180ms;--ts-ease:cubic-bezier(.2,.7,.2,1);--ts-out:cubic-bezier(.16,1,.3,1)}
html{background:var(--ts-o)}
html[data-toolscout-redesign="2"] body{margin:0!important;background:var(--ts-o)!important;color:var(--ts-g)!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
html[data-toolscout-redesign="2"] body *{box-sizing:border-box}
.ts2-global-nav{background:var(--ts-g);border-bottom:1px solid rgba(243,245,241,.10)}
.ts2-global-nav-inner{height:84px;max-width:1440px;margin:auto;padding:0 72px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.ts2-brand{display:flex;align-items:center;gap:11px;text-decoration:none;color:var(--ts-o);font-size:22px;font-weight:850;letter-spacing:-.045em}.ts2-brand img{width:24px;height:24px;border-radius:5px}
.ts2-actions{display:flex;align-items:center;gap:25px}.ts2-links{display:flex;align-items:center;justify-content:flex-start!important;flex-wrap:nowrap!important;gap:25px;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}.ts2-links a{position:relative;display:inline-flex!important;flex:0 0 auto!important;margin:0!important;padding:0!important;color:#CDD2CC;text-decoration:none;font-size:13px;font-weight:650;transition:color var(--ts-fast) var(--ts-ease)}.ts2-links a:hover{color:#fff}.ts2-links a[aria-current="page"]{color:#fff}.ts2-links a[aria-current="page"]::after{content:"";position:absolute;left:0;right:0;bottom:-12px;height:2px;background:var(--ts-l)}
.ts2-cta{background:var(--ts-l);color:var(--ts-g);padding:12px 17px;border-radius:7px;font-weight:800;text-decoration:none;white-space:nowrap}
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

/* ToolScout 2.0 hub surfaces */
html[data-toolscout-surface="tools"] body>.wrap,
html[data-toolscout-surface="guides"] body>.wrap,
html[data-toolscout-surface="compare"] body>.wrap,
html[data-toolscout-surface="whats-new"] body>.wrap{max-width:1180px!important;padding-top:0!important;padding-bottom:88px!important}
html[data-toolscout-surface="tools"] body>.wrap>nav,
html[data-toolscout-surface="guides"] body>.wrap>.brand,
html[data-toolscout-surface="compare"] body>.wrap>nav,
html[data-toolscout-surface="whats-new"] body>.wrap>.top{display:none!important}

html[data-toolscout-surface="tools"] .intro,
html[data-toolscout-surface="compare"] .intro,
html[data-toolscout-surface="whats-new"] .hero,
html[data-toolscout-surface="guides"] .hero{max-width:820px!important;padding:66px 0 34px!important;margin:0!important}
html[data-toolscout-surface="tools"] .intro h1,
html[data-toolscout-surface="compare"] .intro h1,
html[data-toolscout-surface="whats-new"] .hero h1,
html[data-toolscout-surface="guides"] .hero h1{text-wrap:balance;margin-top:12px!important;margin-bottom:18px!important}
html[data-toolscout-surface="tools"] .intro p,
html[data-toolscout-surface="compare"] .intro p,
html[data-toolscout-surface="whats-new"] .lead,
html[data-toolscout-surface="guides"] .hero p{max-width:680px!important;font-size:17px!important;line-height:1.58!important}

html[data-toolscout-surface="tools"] .editorial-guide{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.4fr);gap:34px;margin:10px 0 30px!important;padding:28px 0!important;border:0!important;border-top:1px solid var(--ts-g)!important;border-bottom:1px solid var(--ts-line)!important;background:transparent!important;border-radius:0!important}
html[data-toolscout-surface="tools"] .editorial-guide h2{margin:6px 0 0!important;font-size:30px!important;line-height:1.04!important}
html[data-toolscout-surface="tools"] .editorial-guide p{margin:0!important;color:#646B64!important}
html[data-toolscout-surface="tools"] .search{margin:26px 0 24px!important}
html[data-toolscout-surface="tools"] .search input{padding:15px 16px!important;border-radius:8px!important;background:#fff!important;border:1px solid var(--ts-line)!important;box-shadow:none!important}
html[data-toolscout-surface="tools"] .grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 26px!important;border-top:1px solid var(--ts-g)}
html[data-toolscout-surface="tools"] .tool{border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;padding:22px 0!important;box-shadow:none!important}
html[data-toolscout-surface="tools"] .tool:hover{transform:none!important;background:rgba(255,255,255,.42)!important}
html[data-toolscout-surface="tools"] .tool-logo{width:44px!important;height:44px!important;flex-basis:44px!important}
html[data-toolscout-surface="tools"] .tool-logo img{width:31px!important;height:31px!important}
html[data-toolscout-surface="tools"] .ai-badge{border-radius:6px!important;background:transparent!important;color:#4E554E!important;border-color:var(--ts-line)!important}
html[data-toolscout-surface="tools"] .ai-badge::before{background:var(--ts-g)!important;color:var(--ts-l)!important}
html[data-toolscout-surface="tools"] .crawl-index{border:0!important;border-top:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;padding:22px 0!important}

html[data-toolscout-surface="guides"] .section{margin-top:42px!important;padding-top:28px!important;border-top:1px solid var(--ts-g)!important}
html[data-toolscout-surface="guides"] .section h2{font-size:34px!important;line-height:1.05!important;margin:8px 0 18px!important}
html[data-toolscout-surface="guides"] .grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 28px!important;border-top:1px solid var(--ts-line)}
html[data-toolscout-surface="guides"] .card{display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important;gap:18px!important;padding:18px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html[data-toolscout-surface="guides"] .card:hover{transform:none!important;padding-left:5px!important;background:transparent!important}
html[data-toolscout-surface="guides"] .card strong{font-size:16px!important}
html[data-toolscout-surface="guides"] .section:first-of-type .grid{grid-template-columns:1fr!important}
html[data-toolscout-surface="guides"] .section:first-of-type .card{padding:22px 0!important}
html[data-toolscout-surface="guides"] .section:first-of-type .card strong{font-size:20px!important}

html[data-toolscout-surface="compare"] .selectors{display:grid!important;grid-template-columns:1fr 1fr!important;gap:18px!important;margin:26px 0 18px!important;padding:22px 0!important;border-top:1px solid var(--ts-g);border-bottom:1px solid var(--ts-line)}
html[data-toolscout-surface="compare"] .selectors select{margin-top:7px!important;padding:14px!important;border-radius:8px!important;border:1px solid var(--ts-line)!important;box-shadow:none!important;background:#fff!important}
html[data-toolscout-surface="compare"] .pairNote{margin:0 0 10px!important;padding:0!important;border:0!important;background:transparent!important;color:#697069!important}
html[data-toolscout-surface="compare"] .table{border:1px solid var(--ts-line)!important;border-radius:9px!important;box-shadow:none!important;background:#fff!important}
html[data-toolscout-surface="compare"] .row{border-bottom:1px solid var(--ts-line)!important}
html[data-toolscout-surface="compare"] .analysis{margin-top:30px!important;padding:28px 0!important;border:0!important;border-top:1px solid var(--ts-g)!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html[data-toolscout-surface="compare"] .analysis h2{font-size:32px!important}
html[data-toolscout-surface="compare"] .suggestion-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 26px!important;border-top:1px solid var(--ts-line)}
html[data-toolscout-surface="compare"] .suggestion-card{border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:18px 0!important}

html[data-toolscout-surface="whats-new"] .grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 30px!important;border-top:1px solid var(--ts-g)}
html[data-toolscout-surface="whats-new"] .card{display:flex!important;flex-direction:column!important;justify-content:space-between!important;min-height:210px!important;padding:22px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html[data-toolscout-surface="whats-new"] .card:hover{transform:none!important;background:rgba(255,255,255,.36)!important}
html[data-toolscout-surface="whats-new"] .card:first-child{grid-column:1/-1;min-height:260px!important;padding:28px 0!important}
html[data-toolscout-surface="whats-new"] .card:first-child h2{font-size:36px!important;max-width:760px!important}
html[data-toolscout-surface="whats-new"] .card h2{font-size:23px!important;line-height:1.15!important;margin:10px 0 9px!important}
html[data-toolscout-surface="whats-new"] .card p{color:#626962!important;max-width:680px!important}
html[data-toolscout-surface="whats-new"] .more{font-size:11px!important;text-transform:uppercase;letter-spacing:.08em!important}
html[data-toolscout-surface="whats-new"] .policy{margin-top:34px!important;padding:24px 0!important;border:0!important;border-top:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;color:#6B726B!important}

@media(max-width:720px){
  .ts2-global-nav-inner{height:auto;min-height:72px;padding:14px 20px 11px;flex-wrap:wrap;row-gap:11px}.ts2-brand{font-size:20px}.ts2-actions{display:contents}.ts2-cta{order:2;margin-left:auto;padding:10px 12px}.ts2-links{order:3;width:100%;justify-content:flex-start!important;gap:18px;overflow-x:auto;overscroll-behavior-inline:contain;padding:1px 0 3px!important;scrollbar-width:none}.ts2-links::-webkit-scrollbar{display:none}.ts2-links a{display:inline-flex!important;flex:0 0 auto!important;white-space:nowrap;font-size:12px}
  html[data-toolscout-redesign="2"] body>.wrap,html[data-toolscout-redesign="2"] body .wrap{padding-left:18px!important;padding-right:18px!important}
  html[data-toolscout-redesign="2"] body h1{font-size:48px!important}
  html[data-toolscout-redesign="2"] body .hero{padding-top:46px!important}
  .ts2-links a[aria-current="page"]::after{bottom:-7px}
  html[data-toolscout-surface="tools"] .intro,
  html[data-toolscout-surface="compare"] .intro,
  html[data-toolscout-surface="whats-new"] .hero,
  html[data-toolscout-surface="guides"] .hero{padding:42px 0 26px!important}
  html[data-toolscout-surface="tools"] .editorial-guide{grid-template-columns:1fr!important;gap:12px!important;padding:22px 0!important}
  html[data-toolscout-surface="tools"] .grid,
  html[data-toolscout-surface="guides"] .grid,
  html[data-toolscout-surface="whats-new"] .grid,
  html[data-toolscout-surface="compare"] .suggestion-grid{grid-template-columns:1fr!important;gap:0!important}
  html[data-toolscout-surface="tools"] .tool{padding:18px 0!important}
  html[data-toolscout-surface="guides"] .section{margin-top:34px!important;padding-top:22px!important}
  html[data-toolscout-surface="guides"] .section h2{font-size:29px!important}
  html[data-toolscout-surface="guides"] .card{padding:16px 0!important}
  html[data-toolscout-surface="compare"] .selectors{grid-template-columns:1fr!important;gap:12px!important;padding:18px 0!important}
  html[data-toolscout-surface="compare"] .table{border-radius:7px!important}
  html[data-toolscout-surface="compare"] .analysis{padding:24px 0!important}
  html[data-toolscout-surface="whats-new"] .card,
  html[data-toolscout-surface="whats-new"] .card:first-child{min-height:0!important;padding:20px 0!important}
  html[data-toolscout-surface="whats-new"] .card:first-child h2{font-size:29px!important}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>`;
}
function navHtml(pathname){
  const active=publicSurface(pathname);
  const current=name=>active===name?' aria-current="page"':'';
  return `<header class="ts2-global-nav"><div class="ts2-global-nav-inner"><a class="ts2-brand" href="/" aria-label="ToolScout home"><img src="/favicon.svg" alt="" width="24" height="24">ToolScout</a><div class="ts2-actions"><div class="ts2-links" role="navigation" aria-label="Primary"><a href="/tools.html"${current('tools')}>Tools</a><a href="/guides.html"${current('guides')}>Guides</a><a href="/compare.html"${current('compare')}>Compare</a><a href="/whats-new.html"${current('whats-new')}>What's new</a></div><a class="ts2-cta" href="/#finder">Find my tools →</a></div></div></header>`;
}
export async function transformPublicRedesignResponse(request,response){
  if(request.method!=='GET'||!isHtml(response))return response;
  const url=new URL(request.url);
  if(!isPublicVisualPath(url.pathname))return response;
  let html=await response.text();
  if(!/<body\b/i.test(html))return response;
  if(isCommercialDecisionPath(url.pathname))html=stripCommercialVendorSourceLinks(html);
  if(!html.includes('data-toolscout-public-redesign="2"'))html=html.replace('</head>',styleTag()+'</head>');
  const surface=publicSurface(url.pathname);
  if(!/<html\b[^>]*data-toolscout-redesign=["']2["']/i.test(html))html=html.replace(/<html\b([^>]*)>/i,(match,attrs)=>'<html'+attrs+' data-toolscout-redesign="2" data-toolscout-surface="'+surface+'">');
  else if(!/<html\b[^>]*data-toolscout-surface=/i.test(html))html=html.replace(/<html\b([^>]*)>/i,(match,attrs)=>'<html'+attrs+' data-toolscout-surface="'+surface+'">');
  if(!html.includes('class="ts2-global-nav"'))html=html.replace(/<body\b[^>]*>/i,m=>m+navHtml(url.pathname));
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Vary',headers.get('Vary')||'Accept-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

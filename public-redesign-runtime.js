const PRIVATE_PREFIXES=['/analytics','/command-center','/admin','/api/','/oauth','/go/'];
const HOME_PATHS=new Set(['/','/index.html']);
const OFFICIAL_SOCIAL_HOSTS=new Set(['linkedin.com','x.com','bsky.app','dev.to','pinterest.com','threads.com']);

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
  if(/^\/tools\/[a-z0-9][a-z0-9-]*$/i.test(p))return'tool-profile';
  if(p==='/guides')return'guides';
  if(/^\/best-[a-z0-9-]+$/i.test(p))return'guide-detail';
  if(p==='/compare')return'compare';
  if(/^\/[a-z0-9][a-z0-9-]+-vs-[a-z0-9][a-z0-9-]+$/i.test(p))return'compare';
  if(p==='/whats-new')return'whats-new';
  if(p==='/methodology')return'methodology';
  if(p==='/affiliate-disclosure'||p==='/privacy')return'policy';
  if(p==='/categories')return'categories';
  if(new Set(['/crm-tools','/seo-tools','/marketing-tools','/automation-tools','/forms-tools','/productivity-tools','/agency-tools']).has(p))return'category';
  if(/^\/news\/[a-z0-9][a-z0-9-]*$/i.test(p))return'news';
  if(p==='/software-trends-index')return'trends';
  if(p==='/distribution/publisher-kit')return'publisher-kit';
  return'public';
}
function stripLegacyNavigation(html,surface){
  let out=String(html||'');
  // Remove previously injected legacy global navigation. The ToolScout 2.0 shell is the sole primary nav owner.
  out=out.replace(/<nav\b[^>]*class=["'][^"']*\bts-global-nav\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi,'');
  // Remove old branded nav blocks used by Tools, Compare and other pre-2.0 hubs.
  out=out.replace(/<nav\b[^>]*>[\s\S]*?<a\b(?=[^>]*class=["']brand["'])(?=[^>]*href=["']\/["'])[^>]*>\s*ToolScout\s*<\/a>[\s\S]*?<\/nav>/gi,'');
  // What's New and software-news pages used a .top wrapper containing the legacy brand/nav pair.
  if(surface==='whats-new'||surface==='news'){
    out=out.replace(/<div\b[^>]*class=["'][^"']*\btop\b[^"']*["'][^>]*>[\s\S]*?<a\b(?=[^>]*class=["']brand["'])(?=[^>]*href=["']\/["'])[^>]*>\s*ToolScout\s*<\/a>[\s\S]*?<\/div>/gi,'');
  }
  // Generated tool profiles used a standalone pre-2.0 ToolScout brand link above breadcrumbs.
  // The shared ToolScout 2.0 header owns brand identity, so remove the duplicate at runtime
  // for already-generated profiles as well as preventing it at generation time.
  if(surface==='tool-profile'||surface==='guide-detail'){
    out=out.replace(/<a\b(?=[^>]*class=["'][^"']*\bbrand\b[^"']*["'])(?=[^>]*href=["'](?:\.\/|\/)["'])[^>]*>\s*ToolScout\s*<\/a>/gi,'');
  }
  return out;
}

function stripCommercialVendorSourceLinks(html){
  let out=String(html||'');
  out=out.replace(/(<section\b[^>]*data-toolscout-editorial-evidence=["']1["'][^>]*>)([\s\S]*?)(<\/section>)/gi,(match,open,body,close)=>open+body.replace(/<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi,'$1')+close);
  out=out.replace(/<p\b[^>]*class=["'][^"']*source-note[^"']*["'][^>]*>[\s\S]*?<\/p>/gi,'');
  out=out.replace(/\s*(?:·\s*)?<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>\s*Official(?:\s+product)?\s+source\s*<\/a>/gi,'');
  out=out.replace(/\s*(?:·\s*)?<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>\s*[^<]{0,120}\s+official(?:\s+product)?\s+source\s*<\/a>/gi,'');
  out=out.replace(/<strong>\s*Primary sources:\s*<\/strong>\s*/gi,'');
  out=out.replace(/>\s*[.·]\s*Source data last checked\s*/gi,'>Information last checked ');
  out=out.replace(/\bSource data last checked\b/gi,'Information last checked');
  return out;
}
function stripNonCtaExternalLinks(html){
  return String(html||'').replace(/<a\b([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi,(match,before,quote,href,after,body)=>{
    try{
      const host=new URL(href).hostname.toLowerCase().replace(/^www\./,'');
      if(host==='trytoolscout.org')return match;
      const attrs=String(before||'')+' '+String(after||'');
      const markedSocial=/\bdata-toolscout-social-link\s*=\s*["']1["']/i.test(attrs);
      if(markedSocial&&OFFICIAL_SOCIAL_HOSTS.has(host))return match;
    }catch{}
    return body;
  });
}

function styleTag(){
  return `<style data-toolscout-public-redesign="2">
:root{--ts-g:#0B0D0C;--ts-c:#141715;--ts-o:#F3F5F1;--ts-soft:#F8F9F6;--ts-m:#90978F;--ts-line:#DDE2DC;--ts-l:#B7FF3C;--ts-fast:140ms;--ts-base:180ms;--ts-ease:cubic-bezier(.2,.7,.2,1);--ts-out:cubic-bezier(.16,1,.3,1)}
html{background:var(--ts-o)}
html[data-toolscout-redesign="2"] body{margin:0!important;max-width:none!important;padding:0!important;background:var(--ts-o)!important;color:var(--ts-g)!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;line-height:1.45!important}
html[data-toolscout-redesign="2"] body *{box-sizing:border-box}
.ts2-global-nav{position:sticky;top:0;z-index:1000;background:var(--ts-g);border-bottom:1px solid rgba(243,245,241,.10);isolation:isolate;transition:box-shadow var(--ts-fast) var(--ts-ease)}
.ts2-global-nav.is-scrolled{box-shadow:0 8px 24px rgba(11,13,12,.12)}
.ts2-global-nav-inner{height:84px;max-width:1440px;margin:auto;padding:0 72px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.ts2-brand{display:flex;align-items:center;gap:11px;text-decoration:none;color:var(--ts-o);font-size:22px;font-weight:850;letter-spacing:-.045em}.ts2-brand img{width:24px;height:24px;border-radius:5px}
.ts2-actions{display:flex;align-items:center;gap:22px}.ts2-links{display:flex;align-items:center;justify-content:flex-start!important;flex-wrap:nowrap!important;gap:20px;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}.ts2-links a{position:relative;display:inline-flex!important;flex:0 0 auto!important;margin:0!important;padding:0!important;color:#CDD2CC;text-decoration:none;font-size:13px;font-weight:650;transition:color var(--ts-fast) var(--ts-ease)}.ts2-links a:hover{color:#fff}.ts2-links a[aria-current="page"]{color:#fff}.ts2-links a[aria-current="page"]::after{content:"";position:absolute;left:0;right:0;bottom:-12px;height:2px;background:var(--ts-l)}
.ts2-cta{background:var(--ts-l);color:var(--ts-g);padding:12px 17px;border-radius:7px;font-weight:800;text-decoration:none;white-space:nowrap}
html[data-toolscout-redesign="2"] .ts-global-nav{display:none!important}
html[data-toolscout-surface="trends"] .darkBand .shell>nav:first-child{display:none!important}
html[data-toolscout-surface="tool-profile"] body>.wrap>.brand{display:none!important}
.ts2-global-nav + .wrap > nav:first-child,.ts2-global-nav + .wrap > .brand,.ts2-global-nav + .wrap > .top:first-child{display:none!important}
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

html[data-toolscout-surface="tools"] .tool-head{align-items:center!important;gap:14px!important}
html[data-toolscout-surface="tools"] .tool h2{font-size:24px!important;line-height:1.08!important;margin:3px 0 0!important}
html[data-toolscout-surface="tools"] .tool p{color:#626962!important;line-height:1.58!important}
html[data-toolscout-surface="tools"] .tool-summary{margin:14px 0 7px!important}
html[data-toolscout-surface="tools"] .tool-view{margin:10px 0 0!important;color:#515851!important}
html[data-toolscout-surface="tools"] .tool-footer{margin-top:18px!important;padding-top:14px!important;border-top:1px solid var(--ts-line)!important}
html[data-toolscout-surface="tools"] .tool-actions{display:flex!important;gap:8px!important}
html[data-toolscout-surface="tools"] .tool-link,
html[data-toolscout-surface="tools"] .tool-visit{min-height:36px!important;padding:8px 11px!important;border-radius:7px!important;font-size:12px!important;font-weight:800!important;text-decoration:none!important}
html[data-toolscout-surface="tools"] .tool-link{background:transparent!important;color:var(--ts-g)!important;border:1px solid var(--ts-line)!important}
html[data-toolscout-surface="tools"] .tool-visit{background:var(--ts-g)!important;color:#fff!important;border:1px solid var(--ts-g)!important}
html[data-toolscout-surface="tools"] .cat,
html[data-toolscout-surface="tools"] .price{color:#777F77!important}

html[data-toolscout-surface="guides"] .section{margin-top:42px!important;padding-top:28px!important;border-top:1px solid var(--ts-g)!important}
html[data-toolscout-surface="guides"] .section h2{font-size:34px!important;line-height:1.05!important;margin:8px 0 18px!important}
html[data-toolscout-surface="guides"] .grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 28px!important;border-top:1px solid var(--ts-line)}
html[data-toolscout-surface="guides"] .card{display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important;gap:18px!important;padding:18px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html[data-toolscout-surface="guides"] .card:hover{transform:none!important;padding-left:5px!important;background:transparent!important}
html[data-toolscout-surface="guides"] .card strong{font-size:16px!important}

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

html[data-toolscout-surface="news"] body>.wrap{max-width:900px!important;padding-top:0!important;padding-bottom:88px!important}
html[data-toolscout-surface="news"] body>.wrap>.top{display:none!important}
html[data-toolscout-surface="news"] .hero{padding:66px 0 30px!important;margin:0!important;border-bottom:1px solid var(--ts-line)}
html[data-toolscout-surface="news"] .hero h1{max-width:860px!important;text-wrap:balance;margin:12px 0 18px!important}
html[data-toolscout-surface="news"] .lead{max-width:760px!important;font-size:18px!important;line-height:1.62!important}
html[data-toolscout-surface="news"] .article h2{font-size:30px!important;line-height:1.08!important;margin:34px 0 10px!important}
html[data-toolscout-surface="news"] .article>main>p{font-size:17px!important;line-height:1.72!important;color:#5D655D!important}
html[data-toolscout-surface="news"] .actions{padding:24px 0!important;margin:28px 0!important;border-top:1px solid var(--ts-line);border-bottom:1px solid var(--ts-line)}
html[data-toolscout-surface="news"] .source{margin-top:28px!important;padding-top:0!important;border-top:0!important;color:#727A72!important}
html[data-toolscout-surface="news"] .back{display:inline-flex!important;margin-top:26px!important;color:var(--ts-g)!important;text-decoration:none!important;font-weight:800!important}

html[data-toolscout-surface="trends"] body>.wrap{max-width:1180px!important;padding-top:0!important;padding-bottom:88px!important}
html[data-toolscout-surface="trends"] body>.wrap>.top,
html[data-toolscout-surface="trends"] body>.wrap>nav:first-child,
html[data-toolscout-surface="trends"] body>.wrap>.brand:first-child{display:none!important}
html[data-toolscout-surface="trends"] .hero{max-width:820px!important;padding:66px 0 34px!important}
html[data-toolscout-surface="trends"] .card,
html[data-toolscout-surface="trends"] .panel{border-radius:9px!important;box-shadow:none!important}


/* ToolScout 2.0 tool profiles */
html[data-toolscout-surface="tool-profile"] body>.wrap{max-width:1120px!important;padding-top:0!important;padding-bottom:88px!important}
html[data-toolscout-surface="tool-profile"] .crumbs{display:flex!important;gap:7px!important;align-items:center!important;padding:24px 0 0!important;margin:0!important;color:#7B827B!important;font-size:12px!important}
html[data-toolscout-surface="tool-profile"] .crumbs a{color:#545B54!important;text-decoration:none!important}
html[data-toolscout-surface="tool-profile"] .hero{max-width:900px!important;margin:0!important;padding:54px 0 34px!important;border-bottom:1px solid var(--ts-line)!important}
html[data-toolscout-surface="tool-profile"] .heroHead{display:flex!important;align-items:center!important;gap:18px!important}
html[data-toolscout-surface="tool-profile"] .toolLogo,
html[data-toolscout-surface="tool-profile"] .logoFallback{width:58px!important;height:58px!important;flex:0 0 58px!important;border-radius:11px!important}
html[data-toolscout-surface="tool-profile"] .hero h1{margin:9px 0 0!important}
html[data-toolscout-surface="tool-profile"] .hero .lead{max-width:780px!important;margin:22px 0 0!important;font-size:18px!important}
html[data-toolscout-surface="tool-profile"] .editorialIntro{display:grid!important;grid-template-columns:180px minmax(0,1fr)!important;gap:34px!important;margin:0!important;padding:30px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important}
html[data-toolscout-surface="tool-profile"] .editorialIntro p{margin:0!important;color:#515851!important;font-size:16px!important;line-height:1.68!important}
html[data-toolscout-surface="tool-profile"] .grid{display:grid!important;grid-template-columns:1.15fr .85fr!important;gap:18px!important;margin-top:34px!important}
html[data-toolscout-surface="tool-profile"] .panel{padding:24px!important;border:1px solid var(--ts-line)!important;border-radius:9px!important;background:#fff!important;box-shadow:none!important}
html[data-toolscout-surface="tool-profile"] .panel h2{font-size:24px!important;margin:0 0 14px!important}
html[data-toolscout-surface="tool-profile"] .panel h2:not(:first-child){margin-top:26px!important}
html[data-toolscout-surface="tool-profile"] .section{margin-top:48px!important;padding-top:28px!important;border-top:1px solid var(--ts-g)!important}
html[data-toolscout-surface="tool-profile"] .section h2{font-size:31px!important;line-height:1.08!important;margin-top:6px!important}
html[data-toolscout-surface="tool-profile"] .sectionHead{display:flex!important;align-items:flex-end!important;justify-content:space-between!important;gap:24px!important}
html[data-toolscout-surface="tool-profile"] .aiFacts{display:flex!important;flex-wrap:wrap!important;gap:8px!important;margin-top:18px!important}
html[data-toolscout-surface="tool-profile"] .aiFacts span{padding:8px 10px!important;background:var(--ts-soft)!important;border:1px solid var(--ts-line)!important}
html[data-toolscout-surface="tool-profile"] .relatedGrid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 24px!important;border-top:1px solid var(--ts-line)!important}
html[data-toolscout-surface="tool-profile"] .relatedCard{padding:18px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important}
html[data-toolscout-surface="tool-profile"] .relatedIdentity{display:flex!important;align-items:center!important;gap:11px!important}
html[data-toolscout-surface="tool-profile"] details{padding:16px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important}
html[data-toolscout-surface="tool-profile"] details summary{font-weight:800!important}
html[data-toolscout-surface="tool-profile"] .qualityActions{display:flex!important;flex-wrap:wrap!important;gap:12px 20px!important;margin-top:26px!important;padding-top:20px!important;border-top:1px solid var(--ts-line)!important}
html[data-toolscout-surface="tool-profile"] .qualityActions a{font-size:12px!important;font-weight:800!important;color:var(--ts-g)!important}
html[data-toolscout-surface="tool-profile"] [data-toolscout-related-tools="1"]>div{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 24px!important;border-top:1px solid var(--ts-line)!important}
html[data-toolscout-surface="tool-profile"] [data-toolscout-related-tools="1"]>div>a{padding:18px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important}

/* ToolScout 2.0 individual buying guides */
html[data-toolscout-surface="guide-detail"] body>.wrap{max-width:1080px!important;padding-top:0!important;padding-bottom:88px!important}
html[data-toolscout-surface="guide-detail"] body>.wrap>.brand{display:none!important}
html[data-toolscout-surface="guide-detail"] .hero{max-width:880px!important;margin:0!important;padding:66px 0 36px!important;border-bottom:1px solid var(--ts-line)!important}
html[data-toolscout-surface="guide-detail"] .hero h1{margin:12px 0 18px!important;text-wrap:balance}
html[data-toolscout-surface="guide-detail"] .hero .lead{max-width:780px!important;font-size:18px!important}
html[data-toolscout-surface="guide-detail"] .hero .sub{max-width:820px!important;margin-top:14px!important;font-size:14px!important}
html[data-toolscout-surface="guide-detail"] .section{margin-top:42px!important;padding-top:28px!important;border-top:1px solid var(--ts-g)!important}
html[data-toolscout-surface="guide-detail"] .section h2{font-size:31px!important;line-height:1.08!important;margin:6px 0 14px!important}
html[data-toolscout-surface="guide-detail"] body>.wrap>.grid{display:grid!important;grid-template-columns:1fr!important;gap:0!important;margin-top:38px!important;border-top:1px solid var(--ts-g)!important}
html[data-toolscout-surface="guide-detail"] body>.wrap>.grid>.card{position:relative!important;padding:28px 0 30px 70px!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html[data-toolscout-surface="guide-detail"] body>.wrap>.grid>.card:hover{transform:none!important;background:rgba(255,255,255,.34)!important}
html[data-toolscout-surface="guide-detail"] .card .rank{position:absolute!important;left:0!important;top:31px!important;width:42px!important;height:28px!important;display:grid!important;place-items:center!important;border:1px solid var(--ts-g)!important;border-radius:5px!important;font-size:11px!important;font-weight:900!important}
html[data-toolscout-surface="guide-detail"] .card h2{font-size:28px!important;line-height:1.1!important;margin:5px 0 10px!important}
html[data-toolscout-surface="guide-detail"] .card>p{max-width:790px!important;color:#5D655D!important;line-height:1.62!important}
html[data-toolscout-surface="guide-detail"] .proof,
html[data-toolscout-surface="guide-detail"] .sourceProof{margin-top:12px!important;color:#777F77!important;font-size:12px!important;line-height:1.55!important}
html[data-toolscout-surface="guide-detail"] .features{display:flex!important;flex-wrap:wrap!important;gap:7px!important;margin:14px 0!important}
html[data-toolscout-surface="guide-detail"] .card>a{display:inline-flex!important;align-items:center!important;min-height:36px!important;margin:8px 8px 0 0!important;padding:8px 11px!important;border-radius:7px!important;font-size:12px!important;font-weight:800!important;text-decoration:none!important}
html[data-toolscout-surface="guide-detail"] .card>a[href^="/tools/"]{border:1px solid var(--ts-line)!important;color:var(--ts-g)!important;background:transparent!important}
html[data-toolscout-surface="guide-detail"] .card>a[href^="/go/"]{border:1px solid var(--ts-g)!important;color:#fff!important;background:var(--ts-g)!important}
html[data-toolscout-surface="guide-detail"] .editorial-analysis{padding:30px 0!important;background:transparent!important;border-left:0!important;border-right:0!important;border-bottom:1px solid var(--ts-line)!important}
html[data-toolscout-surface="guide-detail"] .related{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 24px!important;border-top:1px solid var(--ts-line)!important}
html[data-toolscout-surface="guide-detail"] .related-card{display:flex!important;justify-content:space-between!important;gap:20px!important;padding:17px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;text-decoration:none!important}

/* Publisher Kit uses the same public shell even though its source is natively designed */
html[data-toolscout-surface="publisher-kit"] body>main{max-width:1180px!important;margin:auto!important;padding:0 24px 88px!important}
html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-shell{height:84px!important;max-width:1440px!important;margin:auto!important;padding:0 72px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:24px!important}
html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-actions,
html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-links{display:flex!important;align-items:center!important}
html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-actions{gap:22px!important}
html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-links{gap:20px!important}
html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-links a{color:#CDD2CC!important;text-decoration:none!important;font-size:13px!important;font-weight:650!important}
html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-cta{background:var(--ts-l)!important;color:var(--ts-g)!important;padding:12px 17px!important;border-radius:7px!important;font-weight:800!important;text-decoration:none!important}
html[data-toolscout-surface="publisher-kit"] .hero{padding:66px 0 42px!important;border-bottom:1px solid var(--ts-line)!important}
html[data-toolscout-surface="publisher-kit"] .section{margin-top:46px!important;padding-top:28px!important;border-top:1px solid var(--ts-g)!important}
html[data-toolscout-surface="publisher-kit"] .card,
html[data-toolscout-surface="publisher-kit"] .step,
html[data-toolscout-surface="publisher-kit"] .theme-card{border-radius:9px!important;box-shadow:none!important}
html[data-toolscout-surface="publisher-kit"] pre{white-space:pre-wrap!important;overflow-wrap:anywhere!important;border-radius:7px!important}

/* Legacy public informational and category hubs */
html[data-toolscout-surface="methodology"] body>.wrap,
html[data-toolscout-surface="policy"] body>.wrap,
html[data-toolscout-surface="categories"] body>.wrap{max-width:1040px!important;padding-top:0!important;padding-bottom:88px!important}
html[data-toolscout-surface="methodology"] .hero,
html[data-toolscout-surface="policy"] .hero,
html[data-toolscout-surface="categories"] .hero{max-width:850px!important;padding:66px 0 34px!important;margin:0!important}
html[data-toolscout-surface="methodology"] .section,
html[data-toolscout-surface="policy"] .section{margin-top:0!important;padding:28px 0!important;border-top:1px solid var(--ts-line)!important}
html[data-toolscout-surface="methodology"] .card{margin:0!important;padding:18px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important}
html[data-toolscout-surface="categories"] .grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 28px!important;border-top:1px solid var(--ts-g)!important}
html[data-toolscout-surface="categories"] .card{padding:22px 0!important;border:0!important;border-bottom:1px solid var(--ts-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html[data-toolscout-surface="categories"] .card:hover{transform:none!important;padding-left:5px!important}
html[data-toolscout-surface="category"] body>.ts-global-nav+ a[href="/"]{display:none!important}
html[data-toolscout-surface="category"] body>h1,
html[data-toolscout-surface="category"] body>p,
html[data-toolscout-surface="category"] body>ul,
html[data-toolscout-surface="category"] body>section{width:min(100% - 48px,1180px)!important;margin-left:auto!important;margin-right:auto!important}
html[data-toolscout-surface="category"] body>h1{padding-top:66px!important;margin-top:0!important;margin-bottom:16px!important}
html[data-toolscout-surface="category"] body>h1+ p{max-width:760px!important;color:#626962!important;font-size:17px!important;line-height:1.62!important;margin-bottom:34px!important}
html[data-toolscout-surface="category"] body>ul{list-style:none!important;padding:0!important;border-top:1px solid var(--ts-g)!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 28px!important}
html[data-toolscout-surface="category"] body>ul>li{margin:0!important;padding:0!important;border-bottom:1px solid var(--ts-line)!important}
html[data-toolscout-surface="category"] body>ul>li>a{display:flex!important;align-items:center!important;min-height:58px!important;text-decoration:none!important;font-weight:800!important}
html[data-toolscout-surface="category"] body>ul+ p{margin-top:24px!important;font-size:12px!important;font-weight:800!important}
html[data-toolscout-surface="category"] body>section{margin-top:42px!important;padding-top:28px!important;border-top:1px solid var(--ts-line)!important;background:transparent!important;border-radius:0!important}
html[data-toolscout-surface="category"] body>section[style]{padding-left:0!important;padding-right:0!important;border-left:0!important;border-right:0!important;border-bottom:0!important}

@media(max-width:720px){
  .ts2-global-nav-inner{height:auto;min-height:72px;padding:14px 20px 11px;flex-wrap:wrap;row-gap:11px}.ts2-brand{font-size:20px}.ts2-actions{display:contents}.ts2-cta{order:2;margin-left:auto;padding:10px 12px}.ts2-links{order:3;width:100%;min-width:0;justify-content:space-between!important;gap:0;overflow-x:visible;overscroll-behavior-inline:contain;padding:1px 0 3px!important;scrollbar-width:none}.ts2-links::-webkit-scrollbar{display:none}.ts2-links a{display:inline-flex!important;flex:0 0 auto!important;white-space:nowrap;font-size:clamp(10px,2.8vw,11px);line-height:1.1;color:#BAC0BA}
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
  html[data-toolscout-surface="tool-profile"] .editorialIntro{grid-template-columns:1fr!important;gap:10px!important;padding:24px 0!important}
  html[data-toolscout-surface="tool-profile"] .grid{grid-template-columns:1fr!important}
  html[data-toolscout-surface="tool-profile"] .relatedGrid,
  html[data-toolscout-surface="tool-profile"] [data-toolscout-related-tools="1"]>div{grid-template-columns:1fr!important;gap:0!important}
  html[data-toolscout-surface="tool-profile"] .sectionHead{align-items:flex-start!important;flex-direction:column!important}
  html[data-toolscout-surface="guide-detail"] .hero{padding:46px 0 30px!important}
  html[data-toolscout-surface="guide-detail"] body>.wrap>.grid>.card{padding:24px 0 26px 58px!important}
  html[data-toolscout-surface="guide-detail"] .card .rank{top:27px!important;width:36px!important}
  html[data-toolscout-surface="guide-detail"] .related{grid-template-columns:1fr!important;gap:0!important}
  html[data-toolscout-surface="publisher-kit"] body>main{padding-left:18px!important;padding-right:18px!important}
  html[data-toolscout-surface="publisher-kit"] .ts2-global-nav .nav-shell{height:auto!important;min-height:72px!important;padding:14px 20px 11px!important;flex-wrap:wrap!important}

  html[data-toolscout-surface="guides"] .section{margin-top:34px!important;padding-top:22px!important}
  html[data-toolscout-surface="guides"] .section h2{font-size:29px!important}
  html[data-toolscout-surface="guides"] .card{padding:16px 0!important}
  html[data-toolscout-surface="compare"] .selectors{grid-template-columns:1fr!important;gap:12px!important;padding:18px 0!important}
  html[data-toolscout-surface="compare"] .table{border-radius:7px!important}
  html[data-toolscout-surface="compare"] .analysis{padding:24px 0!important}
  html[data-toolscout-surface="whats-new"] .card,
  html[data-toolscout-surface="whats-new"] .card:first-child{min-height:0!important;padding:20px 0!important}
  html[data-toolscout-surface="whats-new"] .card:first-child h2{font-size:29px!important}
  html[data-toolscout-surface="categories"] .grid,
  html[data-toolscout-surface="category"] body>ul{grid-template-columns:1fr!important;gap:0!important}
  html[data-toolscout-surface="category"] body>h1,
  html[data-toolscout-surface="category"] body>p,
  html[data-toolscout-surface="category"] body>ul,
  html[data-toolscout-surface="category"] body>section{width:min(100% - 40px,1180px)!important}
  html[data-toolscout-surface="category"] body>h1{padding-top:44px!important}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>`;
}
function stickyNavScript(){
  return `<script data-toolscout-sticky-nav="2">(()=>{const nav=document.querySelector('.ts2-global-nav');if(!nav)return;let frame=0;const sync=()=>{nav.classList.toggle('is-scrolled',window.scrollY>8);frame=0};addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(sync)},{passive:true});sync()})();</script>`;
}
function navHtml(pathname){
  const active=publicSurface(pathname);
  const current=name=>active===name?' aria-current="page"':'';
  return `<header class="ts2-global-nav"><div class="ts2-global-nav-inner"><a class="ts2-brand" href="/" aria-label="ToolScout home"><img src="/favicon.svg" alt="" width="24" height="24">ToolScout</a><div class="ts2-actions"><div class="ts2-links" role="navigation" aria-label="Primary"><a href="/tools"${current('tools')}>Tools</a><a href="/guides"${current('guides')}>Guides</a><a href="/compare"${current('compare')}>Compare</a><a href="/whats-new"${current('whats-new')}>What's new</a><a href="/software-trends-index"${current('trends')}>Trends</a><a href="/distribution/publisher-kit"${current('publisher-kit')}>Publisher Kit</a></div><a class="ts2-cta" href="/#finder">Find my tools →</a></div></div></header>`+stickyNavScript();
}
export async function transformPublicRedesignResponse(request,response){
  if(request.method!=='GET'||!isHtml(response))return response;
  const url=new URL(request.url);
  if(!isPublicVisualPath(url.pathname))return response;
  let html=await response.text();
  if(!/<body\b/i.test(html))return response;
  const surface=publicSurface(url.pathname);
  html=stripLegacyNavigation(html,surface);
  if(isCommercialDecisionPath(url.pathname))html=stripCommercialVendorSourceLinks(html);
  if(!html.includes('data-toolscout-public-redesign="2"'))html=html.replace('</head>',styleTag()+'</head>');
  if(!/<html\b[^>]*data-toolscout-redesign=["']2["']/i.test(html))html=html.replace(/<html\b([^>]*)>/i,(match,attrs)=>'<html'+attrs+' data-toolscout-redesign="2" data-toolscout-surface="'+surface+'">');
  else if(!/<html\b[^>]*data-toolscout-surface=/i.test(html))html=html.replace(/<html\b([^>]*)>/i,(match,attrs)=>'<html'+attrs+' data-toolscout-surface="'+surface+'">');
  if(!html.includes('class="ts2-global-nav"'))html=html.replace(/<body\b[^>]*>/i,m=>m+navHtml(url.pathname));
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Vary',headers.get('Vary')||'Accept-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export async function transformPublicOutboundPolicyResponse(request,response){
  if(request.method!=='GET'||!isHtml(response))return response;
  const url=new URL(request.url);
  if(PRIVATE_PREFIXES.some(prefix=>url.pathname===prefix||url.pathname.startsWith(prefix)))return response;
  const html=stripNonCtaExternalLinks(await response.text());
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

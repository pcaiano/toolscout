import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SKIP=new Set(['analytics.html','analytics-v2.html','affiliate-workflow.html','distribution-workflow.html','admin.html','click.html']);
const NAV='<nav class="ts-global-nav" aria-label="Primary"><a href="/guides">Guides</a><a href="/blog/">Blog</a><a href="/tools">Tools</a><a href="/compare">Compare</a><a href="/methodology">Methodology</a></nav>';
const LINKS='<div class="links"><a href="/guides">Guides</a><a href="/blog/">Blog</a><a href="/tools">Tools</a><a href="/compare">Compare</a><a href="/methodology">Methodology</a></div>';
const CSS='<style id="ts-global-nav-style">.ts-global-nav{display:flex;justify-content:flex-end;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 32px}.ts-global-nav a{color:#667085;text-decoration:none;padding:9px 12px;border-radius:10px;font-size:13px;font-weight:500}.ts-global-nav a:hover{background:#fff;color:#101828;box-shadow:0 5px 18px rgba(16,24,40,.06)}@media(max-width:700px){.ts-global-nav{justify-content:flex-start;gap:2px;margin-bottom:24px}.ts-global-nav a{padding:8px 9px}}</style>';
const TOOL_INDEX_CSS='<style id="ts-tool-profile-index-style">.tool-profile-index{margin-top:44px;padding:28px;background:rgba(255,255,255,.82);border:1px solid #e2e7ed;border-radius:22px}.tool-profile-index h2{margin:0 0 8px;font-size:28px;letter-spacing:-.03em}.tool-profile-index>p{margin:0 0 22px;color:#667085}.tool-profile-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px}.tool-profile-group h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#667085}.tool-profile-links{display:flex;flex-wrap:wrap;gap:8px 12px}.tool-profile-links a{font-size:13px;color:#344054;text-decoration:none}.tool-profile-links a:hover{text-decoration:underline}</style>';
const FAVICON_LINK='<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="/favicon.svg">';
const CANONICAL_LABELS=['Guides','Blog','Tools','Compare','Methodology'];
const BROKEN_LOCAL_SLUGS=['best-ai-ad-creative-tools','best-no-code-automation-tools'];
const PUBLIC_HTML_URL_RE=/(["'])((?:https:\/\/trytoolscout\.org)?\/[^"'<>?#\s]+)\.html([?#][^"']*)?\1/g;

function publicHtml(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const full=path.join(dir,entry.name);if(entry.isDirectory()){if(['.git','node_modules','reports','docs','data'].includes(entry.name))return[];return publicHtml(full);}return entry.isFile()&&entry.name.endsWith('.html')?[full]:[];});}
function navBlocks(html){return [...html.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)].map(m=>m[0]);}
function hasCanonicalNav(html){return navBlocks(html).some(nav=>CANONICAL_LABELS.every(label=>nav.includes(`>${label}<`)));}
function upgradeBrandedNav(html){return html.replace(/<nav>([\s\S]*?<a class="brand"[\s\S]*?<\/a>)[\s\S]*?<div class="links">[\s\S]*?<\/div><\/nav>/i,`<nav>$1${LINKS}</nav>`);}
function cleanPublicUrls(html){return html.replace(PUBLIC_HTML_URL_RE,(_m,q,url,suffix='')=>`${q}${url}${suffix||''}${q}`);}
function removeKnownBrokenLinks(html){for(const slug of BROKEN_LOCAL_SLUGS){const re=new RegExp(`<a\\b[^>]*\\bhref=["']\\/${slug}(?:\\.html)?["'][^>]*>([\\s\\S]*?)<\\/a>`,'gi');html=html.replace(re,'$1');}return html;}
function ensureFavicon(html){if(/<link\b[^>]*\brel=["'][^"']*icon[^"']*["'][^>]*>/i.test(html))return html;return html.replace(/<\/head>/i,`${FAVICON_LINK}</head>`);}
function readJson(rel,fallback=[]){try{return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));}catch{return fallback;}}
function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function toolProfileIndex(){
  const catalog=[...readJson('data/tools.json',[]),...readJson('data/pending-affiliate-tools.json',[])];
  const meta=new Map();
  for(const item of catalog){const slug=String(item?.slug||'').trim();if(slug&&!meta.has(slug))meta.set(slug,item);}
  let files=[];try{files=fs.readdirSync(path.join(ROOT,'tools'),{withFileTypes:true});}catch{return '';}
  const rows=files.filter(x=>x.isFile()&&x.name.endsWith('.html')).map(x=>x.name.replace(/\.html$/i,''))
    .filter(slug=>slug&&slug!=='index').map(slug=>{const item=meta.get(slug)||{};return{slug,name:String(item.name||slug).trim(),category:String(item.category||'Other').trim()||'Other'};})
    .sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
  if(!rows.length)return '';
  const groups=new Map();for(const row of rows){if(!groups.has(row.category))groups.set(row.category,[]);groups.get(row.category).push(row);}
  const body=[...groups.entries()].map(([category,items])=>`<section class="tool-profile-group"><h3>${esc(category)}</h3><div class="tool-profile-links">${items.map(item=>`<a href="/tools/${encodeURIComponent(item.slug)}">${esc(item.name)}</a>`).join('')}</div></section>`).join('');
  return `<section id="tool-profile-index" class="tool-profile-index" aria-labelledby="tool-profile-index-title"><h2 id="tool-profile-index-title">Browse all tool profiles</h2><p>Direct links to every ToolScout tool profile, grouped by category.</p><div class="tool-profile-groups">${body}</div></section>`;
}
function injectToolProfileIndex(html,rel){
  if(rel!=='tools.html')return html;
  html=html.replace(/<section id="tool-profile-index"[\s\S]*?<\/section>(?=\s*<div class="note">)/i,'').replace(/<style id="ts-tool-profile-index-style">[\s\S]*?<\/style>/gi,'');
  const index=toolProfileIndex();if(!index)return html;
  html=html.replace(/<\/head>/i,`${TOOL_INDEX_CSS}</head>`);
  if(/<div class="note">/i.test(html))return html.replace(/<div class="note">/i,`${index}<div class="note">`);
  return html.replace(/<\/body>/i,`${index}</body>`);
}

let updated=0,skipped=0,existing=0,upgraded=0,injected=0,cleanedUrls=0,removedBrokenLinks=0,toolIndexUpdated=0,faviconAdded=0;
for(const file of publicHtml(ROOT)){
  const rel=path.relative(ROOT,file).replaceAll('\\','/');
  if(SKIP.has(rel)){skipped++;continue;}
  let html=fs.readFileSync(file,'utf8');
  if(!/<body\b/i.test(html)||!/<\/head>/i.test(html)){skipped++;continue;}
  const beforeUrls=html;
  html=cleanPublicUrls(html);
  if(html!==beforeUrls)cleanedUrls++;
  const beforeBroken=html;
  html=removeKnownBrokenLinks(html);
  if(html!==beforeBroken)removedBrokenLinks++;
  const beforeIndex=html;
  html=injectToolProfileIndex(html,rel);
  if(html!==beforeIndex)toolIndexUpdated++;
  const beforeFavicon=html;
  html=ensureFavicon(html);
  if(html!==beforeFavicon)faviconAdded++;
  html=html.replace(/<nav class="ts-global-nav"[\s\S]*?<\/nav>/gi,'').replace(/<style id="ts-global-nav-style">[\s\S]*?<\/style>/gi,'');
  if(/<a class="brand"[\s\S]*?>ToolScout<\/a>/i.test(html)){
    const next=upgradeBrandedNav(html);
    if(next!==html){html=next;upgraded++;}
  }
  if(hasCanonicalNav(html)){fs.writeFileSync(file,html,'utf8');existing++;updated++;continue;}
  html=html.replace(/<\/head>/i,`${CSS}</head>`);
  const wrap=html.match(/<body[^>]*>\s*<div class="wrap"[^>]*>/i);
  if(wrap) html=html.replace(wrap[0],`${wrap[0]}${NAV}`);
  else html=html.replace(/<body([^>]*)>/i,`<body$1>${NAV}`);
  fs.writeFileSync(file,html,'utf8');updated++;injected++;
}
console.log(JSON.stringify({updated,skipped,existing,upgraded,injected,cleanedUrls,removedBrokenLinks,toolIndexUpdated,faviconAdded}));

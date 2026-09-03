import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SKIP=new Set(['analytics.html','affiliate-workflow.html','distribution-workflow.html','opportunity-matrix.html','admin.html','click.html']);
const NAV='<nav class="ts-global-nav" aria-label="Primary"><a href="/guides.html">Guides</a><a href="/blog/">Journal</a><a href="/tools.html">Tools</a><a href="/compare.html">Compare</a><a href="/methodology.html">Methodology</a></nav>';
const LINKS='<div class="links"><a href="./guides.html">Guides</a><a href="./blog/">Journal</a><a href="./tools.html">Tools</a><a href="./compare.html">Compare</a><a href="./methodology.html">Methodology</a></div>';
const CSS='<style id="ts-global-nav-style">.ts-global-nav{max-width:1180px;margin:0 auto;padding:24px 32px;display:flex;justify-content:flex-end;align-items:center;gap:22px;flex-wrap:wrap;border-bottom:1px solid #DDE2DC;font:12px Inter,system-ui,sans-serif}.ts-global-nav a{color:#5F665F;text-decoration:none}.ts-global-nav a:hover{color:#0B0D0C}@media(max-width:700px){.ts-global-nav{justify-content:flex-start;padding:20px;gap:14px}}</style>';
const CANONICAL_LABELS=['Guides','Tools','Compare'];

function publicHtml(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const full=path.join(dir,entry.name);if(entry.isDirectory()){if(['.git','node_modules','reports','docs','data'].includes(entry.name))return[];return publicHtml(full);}return entry.isFile()&&entry.name.endsWith('.html')?[full]:[];});}
function navBlocks(html){return [...html.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)].map(m=>m[0]);}
function hasCanonicalNav(html){return navBlocks(html).some(nav=>CANONICAL_LABELS.every(label=>nav.includes(`>${label}<`)));}
function upgradeBrandedNav(html){return html.replace(/<nav>([\s\S]*?<a class="brand"[\s\S]*?<\/a>)[\s\S]*?<div class="links">[\s\S]*?<\/div><\/nav>/i,`<nav>$1${LINKS}</nav>`);}

let updated=0,skipped=0,existing=0,upgraded=0,injected=0,brandV1=0;
for(const file of publicHtml(ROOT)){
  const rel=path.relative(ROOT,file).replaceAll('\\','/');
  if(SKIP.has(rel)){skipped++;continue;}
  let html=fs.readFileSync(file,'utf8');
  if(!/<body\b/i.test(html)||!/<\/head>/i.test(html)){skipped++;continue;}

  // Brand v1 pages own their navigation. Never prepend the legacy global nav during deployment.
  if(/brand-system\.css/i.test(html)){
    const cleaned=html.replace(/<nav class="ts-global-nav"[\s\S]*?<\/nav>/gi,'').replace(/<style id="ts-global-nav-style">[\s\S]*?<\/style>/gi,'');
    if(cleaned!==html) fs.writeFileSync(file,cleaned,'utf8');
    brandV1++;
    continue;
  }

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
console.log(JSON.stringify({updated,skipped,existing,upgraded,injected,brandV1}));

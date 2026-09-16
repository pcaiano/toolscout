import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const fix=process.argv.includes('--fix');
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const bySlug=new Map(tools.map(tool=>[tool.slug,tool]));

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const favicon=tool=>{try{return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(tool.sourceUrl).hostname)}&sz=128`;}catch{return ''}};

function collectHtml(dir){
  const files=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const full=path.join(dir,entry.name),rel=path.relative(ROOT,full).replaceAll('\\','/');
    if(entry.isDirectory()){
      if(['node_modules','reports','migrations'].includes(entry.name))continue;
      files.push(...collectHtml(full));
      continue;
    }
    if(!entry.name.endsWith('.html'))continue;
    if(/^analytics(?:-|\.|$)/i.test(entry.name)||rel.includes('command-center'))continue;
    files.push(full);
  }
  return files;
}

function classTokens(attrs){
  const raw=attrs.match(/\bclass=(?:"([^"]+)"|'([^']+)')/i)?.slice(1).find(Boolean)||'';
  return new Set(raw.split(/\s+/).filter(Boolean));
}

function toolFromBody(body){
  const match=body.match(/href=(?:"|')[^"']*\/(?:tools|go)\/([a-z0-9-]+)(?:\.html)?(?:[?#][^"']*)?(?:"|')/i);
  return match?bySlug.get(match[1])||null:null;
}

function iconMarkup(tool){
  const src=favicon(tool);
  if(!src)return '';
  return `<span data-software-favicon="1" aria-hidden="true" style="display:inline-flex;align-items:center;vertical-align:middle;margin-right:10px"><img src="${esc(src)}" alt="" width="30" height="30" loading="lazy" decoding="async" style="width:30px;height:30px;object-fit:contain;border-radius:8px;background:#fff;border:1px solid #e4e7ec"></span>`;
}

function enrichArticle(full,attrs,body){
  const classes=classTokens(attrs);
  if(!classes.has('card')&&!classes.has('tool')&&!classes.has('result-card')&&!classes.has('software-card'))return full;
  if(body.includes('data-software-favicon="1"')||body.includes('class="tool-logo"')||body.includes('class="toolLogo"'))return full;
  const tool=toolFromBody(body);
  if(!tool)return full;
  const icon=iconMarkup(tool);
  if(!icon)return full;
  const next=body.replace(/<(h2|h3)([^>]*)>/i,`<$1$2>${icon}`);
  return next===body?full:`<article${attrs}>${next}</article>`;
}

const targets=collectHtml(ROOT);
let changed=0,cards=0,withFavicons=0;
const violations=[];
for(const file of targets){
  const before=fs.readFileSync(file,'utf8');
  let candidates=0;
  for(const match of before.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)){
    const classes=classTokens(match[1]);
    if(!classes.has('card')&&!classes.has('tool')&&!classes.has('result-card')&&!classes.has('software-card'))continue;
    if(toolFromBody(match[2]))candidates++;
  }
  cards+=candidates;
  const after=before.replace(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi,enrichArticle);
  withFavicons+=(after.match(/data-software-favicon="1"/g)||[]).length;
  if(after!==before){
    if(fix){fs.writeFileSync(file,after,'utf8');changed++;}
    else violations.push(path.relative(ROOT,file).replaceAll('\\','/'));
  }
}

if(!fix&&violations.length){
  console.error(JSON.stringify({ok:false,checked:targets.length,cards,withFavicons,violations},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,mode:fix?'fix':'check',checked:targets.length,changed,cards,withFavicons}));

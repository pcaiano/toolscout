import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const fix=process.argv.includes('--fix');
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const pairs=JSON.parse(fs.readFileSync(path.join(ROOT,'data','comparisons.json'),'utf8'));
const bySlug=new Map(tools.map(tool=>[tool.slug,tool]));
const pairByPath=new Map();

for(const [left,right] of pairs){
  const slug=`${left}-vs-${right}`;
  pairByPath.set(`/${slug}`,{left,right});
  pairByPath.set(`/${slug}.html`,{left,right});
}

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const favicon=tool=>{try{return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(tool.sourceUrl).hostname)}&sz=128`;}catch{return ''}};
const iconGroup=({left,right})=>{
  const a=bySlug.get(left),b=bySlug.get(right);
  if(!a||!b)return '';
  const ua=favicon(a),ub=favicon(b);
  if(!ua||!ub)return '';
  return `<span data-comparison-favicons="1" aria-hidden="true" style="display:inline-flex;align-items:center;vertical-align:middle;margin-right:8px"><img src="${esc(ua)}" alt="" width="22" height="22" loading="lazy" decoding="async" style="width:22px;height:22px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #e4e7ec"><img src="${esc(ub)}" alt="" width="22" height="22" loading="lazy" decoding="async" style="width:22px;height:22px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #e4e7ec;margin-left:-5px"></span>`;
};

function comparisonForHref(href){
  if(!href)return null;
  let pathname='';
  try{pathname=new URL(href,'https://trytoolscout.org/').pathname;}catch{return null;}
  if(pathname.length>1)pathname=pathname.replace(/\/$/,'');
  return pairByPath.get(pathname)||null;
}

function transformHtml(html){
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi,(full,attrs,body)=>{
    const href=attrs.match(/\bhref=(?:"([^"]+)"|'([^']+)')/i)?.slice(1).find(Boolean);
    const pair=comparisonForHref(href);
    if(!pair||body.includes('data-comparison-favicons="1"'))return full;
    const icons=iconGroup(pair);
    if(!icons)return full;
    const nextBody=/<strong\b/i.test(body)
      ? body.replace(/<strong([^>]*)>/i,`<strong$1>${icons}`)
      : `${icons}${body}`;
    return `<a${attrs}>${nextBody}</a>`;
  });
}

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

const targets=collectHtml(ROOT);
let changed=0,comparisonLinks=0,withFavicons=0;
const violations=[];
for(const file of targets){
  const before=fs.readFileSync(file,'utf8');
  for(const match of before.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const href=match[1].match(/\bhref=(?:"([^"]+)"|'([^']+)')/i)?.slice(1).find(Boolean);
    if(comparisonForHref(href))comparisonLinks++;
  }
  const after=transformHtml(before);
  withFavicons+=(after.match(/data-comparison-favicons="1"/g)||[]).length;
  if(after!==before){
    if(fix){fs.writeFileSync(file,after,'utf8');changed++;}
    else violations.push(path.relative(ROOT,file).replaceAll('\\','/'));
  }
}

if(!fix&&violations.length){
  console.error(JSON.stringify({ok:false,checked:targets.length,comparisonLinks,violations},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,mode:fix?'fix':'check',checked:targets.length,changed,comparisonLinks,withFavicons}));

import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const fix=process.argv.includes('--fix');
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const bySlug=new Map(tools.map(tool=>[tool.slug,tool]));
const categoryHubs=['crm-tools','seo-tools','marketing-tools','automation-tools','forms-tools','productivity-tools','agency-tools'];
const profileTools=tools.filter(tool=>tool?.slug&&fs.existsSync(path.join(ROOT,'tools',`${tool.slug}.html`)));
const relatedBySlug=new Map(profileTools.map(tool=>[tool.slug,[]]));

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const strip=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const favicon=tool=>{try{return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(tool.sourceUrl).hostname)}&sz=128`;}catch{return ''}};
const normalizedSet=values=>new Set((values||[]).map(value=>String(value).toLowerCase().trim()).filter(Boolean));
const overlap=(a,b)=>{const right=normalizedSet(b);return [...normalizedSet(a)].filter(value=>right.has(value)).length;};

function addRelated(from,to){
  if(!from||!to||from.slug===to.slug)return;
  const list=relatedBySlug.get(from.slug);
  if(!list||list.some(item=>item.slug===to.slug))return;
  list.push(to);
}

const categories=new Map();
for(const tool of profileTools){
  const key=String(tool.category||'software');
  if(!categories.has(key))categories.set(key,[]);
  categories.get(key).push(tool);
}
for(const group of categories.values()){
  group.sort((a,b)=>a.slug.localeCompare(b.slug));
  if(group.length>1){
    for(let index=0;index<group.length;index++){
      for(let offset=1;offset<group.length&&offset<=4;offset++)addRelated(group[index],group[(index+offset)%group.length]);
    }
    continue;
  }
  const singleton=group[0];
  const peers=profileTools.filter(candidate=>candidate.slug!==singleton.slug).map(candidate=>({
    candidate,
    score:overlap(singleton.features,candidate.features)*4+overlap(singleton.bestFor,candidate.bestFor)*3+overlap(Object.keys(singleton.scores||{}).filter(key=>Number(singleton.scores?.[key]||0)>=8),Object.keys(candidate.scores||{}).filter(key=>Number(candidate.scores?.[key]||0)>=8))
  })).sort((a,b)=>b.score-a.score||a.candidate.name.localeCompare(b.candidate.name)).slice(0,4).map(item=>item.candidate);
  for(const peer of peers){
    addRelated(singleton,peer);
    addRelated(peer,singleton);
  }
}

function collectHtml(dir){
  const files=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const full=path.join(dir,entry.name);
    const rel=path.relative(ROOT,full).replaceAll('\\','/');
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

function ensureFavicon(html){
  if(/<link\b[^>]*rel=["'][^"']*icon[^"']*["']/i.test(html))return html;
  return html.replace(/<head>/i,'<head><link rel="icon" href="/favicon.svg" type="image/svg+xml">');
}

function optimizeTitle(html,rel){
  const titleMatch=html.match(/<title>([\s\S]*?)<\/title>/i);
  if(!titleMatch)return html;
  const current=strip(titleMatch[1]);
  if(current.length<=65)return html;
  const h1=strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  let next='';
  const toolMatch=rel.match(/^tools\/([a-z0-9-]+)\.html$/i);
  if(toolMatch){
    const tool=bySlug.get(toolMatch[1]);
    if(tool){
      next=`${tool.name}: Features & Pricing | ToolScout`;
      if(next.length>65)next=`${tool.name} Software | ToolScout`;
    }
  } else if(/^best-[^/]+\.html$/i.test(rel)&&h1){
    next=`${h1} | ToolScout`;
  } else if(/^[a-z0-9-]+-vs-[a-z0-9-]+\.html$/i.test(rel)&&h1){
    next=`${h1} Comparison | ToolScout`;
  }
  if(!next||next.length>65)return html;
  return html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${esc(next)}</title>`);
}

function relatedToolSection(tool){
  const peers=(relatedBySlug.get(tool.slug)||[]).slice(0,5);
  if(!peers.length)return '';
  const cards=peers.map(peer=>{
    const logo=favicon(peer);
    return `<a href="/tools/${encodeURIComponent(peer.slug)}" style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:14px;text-decoration:none;color:#101828"><img src="${esc(logo)}" alt="" width="28" height="28" loading="lazy" decoding="async" aria-hidden="true" style="width:28px;height:28px;object-fit:contain;border-radius:7px;background:#fff;border:1px solid #e4e7ec"><span><strong style="display:block">${esc(peer.name)}</strong><small style="color:#667085">${esc(peer.category)} software</small></span></a>`;
  }).join('');
  return `<!-- TOOLSCOUT_RELATED_TOOLS_START --><section class="section" data-toolscout-related-tools="1"><h2>Related software</h2><p class="small">Explore nearby options based on category and catalog fit.</p><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${cards}</div></section><!-- TOOLSCOUT_RELATED_TOOLS_END -->`;
}

function enrichToolProfile(html,rel){
  const match=rel.match(/^tools\/([a-z0-9-]+)\.html$/i);
  if(!match)return html;
  const tool=bySlug.get(match[1]);
  if(!tool)return html;
  const section=relatedToolSection(tool);
  if(!section)return html;
  const marker=/<!-- TOOLSCOUT_RELATED_TOOLS_START -->[\s\S]*?<!-- TOOLSCOUT_RELATED_TOOLS_END -->/i;
  if(marker.test(html))return html.replace(marker,section);
  const faq=/<section class="section"><h2>Frequently asked questions<\/h2>/i;
  if(faq.test(html))return html.replace(faq,`${section}$&`);
  return html.replace(/<\/body>/i,`${section}</body>`);
}

function enrichCategoryHub(html,rel){
  const base=rel.replace(/\.html$/i,'');
  if(!categoryHubs.includes(base))return html;
  const links=categoryHubs.filter(slug=>slug!==base).map(slug=>`<a href="/${slug}" style="display:inline-block;margin:4px 8px 4px 0;padding:8px 10px;border:1px solid #e4e7ec;border-radius:10px;text-decoration:none;color:#344054">${esc(slug.replace(/-tools$/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))}</a>`).join('');
  const section=`<!-- TOOLSCOUT_CATEGORY_CROSSLINKS_START --><section style="margin-top:36px;padding-top:24px;border-top:1px solid #e4e7ec"><h2>Browse software categories</h2><div>${links}</div></section><!-- TOOLSCOUT_CATEGORY_CROSSLINKS_END -->`;
  const marker=/<!-- TOOLSCOUT_CATEGORY_CROSSLINKS_START -->[\s\S]*?<!-- TOOLSCOUT_CATEGORY_CROSSLINKS_END -->/i;
  if(marker.test(html))return html.replace(marker,section);
  return html.replace(/<\/body>/i,`${section}</body>`);
}

const files=collectHtml(ROOT);
let changed=0,faviconsAdded=0,titlesShortened=0,toolProfilesEnriched=0,categoryHubsEnriched=0;
const violations=[];
for(const file of files){
  const rel=path.relative(ROOT,file).replaceAll('\\','/');
  const before=fs.readFileSync(file,'utf8');
  let after=before;
  const hadFavicon=/<link\b[^>]*rel=["'][^"']*icon[^"']*["']/i.test(after);
  after=ensureFavicon(after);
  if(!hadFavicon&&after!==before)faviconsAdded++;
  const beforeTitle=strip(after.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'');
  after=optimizeTitle(after,rel);
  const afterTitle=strip(after.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'');
  if(beforeTitle!==afterTitle)titlesShortened++;
  const beforeTools=after;
  after=enrichToolProfile(after,rel);
  if(beforeTools!==after)toolProfilesEnriched++;
  const beforeHubs=after;
  after=enrichCategoryHub(after,rel);
  if(beforeHubs!==after)categoryHubsEnriched++;
  if(after!==before){
    if(fix){fs.writeFileSync(file,after,'utf8');changed++;}
    else violations.push(rel);
  }
}

if(!fix&&violations.length){
  console.error(JSON.stringify({ok:false,checked:files.length,violations:violations.slice(0,100)},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,mode:fix?'fix':'check',checked:files.length,changed,faviconsAdded,titlesShortened,toolProfilesEnriched,categoryHubsEnriched}));

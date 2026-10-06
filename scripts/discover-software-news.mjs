import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const FEED_FILE=path.join(ROOT,'data','software-updates.json');
const SOURCE_FILE=path.join(ROOT,'data','editorial-news-sources.json');
const REPORT_FILE=path.join(ROOT,'reports','editorial-news-engine.json');
const WHATS_NEW_FILE=path.join(ROOT,'whats-new.html');
const NEWS_DIR=path.join(ROOT,'news');
const BASE='https://trytoolscout.org';
const LOOKBACK_DAYS=14;
const MAX_TOTAL=4;
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const organicConfig=readJson(path.join(ROOT,'data','organic-growth-engine.json'),{});
const editorialQuality=organicConfig?.editorialQuality||{};
const editorialQualityFor=pagePath=>editorialQuality.rollout==='full'||(editorialQuality.rollout==='pilot'&&(editorialQuality.pilotPaths||[]).includes(pagePath));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const strip=v=>String(v??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
const slugify=v=>strip(v).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,92).replace(/-$/,'');
const sentence=v=>{const s=strip(v);const m=s.match(/^(.{60,360}?[.!?])(?:\s|$)/);return (m?.[1]||s.slice(0,320)).trim();};
const isoDate=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null;};
const ageDays=date=>(Date.now()-Date.parse(date+'T12:00:00Z'))/86400000;
const safeUrl=(u,base)=>{try{return new URL(u,base).href}catch{return null}};
const hostOf=u=>{try{return new URL(u).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}};
const tag=(block,name)=>{const m=String(block).match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return m?strip(m[1]):'';};
const attr=(block,name,attrName)=>{const m=String(block).match(new RegExp("<"+name+"[^>]*\\s"+attrName+"=[\\\"']([^\\\"']+)[\\\"'][^>]*>","i"));return m?m[1]:'';};

async function fetchText(url){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),12000);
  try{
    const r=await fetch(url,{headers:{'User-Agent':'ToolScout Editorial News Engine/2.0 (+https://trytoolscout.org)','Accept':'application/rss+xml,application/atom+xml,text/xml,text/html;q=0.9,*/*;q=0.2'},redirect:'follow',signal:ctl.signal});
    if(!r.ok)throw new Error('http_'+r.status);
    return {url:r.url,text:await r.text(),contentType:r.headers.get('content-type')||''};
  }finally{clearTimeout(timer);}
}

function parseFeed(raw,source){
  const blocks=[...String(raw).matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m=>m[2]);
  const out=[];
  for(const block of blocks){
    const title=tag(block,'title');
    const link=attr(block,'link','href')||tag(block,'link')||tag(block,'guid');
    const published=tag(block,'pubDate')||tag(block,'published')||tag(block,'updated')||tag(block,'dc:date');
    const description=tag(block,'description')||tag(block,'summary')||tag(block,'content:encoded')||tag(block,'content');
    const url=safeUrl(link,source.url),date=isoDate(published);
    if(title&&url&&date)out.push({title,url,date,description:sentence(description)});
  }
  return out;
}

function parseLinkedHtml(raw,source){
  const out=[];
  const pattern=source.linkPattern?new RegExp(source.linkPattern,'i'):null;
  const seen=new Set();
  for(const m of String(raw).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const href=safeUrl(m[1],source.url),title=strip(m[2]);
    if(!href||!title||title.length<18||title.length>180||seen.has(href))continue;
    if(pattern&&!pattern.test(new URL(href).pathname))continue;
    const start=Math.max(0,m.index-700),end=Math.min(raw.length,m.index+m[0].length+900),context=raw.slice(start,end);
    let date=null;
    const pathDate=new URL(href).pathname.match(/(20\d{2})[-/](\d{2})[-/](\d{2})/);
    if(pathDate)date=pathDate[1]+'-'+pathDate[2]+'-'+pathDate[3];
    if(!date){
      const dt=context.match(/datetime=["']([^"']+)["']/i);
      if(dt)date=isoDate(dt[1]);
    }
    if(!date){
      const human=context.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+20\d{2}\b/i);
      if(human)date=isoDate(human[0]);
    }
    if(!date)continue;
    seen.add(href);
    const contextText=strip(context).replace(title,'').trim();
    out.push({title,url:href,date,description:sentence(contextText)});
  }
  return out;
}

function classify(text){
  const s=String(text||'').toLowerCase();
  if(/sunset|retir|deprecat|shut down|end of life|discontinu/.test(s))return'product_retirement';
  if(/price|pricing|plan|billing|packag|starter|free tier|seat/.test(s))return'pricing_packaging';
  if(/security|vulnerab|authentication|mfa|permission|access control|advisory|ssh|compliance/.test(s))return'security_governance';
  if(/mcp|connector|integration|api|slack|teams|interoperab/.test(s))return'integrations_connectivity';
  if(/\bai\b|agent|copilot|automation|workflow|model/.test(s))return'ai_automation';
  return'product_capability';
}

function materiality(item,source){
  const text=(item.title+' '+item.description).toLowerCase();
  if(source.includePattern&&!new RegExp(source.includePattern,'i').test(text))return -99;
  if(source.excludePattern&&new RegExp(source.excludePattern,'i').test(text))return -99;
  if(/webinar|conference|event|customer stor|case study|podcast|funding|grant|career|hiring|technical talks|updated integrations/.test(text)&&!/security|vulnerab|sunset|retir|pricing|plan/.test(text))return -99;
  let score=0;
  if(/introduc|launch|generally available|public preview|beta|new design|redesign|sunset|retir|deprecat|pricing|plan|security|vulnerab|agent|copilot|mcp|connector|automation/.test(text))score+=4;
  if(/workflow|governance|permission|authentication|integration|api|model|crm|reporting|analytics|billing|enterprise|starter/.test(text))score+=2;
  if(item.description&&item.description.length>=90)score+=1;
  return score;
}

function editorialTextLegacy(type,tool,item){
  const changed=item.description&&item.description.length>=55
    ? item.description
    : `${tool} published an official product update titled "${item.title}". ToolScout records the primary source internally for editorial verification.`;
  const why={
    product_retirement:'Retirements and deprecations can change migration risk, continuity and the cost of keeping an existing workflow in place.',
    pricing_packaging:'Packaging and plan changes can alter total cost, feature access and which customer segment a product fits best.',
    security_governance:'Security and governance changes affect how confidently teams can deploy the product, especially where permissions, sensitive data or regulated workflows matter.',
    integrations_connectivity:'Integration changes can materially affect workflow architecture, switching costs and whether the product fits an existing stack.',
    ai_automation:'AI and automation releases can change the scope of work the product can handle, but buyers still need to validate control, reliability and plan availability.',
    product_capability:'Material capability changes can shift product fit and may change which tools belong on a buyer shortlist.'
  }[type];
  const availability=/public preview|beta/i.test(item.title+' '+item.description)
    ? 'The vendor describes at least part of this change as preview or beta, so buyers should validate production readiness and current plan eligibility.'
    : /generally available|\bga\b/i.test(item.title+' '+item.description)
      ? 'The vendor describes the change as generally available, but buyers should still verify plan eligibility and any account-specific rollout conditions.'
      : 'Buyers should verify current availability, plan requirements and implementation details in the vendor documentation before changing a production workflow.';
  return {changed,why,availability};
}

function editorialTextV2(type,tool,item){
  const detail=item.description&&item.description.length>=55?item.description:`${tool} published an official update titled "${item.title}".`;
  const lower=(item.title+' '+item.description).toLowerCase();
  const angle=/advertis|attribution|brand suitab/.test(lower)?'For software buyers, the notable shift is that the product is becoming a commercial surface as well as a working tool.':/shut down|retir|deprecat/.test(lower)?'The important point is continuity: buyers need to separate the capability that is disappearing from the workflows the vendor is keeping alive.':/branch|recovery|error|human reply|agentic/.test(lower)?'The meaningful change is execution depth rather than another layer of AI branding.':/mcp|connector|integration|api/.test(lower)?'The buyer question is interoperability: this update changes how the product can fit into an existing stack.':'The useful reading of this release is what it changes in the buying decision, not the announcement itself.';
  const changed=cleanNews(`${detail} ${angle}`);
  const whyMap={
    product_retirement:`For teams already using ${tool}, this changes migration and continuity risk. For new buyers, it removes a use case that should no longer influence the shortlist.`,
    pricing_packaging:`The product may now fit a different budget or customer segment, so previous pricing assumptions should not be carried into a new evaluation.`,
    security_governance:`This matters most where deployment depends on permissions, sensitive data, auditability or regulated workflows.`,
    integrations_connectivity:`Integration architecture affects switching cost and the amount of custom work required to make the product useful in a real stack.`,
    ai_automation:`The release expands what ${tool} can potentially do, but the decision still depends on control, reliability, rollout status and whether the capability is available on the plan being evaluated.`,
    product_capability:`The update can move ${tool} up or down a shortlist if the changed capability is central to the workflow being bought.`
  };
  const preview=/public preview|beta|early access/i.test(item.title+' '+item.description);
  const availability=preview?`This is not a reason to treat the capability as production-ready by default. Buyers should test the specific workflow, confirm plan access and understand what is still preview-only before relying on it.`:`Buyers should verify the current rollout, plan eligibility and implementation details against the vendor documentation before changing a production workflow.`;
  return {changed,why:whyMap[type],availability};
}
function cleanNews(v){return String(v??'').replace(/[\u2013\u2014]/g,'-').replace(/\s+/g,' ').trim();}
function editorialText(type,tool,item,pagePath){const override=editorialQuality?.newsOverrides?.[pagePath];if(override)return {changed:cleanNews(override.changed),why:cleanNews(override.why),availability:cleanNews(override.availability)};return editorialQualityFor(pagePath)?editorialTextV2(type,tool,item):editorialTextLegacy(type,tool,item);}
function labelFor(type){
  return {
    product_retirement:'Product retirement',
    pricing_packaging:'Pricing and packaging update',
    security_governance:'Security update',
    integrations_connectivity:'Integration update',
    ai_automation:'AI and automation update',
    product_capability:'Official product update'
  }[type];
}

function renderArticle({id,item,source,type,summary}){
  const tool=source.toolName;
  const articleUrl=`${BASE}/news/${id}.html`;
  const profile=`/tools/${source.toolSlug}.html`;
  const pagePath=`news/${id}.html`;
  const t=editorialText(type,tool,item,pagePath);
  const dateLabel=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(item.date+'T12:00:00Z'));
  const schema={'@context':'https://schema.org','@type':'NewsArticle',headline:item.title,description:summary,datePublished:item.date,dateModified:item.date,mainEntityOfPage:articleUrl,publisher:{'@type':'Organization',name:'ToolScout',url:BASE+'/'},about:{'@type':'SoftwareApplication',name:tool,url:BASE+profile},citation:item.url||undefined,isBasedOn:item.url||undefined};
  return `<!doctype html><html lang="en"><head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(item.title)} | ToolScout</title><meta name="description" content="${esc(summary)}"><link rel="canonical" href="${articleUrl}"><meta name="robots" content="index,follow"><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style>:root{font-family:Inter,system-ui,sans-serif;color:#101828;background:#f5f7fb;line-height:1.6}body{margin:0}.wrap{max-width:850px;margin:auto;padding:28px 22px 84px}.top{display:flex;justify-content:space-between;gap:18px}.brand{font-size:23px;font-weight:850;color:#101828;text-decoration:none}.top nav{display:flex;gap:12px;flex-wrap:wrap}.top nav a{font-size:13px;color:#667085;text-decoration:none}.hero{padding:70px 0 24px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.13em;color:#667085;font-weight:800}h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:14px 0 18px}.lead{font-size:19px;color:#667085}.article h2{font-size:28px;margin:38px 0 8px}.article p{font-size:17px;color:#475467;line-height:1.75}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:34px 0}.btn{display:inline-flex;padding:11px 14px;border-radius:11px;text-decoration:none;font-weight:800;font-size:13px;background:#101828;color:#fff}.btn.secondary{background:#fff;color:#101828;border:1px solid #dfe4ea}.source{margin-top:42px;padding-top:24px;border-top:1px solid #e4e7ec;color:#667085;font-size:13px}.source a{color:#344054;font-weight:750}.back{display:inline-block;margin-top:30px;color:#475467;text-decoration:none;font-weight:750}</style></head><body${editorialQualityFor(pagePath)?` data-editorial-quality="${editorialQuality.rollout==='pilot'?'pilot':'full'}"`:''}><div class="wrap article"><div class="top"><a class="brand" href="/">ToolScout</a><nav><a href="/whats-new.html">What's new</a><a href="/software-trends-index.html">Software trends</a><a href="/compare.html">Compare</a><a href="/tools.html">Tools</a></nav></div><main><header class="hero"><div class="eyebrow">${esc(labelFor(type))} · ${esc(dateLabel)}</div><h1>${esc(item.title)}</h1><p class="lead">${esc(summary)}</p></header><h2>What changed</h2><p>${esc(t.changed)}</p><h2>Why it matters</h2><p>${esc(t.why)}</p><h2>Buyer takeaway</h2><p>${esc(t.availability)}</p><div class="actions"><a class="btn secondary" href="${profile}">${esc(tool)} profile</a><a class="btn" href="/go/${esc(source.toolSlug)}?source=software-news" target="_blank" rel="nofollow sponsored noopener">Visit ${esc(tool)}</a></div><div class="source">Primary source: ${esc(source.sourceName)}. ToolScout selects updates for buyer relevance and writes independent analysis. Affiliate relationships do not determine coverage.</div><a class="back" href="/whats-new.html">More software news</a></main></div></body></html>`;
}

function renderWhatsNew(feed){
  const rows=(feed.items||[]).filter(x=>/^\/news\//.test(String(x.articleUrl||''))).slice().sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,14);
  const cards=rows.map(x=>`<a class="card" href="${esc(x.articleUrl)}"><div class="meta">${esc(x.label)} · ${esc(new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(x.publishedAt+'T12:00:00Z')))}</div><h2>${esc(x.title)}</h2><p>${esc(x.summary)}</p><span class="more">Read article</span></a>`).join('');
  const list=rows.map((x,i)=>({'@type':'ListItem',position:i+1,url:BASE+x.articleUrl,name:x.title}));
  const schema={'@context':'https://schema.org','@type':'CollectionPage',name:"What's New in Software | ToolScout",url:BASE+'/whats-new.html',description:'Curated software news, releases and product changes selected for buyer relevance.',mainEntity:{'@type':'ItemList',itemListElement:list}};
  return `<!doctype html><html lang="en"><head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>What's New in Software | ToolScout</title><meta name="description" content="Curated software news, releases and product changes selected for buyer relevance by ToolScout."><link rel="canonical" href="${BASE}/whats-new.html"><meta name="robots" content="index,follow"><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style>:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#101828;background:#f5f7fb;line-height:1.55}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1000px;margin:auto;padding:28px 22px 84px}.top{display:flex;justify-content:space-between;gap:18px;align-items:center}.brand{font-size:23px;font-weight:850;letter-spacing:-.04em;color:#101828;text-decoration:none}.top nav{display:flex;gap:12px;flex-wrap:wrap}.top nav a{font-size:13px;color:#667085;text-decoration:none}.hero{padding:70px 0 36px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.13em;color:#667085;font-weight:800}h1{font-size:clamp(46px,7vw,72px);line-height:1;letter-spacing:-.055em;margin:14px 0 18px}.lead{font-size:19px;color:#667085;line-height:1.65;max-width:780px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{background:#fff;border:1px solid #e4e7ec;border-radius:20px;padding:22px;color:#101828;text-decoration:none;box-shadow:0 10px 28px rgba(16,24,40,.05)}.card:hover{border-color:#cfd6df}.meta{font-size:11px;color:#98a2b3;text-transform:uppercase;letter-spacing:.08em;font-weight:800}.card h2{font-size:24px;line-height:1.15;letter-spacing:-.035em;margin:12px 0 10px}.card p{color:#667085;margin:0 0 18px}.more{font-size:13px;font-weight:800}.policy{margin-top:36px;padding:20px;background:#fff;border:1px solid #e4e7ec;border-radius:18px;color:#667085}@media(max-width:700px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}</style></head><body><div class="wrap"><div class="top"><a class="brand" href="/">ToolScout</a><nav><a href="/compare.html">Compare</a><a href="/guides.html">Guides</a><a href="/tools.html">Tools</a><a href="/software-trends-index.html">Software trends</a></nav></div><main><header class="hero"><div class="eyebrow">Curated software news</div><h1>What's new in software.</h1><p class="lead">Material releases, platform changes and product developments selected for people making software decisions. Primary sources come first, and affiliate relationships never determine coverage.</p></header><section class="grid">${cards||'<div class="card"><h2>No material updates selected yet.</h2><p>The engine checks official product sources daily.</p></div>'}</section><div class="policy"><strong>Editorial bar:</strong> ToolScout skips routine marketing, rumours, thin announcements and duplicate stories. Coverage focuses on changes that can affect product fit, workflow, interoperability, pricing, governance or adoption. Affiliate status never determines inclusion or prominence.</div></main></div></body></html>`;
}

const feed=readJson(FEED_FILE,{version:2,updatedAt:null,editorialPolicy:'Updates are selected for buyer relevance. Affiliate status, commission and partner relationships do not influence inclusion or placement.',items:[]});
const sources=readJson(SOURCE_FILE,{sources:[]}).sources||[];
const existingUrls=new Set((feed.items||[]).map(x=>String(x.sourceUrl||'')).filter(Boolean));
const existingIds=new Set((feed.items||[]).map(x=>String(x.id||'')).filter(Boolean));
const sourceResults=[];
const candidates=[];

let refreshedArchive=0;
if(editorialQuality.rollout==='full'){
  fs.mkdirSync(NEWS_DIR,{recursive:true});
  for(const row of feed.items||[]){
    const rel=String(row.articleUrl||'').replace(/^\//,'');
    if(!/^news\/[a-z0-9-]+\.html$/i.test(rel))continue;
    const id=path.basename(rel,'.html');
    const source={toolName:row.toolName,toolSlug:row.toolSlug,sourceName:row.sourceName||'Official vendor source'};
    const item={title:row.title,date:row.publishedAt,description:row.summary||'',url:row.sourceUrl||''};
    const type=classify(row.title+' '+(row.summary||''));
    const html=renderArticle({id,item,source,type,summary:row.summary||sentence(row.title)});
    const file=path.join(ROOT,rel);
    if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==html){fs.writeFileSync(file,html,'utf8');refreshedArchive++;}
  }
}

for(const source of sources){
  try{
    const fetched=await fetchText(source.url);
    const host=hostOf(fetched.url);
    if(!Array.isArray(source.allowedHosts)||!source.allowedHosts.some(h=>host===h||host.endsWith('.'+h)))throw new Error('unexpected_source_host:'+host);
    const parsed=source.parser==='html-linked'?parseLinkedHtml(fetched.text,source):parseFeed(fetched.text,source);
    const recent=parsed.filter(x=>ageDays(x.date)>=-1&&ageDays(x.date)<=LOOKBACK_DAYS).filter(x=>!existingUrls.has(x.url)).map(x=>({...x,source,score:materiality(x,source)})).filter(x=>x.score>=4).sort((a,b)=>b.date.localeCompare(a.date)||b.score-a.score).slice(0,Number(source.maxPerRun||1));
    sourceResults.push({id:source.id,status:'ok',fetched:fetched.url,parsed:parsed.length,recent:recent.length});
    candidates.push(...recent);
  }catch(error){
    sourceResults.push({id:source.id,status:'error',error:String(error?.message||error)});
  }
}

candidates.sort((a,b)=>b.date.localeCompare(a.date)||b.score-a.score);
const selected=candidates.slice(0,MAX_TOTAL);
const published=[];
fs.mkdirSync(NEWS_DIR,{recursive:true});
for(const row of selected){
  let id=slugify(row.source.toolSlug+'-'+row.title);
  if(!id)continue;
  let n=2,base=id;
  while(existingIds.has(id)&&!existingUrls.has(row.url))id=base+'-'+n++;
  if(existingIds.has(id)||existingUrls.has(row.url))continue;
  const type=classify(row.title+' '+row.description);
  const summary=sentence(row.description)||`${row.source.toolName} published a product update that may affect how buyers evaluate the software.`;
  const articleUrl=`/news/${id}.html`;
  const file=path.join(NEWS_DIR,id+'.html');
  fs.writeFileSync(file,renderArticle({id,item:row,source:row.source,type,summary}),'utf8');
  feed.items.unshift({
    id,publishedAt:row.date,toolSlug:row.source.toolSlug,toolName:row.source.toolName,label:labelFor(type),title:row.title,summary,
    sourceName:row.source.sourceName,sourceUrl:row.url,articleUrl,profileUrl:articleUrl,outboundUrl:null,outboundLabel:null,partnerUpdate:false
  });
  existingIds.add(id);existingUrls.add(row.url);
  published.push({id,date:row.date,toolSlug:row.source.toolSlug,title:row.title,sourceUrl:row.url,score:row.score});
}
feed.items=(feed.items||[]).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))).slice(0,120);
if(published.length)feed.updatedAt=new Date().toISOString();
fs.writeFileSync(FEED_FILE,JSON.stringify(feed,null,2)+'\n');
fs.writeFileSync(WHATS_NEW_FILE,renderWhatsNew(feed),'utf8');
fs.mkdirSync(path.dirname(REPORT_FILE),{recursive:true});
const lastNews=(feed.items||[]).filter(x=>/^\/news\//.test(String(x.articleUrl||''))).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')))[0]||null;
const report={generatedAt:new Date().toISOString(),engine:'ToolScout Editorial News Engine v2',lookbackDays:LOOKBACK_DAYS,maxPerRun:MAX_TOTAL,sources:sourceResults,candidates:candidates.length,published,refreshedArchive,lastPublishedAt:lastNews?.publishedAt||null,status:sourceResults.some(x=>x.status==='ok')?'healthy':'degraded'};
fs.writeFileSync(REPORT_FILE,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

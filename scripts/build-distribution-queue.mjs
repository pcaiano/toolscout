import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntents } from './seo-intent-loader.mjs';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const intents=loadSeoIntents(ROOT).filter(item=>item?.slug&&fs.existsSync(path.join(ROOT,`${item.slug}.html`)));
const growthPath=path.join(ROOT,'reports','growth-priority.json');
const growth=fs.existsSync(growthPath)?JSON.parse(fs.readFileSync(growthPath,'utf8')):{items:[]};
const growthByIntent=new Map((growth.items||[]).filter(x=>x?.intent).map(x=>[x.intent,x]));
const routingPath=path.join(ROOT,'reports','search-commercial-routing.json');
const routing=fs.existsSync(routingPath)?JSON.parse(fs.readFileSync(routingPath,'utf8')):{priorities:[]};
const routingByPath=new Map((routing.priorities||[]).filter(x=>x?.pathname).map(x=>[String(x.pathname).replace(/\.html$/i,'').replace(/\/$/,'')||'/',x]));
const commercialIntent = slug => /crm|seo|marketing|agency|automation|lead|sales|email|project|funnel/i.test(String(slug||'')) ? 25 : 10;
const categoryPriority = category => ({crm:5,seo:5,marketing:4,business:4,automation:5,forms:3})[category] || 1;
const searchDemandBoost = signal => {
  if(!signal)return 0;
  const impressions=Math.max(0,Number(signal.impressions||0));
  const clicks=Math.max(0,Number(signal.clicks||0));
  const position=Math.max(0,Number(signal.position||0));
  const meaningful=Boolean(signal.meaningfulSample)||impressions>=20||clicks>0;
  if(!meaningful&&position>0&&position<=10)return 8;
  if(!meaningful)return Math.min(5,Math.round(impressions));
  let boost=Math.min(30,Math.round(Math.log2(impressions+1)*4));
  if(clicks>0)boost+=Math.min(12,clicks*4);
  if(position>0&&position<=20)boost+=12;
  else if(position<=40)boost+=8;
  else if(position<=70)boost+=5;
  else if(position>70)boost+=3;
  return Math.min(45,boost);
};
const pages=[];
const seen=new Set();
function pushPage(page){
  const key=String(page.url||'').replace(/\.html(?=$|\?)/i,'');
  if(!key||seen.has(key))return;
  seen.add(key);pages.push(page);
}
for(const item of intents){
  const title=item.title||String(item.slug).replace(/^best-/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const description=item.description||`Tool recommendations for ${title.toLowerCase()}.`;
  const pathname=`/${item.slug}`;
  const url=`${BASE}${pathname}`;
  const short=description.length>180?`${description.slice(0,177)}...`:description;
  const growthItem=growthByIntent.get(item.slug)||null;
  const signal=growthItem?.searchSignal||null;
  const route=routingByPath.get(pathname)||null;
  const demandBoost=Math.max(searchDemandBoost(signal),route?Math.min(45,Math.round(Number(route.priorityScore||0)/3)):0);
  const priorityScore=commercialIntent(item.slug)+categoryPriority(item.category)+demandBoost+(route?.monetized?5:0);
  pushPage({assetType:'guide',slug:item.slug,title,url,category:item.category||'software',priorityScore,demandBoost,searchDemand:route?{impressions:Number(route.impressions||0),clicks:Number(route.clicks||0),position:Number(route.position||0),lane:route.lane,monetized:Boolean(route.monetized)}:signal?{impressions:Number(signal.impressions||0),clicks:Number(signal.clicks||0),position:Number(signal.position||0),opportunity:signal.opportunity||null,meaningfulSample:Boolean(signal.meaningfulSample)}:null,distributionReason:route?`Page-level GSC routing lane: ${route.lane}. Distribution supports an already observed page rather than creating a new surface.`:demandBoost>0?'Observed search demand increases distribution priority. Low-sample first-page pages receive only a protected bounded boost.':'Commercial and category priority only.',searchSnippet:`${title} - ${short}`,socialHook:`Need the right tool for ${title.toLowerCase()}? ToolScout compares options around the job, not generic rankings.`,linkedInPost:`Need the right tool for ${title.toLowerCase()}? I built a practical ToolScout guide that compares the available options around the job, budget and workflow, not a generic top-ten list.\n\n${url}`,xPost:`Choosing a tool for ${title.toLowerCase()}? ToolScout compares the options around the job, not generic rankings. ${url}`,redditStyle:`I put together a practical guide for ${title.toLowerCase()}, focused on fit rather than a generic top-ten list.`,newsletterSubject:`${title}: a practical shortlist`,newsletterIntro:`${short} See the shortlist and compare the options: ${url}`,hashtags:['#software','#AITools','#productivity','#ToolScout']});
}

for(const route of (routing.priorities||[]).slice(0,30)){
  if(!route?.pathname||!['tool-profile','comparison'].includes(route.type))continue;
  const pathname=String(route.pathname).replace(/\.html$/i,'');
  const file=path.join(ROOT,`${pathname.replace(/^\//,'')}.html`);
  if(!fs.existsSync(file))continue;
  const html=fs.readFileSync(file,'utf8');
  const title=(html.match(/<title>([^<]+)<\/title>/i)?.[1]||pathname.split('/').pop().replace(/-/g,' ')).replace(/\s*\|\s*ToolScout.*$/i,'').trim();
  const description=html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1]||`Independent ToolScout decision page for ${title}.`;
  const url=`${BASE}${pathname}`;
  const priorityScore=Math.round(Number(route.priorityScore||0)+20+(route.monetized?8:0));
  pushPage({assetType:route.type,slug:pathname.split('/').pop(),title,url,category:'software',priorityScore,demandBoost:Math.min(50,Math.round(Number(route.priorityScore||0)/2)),searchDemand:{impressions:Number(route.impressions||0),clicks:Number(route.clicks||0),position:Number(route.position||0),lane:route.lane,monetized:Boolean(route.monetized),monetizedSlugs:route.monetizedSlugs||[]},distributionReason:`Direct page distribution selected by GSC routing lane ${route.lane}. This strengthens an existing page with observed demand.`,searchSnippet:description,socialHook:`ToolScout updated its decision context for ${title}. Here is the page and the criteria behind it.`,linkedInPost:`ToolScout updated its decision context for ${title}. The page is based on documented capabilities and observed search demand, with ranking kept separate from affiliate relationships.\n\n${url}`,xPost:`Updated ToolScout decision context for ${title}: ${url}`,redditStyle:`I updated this ToolScout page around the practical decision criteria people are actually searching for.`,newsletterSubject:`ToolScout update: ${title}`,newsletterIntro:`${description} ${url}`,hashtags:['#software','#ToolScout']});
}

const linkablePath=path.join(ROOT,'reports','linkable-assets.json');
const linkable=fs.existsSync(linkablePath)?JSON.parse(fs.readFileSync(linkablePath,'utf8')):{items:[]};
for(const asset of linkable.items||[]){
  if(asset?.assetType!=='original_research'||!/^https:\/\/trytoolscout\.org\//.test(String(asset.url||'')))continue;
  pushPage({assetType:'original_research',slug:asset.id||'original-research',title:asset.title||'ToolScout original research',url:asset.url,category:'research',priorityScore:Number(asset.priority||96),demandBoost:0,searchDemand:null,distributionReason:'Original first-party research is prioritized for legitimate editorial references, communities, AI discovery and page-indexing surfaces. Product-directory submissions continue to use the ToolScout product profile.',searchSnippet:`${asset.title}. Verified first-party ToolScout observations with explicit methodology and a public dataset.`,socialHook:`New ToolScout first-party research: ${asset.title}. The methodology and public dataset are included so every claim can be checked.`,linkedInPost:`New first-party research from ToolScout: ${asset.title}.\n\nThe report separates observed Search Console visibility, verified catalog coverage and editorial shortlist frequency. It does not claim global market share or software popularity.\n\n${asset.url}`,xPost:`New ToolScout first-party research with a public methodology and dataset: ${asset.title}. ${asset.url}`,redditStyle:`I published a ToolScout first-party software snapshot with the methodology and public dataset included. The metrics are deliberately limited to what ToolScout can verify.`,newsletterSubject:asset.title,newsletterIntro:`Verified ToolScout first-party observations with explicit scope, source gates and a public JSON dataset: ${asset.url}`,hashtags:['#software','#research','#AITools','#ToolScout']});
}

pages.sort((a,b)=>b.priorityScore-a.priorityScore||b.demandBoost-a.demandBoost||a.title.localeCompare(b.title));
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','distribution-queue.json'),JSON.stringify({generatedAt:new Date().toISOString(),count:pages.length,policy:'Only editorially verified assets are eligible for distribution. Page-level Search Console demand chooses which existing pages deserve attention. Monetization can increase measurement urgency but never changes editorial ranking. Original research can be promoted to editorial, community and indexing surfaces, while product directories continue to receive the ToolScout product profile.',items:pages},null,2)+'\n');
console.log(JSON.stringify({queued:pages.length,originalResearch:pages.filter(x=>x.assetType==='original_research').length,directSearchPages:pages.filter(x=>['tool-profile','comparison'].includes(x.assetType)).length,top:pages[0]?.title||null,topPriority:pages[0]?.priorityScore||0,topDemandBoost:pages[0]?.demandBoost||0}));

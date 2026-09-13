import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntents } from './seo-intent-loader.mjs';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const intents=loadSeoIntents(ROOT).filter(item=>item?.slug&&fs.existsSync(path.join(ROOT,`${item.slug}.html`)));
const growthPath=path.join(ROOT,'reports','growth-priority.json');
const growth=fs.existsSync(growthPath)?JSON.parse(fs.readFileSync(growthPath,'utf8')):{items:[]};
const growthByIntent=new Map((growth.items||[]).filter(x=>x?.intent).map(x=>[x.intent,x]));
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
for(const item of intents){
  const title=item.title||String(item.slug).replace(/^best-/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const description=item.description||`Tool recommendations for ${title.toLowerCase()}.`;
  const url=`${BASE}/${encodeURIComponent(item.slug)}.html`;
  const short=description.length>180?`${description.slice(0,177)}...`:description;
  const growthItem=growthByIntent.get(item.slug)||null;
  const signal=growthItem?.searchSignal||null;
  const demandBoost=searchDemandBoost(signal);
  const priorityScore=commercialIntent(item.slug)+categoryPriority(item.category)+demandBoost;
  pages.push({slug:item.slug,title,url,category:item.category||'software',priorityScore,demandBoost,searchDemand:signal?{impressions:Number(signal.impressions||0),clicks:Number(signal.clicks||0),position:Number(signal.position||0),opportunity:signal.opportunity||null,meaningfulSample:Boolean(signal.meaningfulSample)}:null,distributionReason:demandBoost>0?'Observed search demand increases distribution priority. Low-sample first-page pages receive only a protected bounded boost.':'Commercial and category priority only.',searchSnippet:`${title} - ${short}`,socialHook:`Need the right tool for ${title.toLowerCase()}? ToolScout compares options around the job, not generic rankings.`,linkedInPost:`Need the right tool for ${title.toLowerCase()}? I built a practical ToolScout guide that compares the available options around the job, budget and workflow - not a generic top-ten list.\n\n${url}`,xPost:`Choosing a tool for ${title.toLowerCase()}? ToolScout compares the options around the job, not generic rankings. ${url}`,redditStyle:`I put together a practical guide for ${title.toLowerCase()}, focused on fit rather than a generic top-ten list.`,newsletterSubject:`${title}: a practical shortlist`,newsletterIntro:`${short} See the shortlist and compare the options: ${url}`,hashtags:['#software','#AITools','#productivity','#ToolScout']});
}
pages.sort((a,b)=>b.priorityScore-a.priorityScore||b.demandBoost-a.demandBoost||a.title.localeCompare(b.title));
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});fs.writeFileSync(path.join(ROOT,'reports','distribution-queue.json'),JSON.stringify({generatedAt:new Date().toISOString(),count:pages.length,policy:'Only guides that passed the autonomous editorial publication gates are eligible for distribution. Observed search demand raises distribution priority without overriding low-sample first-page protection.',items:pages},null,2)+'\n');
console.log(JSON.stringify({queued:pages.length,top:pages[0]?.title||null,topPriority:pages[0]?.priorityScore||0,topDemandBoost:pages[0]?.demandBoost||0}));

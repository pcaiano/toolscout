import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://trytoolscout.org';
const intents = JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));
const commercialIntent = slug => /crm|seo|marketing|agency|automation|lead|sales|email|project|funnel/i.test(String(slug||'')) ? 25 : 10;
const categoryPriority = category => ({crm:5,seo:5,marketing:4,business:4,automation:5,forms:3})[category] || 1;
const pages=[];
for(const item of intents){
  if(!item?.slug)continue;
  const title=item.title||String(item.slug).replace(/^best-/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const description=item.description||`Tool recommendations for ${title.toLowerCase()}.`;
  const url=`${BASE}/${encodeURIComponent(item.slug)}.html`;
  const short=description.length>180?`${description.slice(0,177)}...`:description;
  const priorityScore=commercialIntent(item.slug)+categoryPriority(item.category);
  pages.push({slug:item.slug,title,url,category:item.category||'software',priorityScore,searchSnippet:`${title} — ${short}`,socialHook:`Need the right tool for ${title.toLowerCase()}? ToolScout compares options around the job, not generic rankings.`,linkedInPost:`Need the right tool for ${title.toLowerCase()}? I built a practical ToolScout guide that compares the available options around the job, budget and workflow — not a generic top-ten list.\n\n${url}`,xPost:`Choosing a tool for ${title.toLowerCase()}? ToolScout compares the options around the job, not generic rankings. ${url}`,redditStyle:`I put together a practical guide for ${title.toLowerCase()}, focused on fit rather than a generic top-ten list.`,newsletterSubject:`${title}: a practical shortlist`,newsletterIntro:`${short} See the shortlist and compare the options: ${url}`,hashtags:['#software','#AITools','#productivity','#ToolScout']});
}
pages.sort((a,b)=>b.priorityScore-a.priorityScore||a.title.localeCompare(b.title));
const outputPath=path.join(ROOT,'reports','distribution-queue.json');
const payload={count:pages.length,items:pages};
let generatedAt=new Date().toISOString();
if(fs.existsSync(outputPath)){
  try{
    const previous=JSON.parse(fs.readFileSync(outputPath,'utf8'));
    const previousPayload={count:previous?.count,items:previous?.items||[]};
    if(JSON.stringify(previousPayload)===JSON.stringify(payload)&&previous?.generatedAt) generatedAt=previous.generatedAt;
  }catch{}
}
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify({generatedAt,...payload},null,2)+'\n');
console.log(JSON.stringify({queued:pages.length,top:pages[0]?.title||null}));
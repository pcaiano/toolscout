import fs from 'node:fs';
import path from 'node:path';

const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
const countMatches=(text,re)=>[...String(text||'').matchAll(re)].length;
const words=text=>String(text||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').split(/\s+/).filter(Boolean).length;
const cleanMetaText=text=>String(text||'').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();

export function pageTypeForPath(page){
  const p=String(page||'').replace(/\.html$/i,'')||'/';
  if(p==='/')return'home';
  if(p.startsWith('/news/'))return'news';
  if(p.startsWith('/tools/'))return'tool_profile';
  if(/-vs-/.test(p))return'comparison';
  if(/^\/best-/.test(p))return'guide';
  if(p==='/software-trends-index')return'proprietary_dataset';
  if(p==='/distribution/publisher-kit')return'publisher_asset';
  if(p==='/privacy'||p==='/affiliate-disclosure')return'policy';
  if(p==='/methodology')return'methodology';
  if(p==='/compare')return'interactive';
  if(p==='/whats-new')return'news_hub';
  if(['/tools','/categories','/guides','/crm-tools','/seo-tools'].includes(p))return'hub';
  return'other';
}

export function fileForPublicPath(root,page){
  const p=String(page||'/').split('?')[0].replace(/\/$/,'')||'/';
  if(p==='/')return path.join(root,'index.html');
  return path.join(root,p.replace(/^\//,'')+'.html');
}

function externalEvidenceLinks(html){
  const text=String(html||'');
  const hrefs=[...text.matchAll(/href=["'](https:\/\/[^"'#]+)["']/gi)].map(m=>m[1]);
  const structured=[...text.matchAll(/"(?:citation|isBasedOn)"\s*:\s*"((?:https:\/\/)[^"]+)"/gi)].map(m=>m[1]);
  const urls=[...new Set([...hrefs,...structured])];
  return urls.filter(url=>{
    try{
      const u=new URL(url);
      return u.hostname!=='trytoolscout.org'&&!u.hostname.endsWith('.trytoolscout.org')&&!/google\.com\/s2\/favicons/i.test(url)&&u.hostname!=='schema.org';
    }catch{return false}
  }).length;
}

export function scoreEditorialPage(html,{pageType='other',hasFreshUpdate=false}={}){
  const sourceLinks=externalEvidenceLinks(html);
  const wc=words(html);
  const hasAnalysis=/(ToolScout analysis|ToolScout view|editorial view|what this means|in practice|buyer impact|why it matters|decision)/i.test(html);
  const hasTradeoffs=/(trade[- ]?off|limitation|not ideal|best for|before choosing|compare the depth|who should)/i.test(html);
  const hasVerification=/(last verified|verified on|last checked|checked\s+20\d{2}|methodology)/i.test(html);
  const hasDisclosure=/(affiliate compensation|affiliate commission|affiliate status|may earn (?:affiliate )?commissions?|sponsored|affiliate disclosure)/i.test(html);
  const hasCanonical=/<link[^>]+rel=["']canonical["']/i.test(html);
  const hasTitle=/<title>[^<]{3,}<\/title>/i.test(html);
  const metaTags=[...String(html||'').matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
  const hasMetaDescription=metaTags.some(tag=>{
    if(!/\bname=["']description["']/i.test(tag))return false;
    const match=tag.match(/\bcontent=(["'])([\s\S]*?)\1/i);
    return cleanMetaText(match?.[2]||'').length>=20;
  });
  const hasRobots=/<meta[^>]+name=["']robots["']/i.test(html);
  const hasH1=/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/i.test(html);
  const internalLinks=countMatches(html,/href=["']\/(?!\/)/gi);
  const hasEditorialPolicy=/(editorial bar|editorial policy|affiliate status never|affiliate relationships do not determine|does not sell ranking positions|independent analysis)/i.test(html);
  const hasEditorialEvidence=/(Editorial evidence:|Primary sources:)/i.test(html);
  const dated=countMatches(html,/\b20\d{2}-\d{2}-\d{2}\b/g)>0||countMatches(html,/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}\b/gi)>0;
  const hasStructuredData=/<script[^>]+application\/ld\+json/i.test(html);
  const verificationMatch=String(html||'').match(/(?:last checked|checked|verified on|last verified)\s+(20\d{2}-\d{2}-\d{2})/i);
  const verificationDate=verificationMatch?.[1]||null;
  let hasRecentVerification=false;
  if(verificationDate){
    const ageMs=Date.now()-Date.parse(verificationDate+'T00:00:00Z');
    hasRecentVerification=Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=120*86400000;
  }

  let score=0;
  if(pageType==='news'){
    score=10;
    if(sourceLinks>=1)score+=20;
    if(hasAnalysis)score+=20;
    if(hasCanonical)score+=10;
    if(hasStructuredData)score+=10;
    if(dated)score+=10;
    if(hasFreshUpdate)score+=10;
    if(hasH1)score+=5;
    if(wc>=150)score+=10;else if(wc>=100)score+=5;
    if(hasEditorialPolicy||hasDisclosure)score+=5;
  }else if(pageType==='proprietary_dataset'){
    score=10;
    if(sourceLinks>=2)score+=15;else if(sourceLinks===1)score+=8;
    if(hasAnalysis)score+=20;
    if(hasCanonical)score+=10;
    if(hasStructuredData)score+=15;
    if(dated)score+=10;
    if(hasH1)score+=5;
    if(hasMetaDescription)score+=5;
    if(wc>=900)score+=20;else if(wc>=500)score+=12;else if(wc>=250)score+=8;
  }else if(pageType==='publisher_asset'){
    score=10;
    if(hasTitle)score+=10;
    if(hasMetaDescription)score+=10;
    if(hasCanonical)score+=10;
    if(hasRobots)score+=5;
    if(hasH1)score+=10;
    if(hasStructuredData)score+=10;
    if(wc>=500)score+=15;else if(wc>=300)score+=10;
    if(internalLinks>=5)score+=10;else if(internalLinks>=2)score+=5;
    if(hasDisclosure)score+=5;
    if(hasVerification||dated)score+=5;
  }else if(pageType==='policy'){
    score=10;
    if(hasTitle)score+=15;
    if(hasMetaDescription)score+=15;
    if(hasCanonical)score+=15;
    if(hasRobots)score+=10;
    if(hasH1)score+=15;
    if(wc>=200)score+=20;else if(wc>=120)score+=10;
    if(hasVerification||dated)score+=10;
  }else if(['hub','news_hub','interactive','methodology'].includes(pageType)){
    score=10;
    if(hasTitle)score+=10;
    if(hasMetaDescription)score+=10;
    if(hasCanonical)score+=10;
    if(hasRobots)score+=5;
    if(hasH1)score+=10;
    if(hasStructuredData)score+=10;
    if(wc>=250)score+=15;else if(wc>=150)score+=10;else if(wc>=75)score+=5;
    if(internalLinks>=5)score+=10;else if(internalLinks>=2)score+=5;
    if(hasAnalysis)score+=15;
    if(hasTradeoffs)score+=5;
    if(hasVerification)score+=5;
    if(pageType==='methodology'&&sourceLinks>=1)score+=5;
    if(pageType==='news_hub'&&hasEditorialPolicy)score+=5;
  }else{
    score=10;
    if(sourceLinks>0)score+=Math.min(15,5+sourceLinks*5);
    else if(hasEditorialEvidence)score+=10;
    if(hasAnalysis)score+=15;
    if(hasTradeoffs)score+=10;
    if(hasVerification)score+=10;
    if(hasDisclosure)score+=5;
    if(hasCanonical)score+=5;
    if(hasStructuredData)score+=10;
    if(dated)score+=5;
    if(hasRecentVerification)score+=5;
    if(hasFreshUpdate)score+=5;
    if(wc>=900)score+=15;
    else if(wc>=500)score+=12;
    else if(wc>=250)score+=10;
    else if(wc>=150)score+=5;
  }

  return{
    score:Number(clamp(score).toFixed(2)),
    sourceLinks,
    wordCount:wc,
    hasAnalysis,
    hasTradeoffs,
    hasVerification,
    hasDisclosure,
    hasCanonical,
    hasStructuredData,
    hasTitle,
    hasMetaDescription,
    hasRobots,
    hasH1,
    internalLinks,
    hasEditorialPolicy,
    hasEditorialEvidence,
    dated,
    verificationDate,
    hasRecentVerification,
    hasFreshUpdate
  };
}

export function editorialAuthorityForPath(root,page,updates=[]){
  const file=fileForPublicPath(root,page);
  if(!fs.existsSync(file))return{page,file,pageType:pageTypeForPath(page),exists:false,score:0,reason:'public_file_missing'};
  const html=fs.readFileSync(file,'utf8');
  const type=pageTypeForPath(page);
  const slug=String(page||'').replace(/^\/tools\//,'').replace(/^\/news\//,'').replace(/^\//,'');
  const hasFreshUpdate=(updates||[]).some(item=>item?.toolSlug&&slug.includes(String(item.toolSlug)));
  return{page,file,pageType:type,exists:true,...scoreEditorialPage(html,{pageType:type,hasFreshUpdate})};
}

export function authorityGapPriority({impressions=0,position=0,authorityScore=0,targetScore=95,hardFloorScore=90,weight=0.2}={}){
  const demand=Number(impressions||0)>0?Math.min(60,Math.log10(Number(impressions)+1)*20):0;
  const rankNeed=Number(position)>0&&Number(position)<=10?5:Number(position)<=20?15:Number(position)<=40?22:Number(position)>40?28:0;
  const score=Number(authorityScore||0),target=Number(targetScore||95),floor=Number(hardFloorScore||90);
  const gap=Math.max(0,target-score)*Number(weight||0.2);
  const floorUrgency=score<floor?Math.min(15,(floor-score)*0.5):0;
  return Number(clamp(demand+rankNeed+gap+floorUrgency).toFixed(2));
}

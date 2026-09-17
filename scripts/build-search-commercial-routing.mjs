import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const gscPath=path.join(ROOT,'reports','gsc-signals.json');
const affiliatePath=path.join(ROOT,'data','affiliate.json');
const gsc=fs.existsSync(gscPath)?JSON.parse(fs.readFileSync(gscPath,'utf8')):{pages:[]};
const affiliate=fs.existsSync(affiliatePath)?JSON.parse(fs.readFileSync(affiliatePath,'utf8')):{};

function normalizePath(value){
  let pathname='/';
  try{pathname=new URL(String(value||''),'https://trytoolscout.org').pathname||'/';}catch{pathname=String(value||'/');}
  pathname=pathname.replace(/\/index\.html$/i,'/').replace(/\.html$/i,'');
  if(pathname.length>1)pathname=pathname.replace(/\/+$/,'');
  return pathname||'/';
}

function pageType(pathname){
  if(/^\/tools\/[^/]+$/.test(pathname))return 'tool-profile';
  if(/-vs-/.test(pathname))return 'comparison';
  if(/^\/best-/.test(pathname))return 'guide';
  return 'other';
}

function activeAffiliateSlugsForPage(pathname){
  const out=new Set();
  const direct=pathname.match(/^\/tools\/([^/]+)$/)?.[1]||null;
  if(direct&&affiliate[direct]?.enabled&&affiliate[direct]?.url)out.add(direct);
  const file=pathname==='/'?'index.html':`${pathname.replace(/^\//,'')}.html`;
  const full=path.join(ROOT,file);
  if(fs.existsSync(full)){
    const html=fs.readFileSync(full,'utf8');
    for(const match of html.matchAll(/href=["'](?:https:\/\/trytoolscout\.org)?\/go\/([a-z0-9-]+)/gi)){
      const slug=match[1];
      if(affiliate[slug]?.enabled&&affiliate[slug]?.url)out.add(slug);
    }
  }
  return [...out];
}

function lane(position,impressions,clicks){
  if(position>0&&position<=15)return 'ctr-and-snippet';
  if(position<=30&&position>0)return 'authority-and-distribution';
  if(position<=70&&position>0)return 'editorial-depth';
  if(impressions>=20||clicks>0)return 'relevance-and-authority';
  return 'observe';
}

function actionsFor(laneName,monetized){
  const byLane={
    'ctr-and-snippet':['protect-ranking','improve-title-snippet-alignment','strengthen-answer-first-copy','measure-qualified-clicks'],
    'authority-and-distribution':['strengthen-internal-links','prioritize-page-distribution','queue-vendor-amplification-when-relevant','measure-position-change'],
    'editorial-depth':['deepen-decision-context','align-copy-to-observed-queries','strengthen-internal-links','prioritize-page-distribution'],
    'relevance-and-authority':['improve-query-intent-match','deepen-evidence','strengthen-internal-authority','test-selective-distribution'],
    observe:['preserve-page','collect-more-search-evidence']
  };
  const actions=[...(byLane[laneName]||byLane.observe)];
  if(monetized)actions.push('measure-monetized-outbound-and-revenue');
  return actions;
}

const rows=(gsc.pages||[]).filter(x=>Number(x.impressions||0)>0).map(page=>{
  const pathname=normalizePath(page.page||page.pathname);
  const position=Number(page.position||0),impressions=Number(page.impressions||0),clicks=Number(page.clicks||0);
  const monetizedSlugs=activeAffiliateSlugsForPage(pathname);
  const laneName=lane(position,impressions,clicks);
  const searchValue=Math.log2(impressions+1)*12;
  const positionValue=position>0?Math.max(0,55-Math.min(55,position))*1.1:0;
  const commercialValue=monetizedSlugs.length?18+Math.min(12,monetizedSlugs.length*3):0;
  const clickValue=Math.min(20,clicks*5);
  const priorityScore=Number((searchValue+positionValue+commercialValue+clickValue).toFixed(2));
  return {page:`https://trytoolscout.org${pathname}`,pathname,type:pageType(pathname),clicks,impressions,ctr:Number(page.ctr||0),position,topQueries:(page.topQueries||[]).slice(0,5),monetized:monetizedSlugs.length>0,monetizedSlugs,lane:laneName,priorityScore,actions:actionsFor(laneName,monetizedSlugs.length>0)};
}).sort((a,b)=>b.priorityScore-a.priorityScore||b.impressions-a.impressions);

const payload={
  generatedAt:new Date().toISOString(),
  engine:'ToolScout Search Commercial Routing v1',
  objective:'Route editorial, internal-linking and distribution work from observed Google demand while keeping affiliate economics separate from editorial ranking.',
  rules:{
    editorialIndependence:'Affiliate status can add measurement and distribution urgency but never changes tool ranking or recommendation eligibility.',
    positions1to15:'Protect ranking and optimize qualified click capture.',
    positions16to30:'Prioritize authority, internal links and selective distribution.',
    positions31to70:'Deepen the existing page before expanding the content surface.',
    weakRankingWithDemand:'Improve relevance and authority instead of creating duplicate pages.'
  },
  summary:{pages:rows.length,monetizedPages:rows.filter(x=>x.monetized).length,ctrAndSnippet:rows.filter(x=>x.lane==='ctr-and-snippet').length,authorityAndDistribution:rows.filter(x=>x.lane==='authority-and-distribution').length,editorialDepth:rows.filter(x=>x.lane==='editorial-depth').length},
  priorities:rows.slice(0,50)
};
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','search-commercial-routing.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({summary:payload.summary,top:payload.priorities.slice(0,10).map(x=>({pathname:x.pathname,score:x.priorityScore,lane:x.lane,monetized:x.monetized}))},null,2));

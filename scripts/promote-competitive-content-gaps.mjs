import fs from 'node:fs';
import path from 'node:path';
import { eligibleTools } from './seo-eligibility.mjs';

const ROOT=process.cwd();
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const config=readJson('data/organic-growth-engine.json',{});
const gaps=readJson('reports/competitive-gap-signals.json',{gaps:[]});
const baseIntents=readJson('data/intents.json',[]);
const longtailPath=path.join(ROOT,'data','seo-longtail.json');
const longtail=readJson('data/seo-longtail.json',{intents:[]});
const tools=readJson('data/tools.json',[]);
const consolidations=readJson('data/seo-consolidations.json',{});
const loop=config.competitiveGapLoop||{};
const minSignals=Number(config.thresholds?.minimumCompetitorMentionsForGap||2);
const minRelevance=Number(config.editorialGates?.minimumLexicalRelevance||0.75);
const minEligible=Math.max(Number(config.editorialGates?.minimumEligibleToolsPerGuide||2),Number(loop.minimumEligibleToolsForNewContentIntent||3));
const maxNew=Number(loop.maxNewContentIntentsPerCycle||2);
const minParentScore=Number(loop.minimumParentMatchScore||3);
const minParentMargin=Number(loop.minimumParentMatchMargin||1);

const STOP=new Set(['best','tool','tools','software','platform','platforms','app','apps','for','with','and','the','a','an','to','of','in','on','online','top','leading','small','business','team','teams']);
const slugify=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const tokens=value=>slugify(value).split('-').filter(x=>x.length>=2&&!STOP.has(x));
const title=value=>slugify(value).split('-').filter(Boolean).map(word=>({ai:'AI',seo:'SEO',crm:'CRM',api:'API',saas:'SaaS'}[word]||word.charAt(0).toUpperCase()+word.slice(1))).join(' ');
const existing=new Set([...baseIntents,...(longtail.intents||[])].map(x=>x?.slug).filter(Boolean));

function parentTerms(intent){
  return new Set(tokens([intent.slug,intent.title,...(intent.keywords||[])].join(' ')));
}

function parentCandidates(slug){
  const candidateTokens=new Set(tokens(slug));
  return baseIntents.map(intent=>{
    const terms=parentTerms(intent);
    let overlap=0;
    for(const token of candidateTokens)if(terms.has(token))overlap++;
    const phraseBonus=(intent.keywords||[]).some(keyword=>{
      const k=tokens(keyword);
      return k.length>=2&&k.every(token=>candidateTokens.has(token));
    })?2:0;
    const slugBonus=tokens(intent.slug).filter(token=>candidateTokens.has(token)).length>=2?1:0;
    return{intent,score:overlap+phraseBonus+slugBonus,overlap};
  }).sort((a,b)=>b.score-a.score||b.overlap-a.overlap||a.intent.slug.localeCompare(b.intent.slug));
}

function chooseParent(slug){
  const ranked=parentCandidates(slug);
  const best=ranked[0],second=ranked[1];
  if(!best||best.score<minParentScore)return{parent:null,reason:'no-confident-parent-intent',ranked:ranked.slice(0,3)};
  if(second&&best.score-second.score<minParentMargin)return{parent:null,reason:'ambiguous-parent-intent',ranked:ranked.slice(0,3)};
  return{parent:best.intent,reason:null,ranked:ranked.slice(0,3)};
}

function effectiveIntent(seed,parent){
  return{
    ...parent,
    ...seed,
    description:seed.description||parent.description,
    weights:seed.weights||parent.weights,
    keywords:[...new Set([...(parent.keywords||[]),...(seed.keywords||[]),...tokens(seed.slug)])]
  };
}

const promoted=[];
const held=[];
const observed=[];
let additions=0;

for(const gap of gaps.gaps||[]){
  const type=gap.candidateType||'software-entity';
  if(type!=='content-intent')continue;
  const slug=slugify(gap.slug);
  if(!slug)continue;
  if(existing.has(slug)||Object.prototype.hasOwnProperty.call(consolidations,slug)){
    observed.push({slug,status:'already-covered'});
    continue;
  }
  if(Number(gap.mentions||0)<minSignals){
    held.push({slug,reason:'insufficient-independent-market-signals',mentions:gap.mentions});
    continue;
  }
  if(!/^best-/.test(slug)){
    held.push({slug,reason:'unsupported-content-shape',detail:'Only best-* market gaps are eligible for autonomous intent promotion. Alternatives and versus gaps require entity-specific semantics and remain in automatic research.'});
    continue;
  }
  if(additions>=maxNew){
    held.push({slug,reason:'cycle-promotion-cap',retry:'next-cycle'});
    continue;
  }
  const match=chooseParent(slug);
  if(!match.parent){
    held.push({slug,reason:match.reason,parentCandidates:match.ranked.map(x=>({slug:x.intent.slug,score:x.score}))});
    continue;
  }
  const parent=match.parent;
  const seed={
    slug,
    title:title(slug),
    category:parent.category,
    parent:parent.slug,
    keywords:tokens(slug)
  };
  const effective=effectiveIntent(seed,parent);
  const eligible=eligibleTools(tools,effective,minRelevance);
  if(eligible.length<minEligible){
    held.push({slug,reason:'insufficient-editorial-catalog-coverage',parent:parent.slug,eligibleToolCount:eligible.length,minimumEligibleTools:minEligible,eligibleTools:eligible.map(x=>x.slug)});
    continue;
  }
  longtail.intents=[...(longtail.intents||[]),seed];
  existing.add(slug);
  additions++;
  promoted.push({
    slug,
    title:seed.title,
    parent:parent.slug,
    category:parent.category,
    competitorMentions:Number(gap.mentions||0),
    sources:gap.sources||[],
    eligibleToolCount:eligible.length,
    eligibleTools:eligible.map(x=>x.slug),
    parentMatchScore:match.ranked[0]?.score||0,
    action:'publish-through-normal-seo-quality-gates'
  });
}

if(additions>0)fs.writeFileSync(longtailPath,JSON.stringify(longtail,null,2)+'\n');
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','competitive-content-gap-promotions.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),
  methodology:'Repeated competitor content patterns can seed a new ToolScout best-* intent only when the intent maps confidently to an existing governed parent intent and the current catalog already contains enough eligible tools. The normal SEO publication gates run again after promotion. Alternatives and versus candidates remain held until entity-specific semantics are verified.',
  summary:{contentGaps:(gaps.gaps||[]).filter(x=>(x.candidateType||'software-entity')==='content-intent').length,promoted:promoted.length,held:held.length,alreadyCovered:observed.length},
  promoted,
  held,
  observed
},null,2)+'\n');
console.log(JSON.stringify({promoted:promoted.length,held:held.length,alreadyCovered:observed.length,slugs:promoted.map(x=>x.slug)},null,2));

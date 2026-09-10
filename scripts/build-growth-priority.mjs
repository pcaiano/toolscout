import fs from 'node:fs';
import { eligibleTools as getEligibleTools, lexicalRelevance, normalize, capabilityTerms, categoryMatch } from './seo-eligibility.mjs';
import { loadSeoIntents } from './seo-intent-loader.mjs';

const intents = loadSeoIntents();
const tools = JSON.parse(fs.readFileSync('data/tools.json','utf8'));
const affiliate = JSON.parse(fs.readFileSync('data/affiliate.json','utf8'));
const pipeline = JSON.parse(fs.readFileSync('data/affiliate-pipeline.json','utf8'));
const organicConfig = JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const MIN_GSC_IMPRESSIONS = Number(organicConfig?.thresholds?.minimumGscImpressionsForCtrAction || 20);
const MIN_TOOLS = Number(organicConfig?.editorialGates?.minimumEligibleToolsPerGuide || 2);
const MAX_TOOLS = Number(organicConfig?.editorialGates?.maximumRankedToolsPerGuide || 3);
const MIN_RELEVANCE = Number(organicConfig?.editorialGates?.minimumLexicalRelevance || 0.75);
const FIRST_PAGE = Number(organicConfig?.thresholds?.firstPageMaxPosition || 10);
const STRIKING = Number(organicConfig?.thresholds?.strikingDistanceMaxPosition || 20);
const gscPath = 'reports/gsc-signals.json';
const gscFilePresent = fs.existsSync(gscPath);
const gsc = gscFilePresent ? JSON.parse(fs.readFileSync(gscPath,'utf8')) : { items: [] };
const gscByIntent = new Map((gsc.items || []).map(x => [String(x.intent), x]));
const pipelineBySlug = new Map((pipeline.verified_programs || []).map(x => [String(x.slug), x]));
const commercialPattern = /crm|seo|marketing|agency|automation|lead|sales|email|project|funnel|productivity|form/i;
const categoryPriority = {crm:10, seo:10, marketing:9, automation:9, business:8, forms:7};

function scoreTool(tool, intent) {
  const weights = intent.weights || {}, scores = tool.scores || {};
  let total = 0, weight = 0;
  for (const [key, raw] of Object.entries(weights)) {
    const w = Number(raw) || 0;
    if (!w) continue;
    let value = 0;
    if (key === 'category') value = categoryMatch(tool,intent) ? 10 : 0;
    else if (key === 'freePlan') value = tool.freePlan ? 10 : 0;
    else if (key === 'ease' || key === 'simplicity') value = Number(scores.ease || 0);
    else if (key === 'price') value = Number(scores.price || 0);
    else value = Number(scores[key] || 0);
    total += value * w;
    weight += w;
  }
  return weight ? total / weight : 0;
}

function affiliateReadiness(slug) {
  const live = affiliate[slug];
  if (live?.enabled && live.url) return 25;
  const state = pipelineBySlug.get(slug)?.status;
  if (state === 'program_exists') return 15;
  if (state === 'paused_for_new_affiliates') return 2;
  if (state === 'no_affiliate_program') return 0;
  return 5;
}

function searchOpportunity(observed) {
  const impressions = Number(observed?.impressions || 0), clicks = Number(observed?.clicks || 0), position = Number(observed?.position || 0), ctr = Number(observed?.ctr || 0);
  if (!impressions) return { score:0, opportunity:'unobserved', meaningfulSample:false, strategicOpportunity:false, evidenceConfidence:'none' };
  const meaningfulSample = impressions >= MIN_GSC_IMPRESSIONS || clicks > 0;
  const firstPage = position > 0 && position <= FIRST_PAGE;
  const striking = position > FIRST_PAGE && position <= STRIKING;
  const strategicOpportunity = firstPage || striking;
  const demand = Math.min(30, Math.log10(impressions + 1) * 9);
  const traffic = Math.min(10, Math.log10(clicks + 1) * 5);
  let rankOpportunity = 2;
  if (position > 0 && position <= 3) rankOpportunity = 8;
  else if (firstPage) rankOpportunity = 20;
  else if (striking) rankOpportunity = 18;
  else if (position <= 40) rankOpportunity = 12;
  else if (position <= 70) rankOpportunity = 6;
  let ctrOpportunity = 0;
  if (meaningfulSample && firstPage && ctr < 1) ctrOpportunity = 6;
  else if (meaningfulSample && striking && ctr < 2) ctrOpportunity = 3;
  const samplePenalty = meaningfulSample ? 0 : Math.min(12, rankOpportunity * 0.55);
  const score = Math.min(60, Math.max(0, Math.round(demand + traffic + rankOpportunity + ctrOpportunity - samplePenalty)));
  let opportunity = 'develop';
  if (!meaningfulSample && firstPage) opportunity = 'first-page-low-sample';
  else if (!meaningfulSample && striking) opportunity = 'striking-distance-low-sample';
  else if (!meaningfulSample) opportunity = 'insufficient-sample';
  else if (position > 0 && position <= 3) opportunity = 'defend-winner';
  else if (firstPage) opportunity = clicks > 0 ? 'first-page-growth' : 'first-page-no-clicks';
  else if (striking) opportunity = 'striking-distance';
  else if (position <= 50) opportunity = 'authority-gap';
  else opportunity = 'relevance-gap';
  return { score, opportunity, meaningfulSample, strategicOpportunity, evidenceConfidence: meaningfulSample ? 'meaningful' : 'low' };
}

const rows = intents.map(intent => {
  const eligible = getEligibleTools(tools,intent,MIN_RELEVANCE);
  const ranked = eligible.map(tool => ({tool,fit:scoreTool(tool,intent),relevance:lexicalRelevance(tool,intent)})).sort((a,b)=>(b.fit+b.relevance*1.35)-(a.fit+a.relevance*1.35)||b.relevance-a.relevance||b.fit-a.fit||a.tool.name.localeCompare(b.tool.name));
  const top = ranked.slice(0,MAX_TOOLS), catalogGap = eligible.length < MIN_TOOLS;
  const catalogDepth = Math.min(20,eligible.length*2), topFit = top.length ? top.reduce((sum,x)=>sum+x.fit,0)/top.length : 0;
  const commercial = commercialPattern.test(intent.slug) ? 20 : 8, category = categoryPriority[intent.category] || 4;
  const affiliateTools = ranked.slice(0,5).filter(x=>affiliateReadiness(x.tool.slug)>=15).length, affiliateSignal=Math.min(15,affiliateTools*5);
  const observed=gscByIntent.get(intent.slug), impressions=Number(observed?.impressions||0), clicks=Number(observed?.clicks||0), position=Number(observed?.position||0), ctr=Number(observed?.ctr||0);
  const search=searchOpportunity(observed), heuristicScore=Math.min(100,Math.round(commercial+category+catalogDepth+Math.min(20,topFit*2)+affiliateSignal));
  const score=impressions>0?Math.min(100,Math.round(search.score+heuristicScore*0.4)):heuristicScore;
  const readiness=affiliateTools>0?'monetizable':'needs-affiliate-activation';
  let action=catalogGap?'catalog-gap':score>=75?'invest-now':score>=60?'build-next':'watch';
  if(!catalogGap && ['first-page-low-sample','striking-distance-low-sample'].includes(search.opportunity)) action='protect-and-measure';
  else if(!catalogGap && search.meaningfulSample && ['defend-winner','first-page-growth','first-page-no-clicks','striking-distance'].includes(search.opportunity)) action='optimize-now';
  else if(!catalogGap && search.meaningfulSample && ['authority-gap','relevance-gap'].includes(search.opportunity)) action='repair-existing';
  return {intent:intent.slug,title:intent.title,category:intent.category,priorityScore:score,topFit:Number(topFit.toFixed(2)),eligibleToolCount:eligible.length,minimumEligibleTools:MIN_TOOLS,catalogDepth,commercialSignal:commercial,affiliateSignal,searchSignal:impressions>0?{source:'gsc',impressions,clicks,ctr,position,opportunity:search.opportunity,opportunityScore:search.score,meaningfulSample:search.meaningfulSample,strategicOpportunity:search.strategicOpportunity,evidenceConfidence:search.evidenceConfidence}:null,signalBasis:impressions>0?(search.meaningfulSample?'observed-gsc-meaningful':'observed-gsc-low-sample'):'heuristic-only',monetizationReadiness:readiness,topTools:top.map(x=>x.tool.slug),requiredCapabilities:capabilityTerms(intent),editorialEligibility:catalogGap?'blocked-insufficient-semantic-coverage':'eligible',action};
});

rows.sort((a,b)=>{const rank={'optimize-now':7,'repair-existing':6,'protect-and-measure':5,'invest-now':4,'build-next':3,'catalog-gap':2,watch:1};return(rank[b.action]||0)-(rank[a.action]||0)||b.priorityScore-a.priorityScore||Number(b.searchSignal?.impressions||0)-Number(a.searchSignal?.impressions||0)||a.title.localeCompare(b.title);});

const gscAvailable=gscByIntent.size>0,gscStatus=gscAvailable?'signals-imported':gscFilePresent?'imported-no-matching-intents':'not-imported';
const gscReason=gscAvailable?`Google Search Console signals drive growth prioritization. First-page and striking-distance visibility is always retained as a strategic opportunity. Samples below ${MIN_GSC_IMPRESSIONS} impressions are protected and measured rather than aggressively rewritten. Meaningful weak rankings are treated as relevance or authority problems.`:gscFilePresent?'A Google Search Console export was imported, but it contains no matching guide intents.':'No reports/gsc-signals.json file exists.';
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/growth-priority.json',JSON.stringify({generatedAt:new Date().toISOString(),methodology:`Search impressions are visibility, not traffic. First-page visibility is always a strategic opportunity. Low-sample first-page signals are protected and measured; they are not discarded and they are not treated as high-confidence CTR evidence. Automatic ranking conclusions require at least ${MIN_GSC_IMPRESSIONS} impressions unless a click is observed. Tool eligibility requires an allowed category, capability fit where defined, hard attribute constraints where defined, and semantic relevance.`,gsc:{available:gscAvailable,ingestionStatus:gscStatus,intentsWithSignals:gscByIntent.size,minimumImpressionsForHighConfidenceAction:MIN_GSC_IMPRESSIONS,source:gsc.source||null,dataState:gsc.dataState||null,siteTotals:gsc.siteTotals||null,reason:gscReason},editorialGates:{minimumEligibleToolsPerGuide:MIN_TOOLS,maximumRankedToolsPerGuide:MAX_TOOLS,minimumLexicalRelevance:MIN_RELEVANCE,allowedCategoryRequired:true,capabilityGateRequired:true,hardAttributeGateRequired:true},count:rows.length,items:rows},null,2)+'\n');
console.log(JSON.stringify({generated:rows.length,blockedCatalogGaps:rows.filter(x=>x.action==='catalog-gap').length,lowSampleStrategic:rows.filter(x=>x.action==='protect-and-measure').length,gsc:{available:gscAvailable,ingestionStatus:gscStatus,intentsWithSignals:gscByIntent.size,siteTotals:gsc.siteTotals||null},top:rows.slice(0,10)},null,2));

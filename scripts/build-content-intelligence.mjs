import fs from 'node:fs';

const organicPath='reports/organic-growth-opportunities.json';
const audiencePath='data/audience-learning.json';
const historyPath='data/audience-learning-history.json';

const organic=fs.existsSync(organicPath)?JSON.parse(fs.readFileSync(organicPath,'utf8')):{opportunities:[],summary:{}};
const audience=fs.existsSync(audiencePath)?JSON.parse(fs.readFileSync(audiencePath,'utf8')):{socialHumanSessions:0,platforms:[],content:[],families:[],socialInterestGraph:{}};
const history=fs.existsSync(historyPath)?JSON.parse(fs.readFileSync(historyPath,'utf8')):[];

const laneWeight={'seo-aeo-snippet':4,'seo-striking-distance':3,'seo-authority-depth':2,'commercial-intent':1,'develop-authority':0};
const observed=(organic.opportunities||[])
  .filter(x=>Number(x.searchSignal?.impressions||0)>0)
  .sort((a,b)=>{
    const laneDelta=(laneWeight[b.lane]||0)-(laneWeight[a.lane]||0);
    if(laneDelta) return laneDelta;
    const impressionDelta=Number(b.searchSignal?.impressions||0)-Number(a.searchSignal?.impressions||0);
    if(impressionDelta) return impressionDelta;
    return Number(a.searchSignal?.position||999)-Number(b.searchSignal?.position||999);
  });

const topOrganic=observed.slice(0,8).map(x=>({
  intent:x.intent,
  priorityScore:Number(x.priorityScore||0),
  lane:x.lane,
  action:x.action,
  reason:x.reason,
  impressions:Number(x.searchSignal?.impressions||0),
  position:Number(x.searchSignal?.position||0),
  topTools:x.topTools||[]
}));

const socialSessions=Number(audience.socialHumanSessions||0);
const evidenceTier=socialSessions<5?'baseline':socialSessions<20?'directional':'allocation-eligible';

const contentSignals=(audience.content||[]).map(x=>({
  platform:x.platform,
  contentId:x.contentId,
  family:x.family||'unlabelled',
  publishedDate:x.publishedDate||null,
  postLevel:Boolean(x.postLevel),
  sessions:Number(x.sessions||0),
  recommendationCompletions:Number(x.recommendationCompletions||0),
  resultViews:Number(x.resultViews||0),
  outboundClicks:Number(x.outboundClicks||0),
  monetizedOutbound:Number(x.monetizedOutbound||0),
  sessionToOutboundRate:x.sessionToOutboundRate??(Number(x.sessions||0)?Number((Number(x.outboundClicks||0)/Number(x.sessions)*100).toFixed(1)):null)
}));

const familySignals=(audience.families||[]).map(x=>({
  platform:x.platform,
  family:x.family,
  posts:Number(x.posts||0),
  sessions:Number(x.sessions||0),
  recommendationCompletions:Number(x.recommendationCompletions||0),
  outboundClicks:Number(x.outboundClicks||0),
  monetizedOutbound:Number(x.monetizedOutbound||0),
  sessionToOutboundRate:x.sessionToOutboundRate??null
}));

const postLearningEligible=contentSignals.filter(x=>x.postLevel&&x.sessions>=3);
const familyLearningEligible=familySignals.filter(x=>x.sessions>=5);

const payload={
  generatedAt:new Date().toISOString(),
  engine:'ToolScout Content Intelligence v1.1',
  objective:'Choose and test content opportunities using observed search demand and likely-human social/commercial behavior without allowing affiliate economics to influence editorial recommendations.',
  evidenceTier,
  rules:{
    fewerThan5SocialSessions:'Keep Monday discovery, Wednesday comparison and Friday practical balanced.',
    fiveTo19SocialSessions:'Allow one controlled test only. Change one variable and define one success metric.',
    twentyPlusSocialSessions:'Measured allocation changes are allowed only when downstream behavior supports them.',
    postLearningMinimumSessions:3,
    familyLearningMinimumSessions:5,
    editorialIndependence:'Affiliate payout never changes tool ranking or editorial winner.',
    searchToSocial:'Only topics with observed Search Console impressions can become search-supported social topic signals. Search demand does not prove social performance.',
    socialToSearch:'Use repeated high-quality social interest as research input, not an automatic page-creation trigger.',
    perPostLearning:'Use dated content IDs to compare individual posts. Do not generalize from a post with fewer than 3 likely-human sessions.',
    familyLearning:'Use family-level evidence only after at least 5 likely-human sessions in that family.'
  },
  search:{summary:organic.summary||{},topOpportunities:topOrganic},
  social:{
    windowDays:Number(audience.windowDays||30),
    socialHumanSessions:socialSessions,
    platforms:audience.platforms||[],
    content:contentSignals,
    families:familySignals,
    socialInterestGraph:audience.socialInterestGraph||{}
  },
  history:{snapshots:Array.isArray(history)?history.length:0,lastThree:Array.isArray(history)?history.slice(-3):[]},
  recommendedInputs:{
    topicCandidates:topOrganic.slice(0,5).map(x=>x.intent),
    testEligible:evidenceTier!=='baseline',
    allocationChangeEligible:evidenceTier==='allocation-eligible',
    postLearningEligible:postLearningEligible.map(x=>x.contentId),
    familyLearningEligible:familyLearningEligible.map(x=>`${x.platform}:${x.family}`)
  }
};

fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/content-intelligence.json',JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({evidenceTier,topTopics:payload.recommendedInputs.topicCandidates,socialHumanSessions:socialSessions,postLearningEligible:payload.recommendedInputs.postLearningEligible,familyLearningEligible:payload.recommendedInputs.familyLearningEligible},null,2));

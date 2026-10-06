import fs from 'node:fs';

const API='https://api.seranking.com/v1';
const TARGET='trytoolscout.org';
const MODE='domain';
const token=String(process.env.SE_RANKING_API_KEY||'').trim();
if(!token) throw new Error('SE_RANKING_API_KEY is required');

async function api(path, params={}){
  const url=new URL(API+path);
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null) url.searchParams.set(k,String(v));
  url.searchParams.set('apikey',token);
  url.searchParams.set('output','json');
  const res=await fetch(url,{headers:{Accept:'application/json'}});
  const text=await res.text();
  let body={};
  try{body=JSON.parse(text)}catch{}
  if(!res.ok) throw new Error(`SE Ranking ${path} failed: HTTP ${res.status} ${text.slice(0,500)}`);
  return body;
}

const summaryBody=await api('/backlinks/summary',{target:TARGET,mode:MODE});
const refsBody=await api('/backlinks/refdomains',{target:TARGET,mode:MODE,limit:10000,order_by:'domain_inlink_rank'});
const summary=(summaryBody.summary||summaryBody.metrics||[])[0];
const refdomains=refsBody.refdomains||refsBody.domains||[];
if(!summary||!Number.isFinite(Number(summary.backlinks))||!Number.isFinite(Number(summary.refdomains))){
  throw new Error('SE Ranking summary returned no usable backlink metrics');
}

const now=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');

const detail=read('data/se-ranking-backlink-truth.json');
detail.observedAt=now;
detail.source='SE Ranking Data API';
detail.target=TARGET;
detail.mode=MODE;
detail.metrics={
  backlinks:Number(summary.backlinks||0),
  referringDomains:Number(summary.refdomains||0),
  subnets:Number(summary.subnets||0),
  ips:Number(summary.ips||0),
  dofollowBacklinks:Number(summary.dofollow_backlinks||0),
  nofollowBacklinks:Number(summary.nofollow_backlinks||0),
  dofollowReferringDomains:Number(summary.dofollow_refdomains||0),
  eduBacklinks:Number(summary.edu_backlinks||0),
  govBacklinks:Number(summary.gov_backlinks||0),
  pageInlinkRank:Number(summary.inlink_rank||0),
  domainInlinkRank:Number(summary.domain_inlink_rank||0),
  domainAuthority:Number(summary.domain_inlink_rank||0)
};
detail.referringDomains=refdomains.map(d=>({
  domain:d.refdomain||d.domain,
  backlinks:Number(d.backlinks||0),
  dofollowBacklinks:Number(d.dofollow_backlinks||0),
  domainInlinkRank:Number(d.domain_inlink_rank||0),
  firstSeen:d.first_seen||null
})).filter(d=>d.domain);
detail.reconciliationPolicy={...(detail.reconciliationPolicy||{}),
  lastFullLinkRowReconciliation:now,
  fullLinkRowsObserved:detail.metrics.backlinks,
  canonicalExternalTruth:'SE Ranking Data API',
  measurementMode:'machine_observed_only'
};
detail.authorityHistorySummary={...(detail.authorityHistorySummary||{}),
  windowEnd:now.slice(0,10),
  currentDomainAuthority:detail.metrics.domainAuthority
};
write('data/se-ranking-backlink-truth.json',detail);

const truth=read('data/authority-truth.json');
truth.generatedAt=now;
truth.sources=truth.sources||{};
truth.sources.seRanking={
  provider:'SE Ranking',
  status:'available',
  observedAt:now,
  measurement:'SE Ranking Data API',
  metrics:{
    backlinks:detail.metrics.backlinks,
    referringDomains:detail.metrics.referringDomains,
    subnets:detail.metrics.subnets,
    ips:detail.metrics.ips,
    dofollowBacklinks:detail.metrics.dofollowBacklinks,
    nofollowBacklinks:detail.metrics.nofollowBacklinks,
    dofollowReferringDomains:detail.metrics.dofollowReferringDomains,
    inlinkRank:detail.metrics.pageInlinkRank,
    domainInlinkRank:detail.metrics.domainInlinkRank
  }
};
truth.reconciliation={...(truth.reconciliation||{}),
  status:'machine_observed_partial',
  primaryAvailableSource:'SE Ranking Data API',
  seRankingObservedAt:now,
  note:'No Ahrefs numeric value is retained while the connected API cannot measure the domain. Provider metrics remain separate.'
};
write('data/authority-truth.json',truth);

console.log(JSON.stringify({ok:true,observedAt:now,...detail.metrics,referringDomainRows:detail.referringDomains.length}));

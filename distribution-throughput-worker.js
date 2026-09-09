import base from './distribution-autonomous-worker.js';

const RESEARCH_SCAN_LIMIT=48;
const RESEARCH_BUDGET=4;
const BACKOFF_HOURS=[1,2,4,8,12];

function ageHours(value){
  if(!value)return Infinity;
  const t=Date.parse(String(value).replace(' ','T')+'Z');
  return Number.isFinite(t)?(Date.now()-t)/3600000:Infinity;
}

async function consecutiveResearchAttempts(env,surfaceSlug){
  try{
    const q=await env.DB.prepare(`SELECT result FROM distribution_qualification_events WHERE surface_slug=? ORDER BY created_at DESC LIMIT 5`).bind(surfaceSlug).all();
    let n=0;
    for(const row of q.results||[]){
      if(row.result!=='research_required')break;
      n++;
    }
    return n;
  }catch{return 0;}
}

async function releaseDueResearch(env){
  let rows=[];
  try{
    const q=await env.DB.prepare(`SELECT surface_slug,last_checked_at,distribution_score FROM distribution_opportunities WHERE status='research_required' AND COALESCE(human_required,0)=0 AND action_url IS NOT NULL ORDER BY COALESCE(last_checked_at,'1970-01-01') ASC,distribution_score DESC LIMIT ${RESEARCH_SCAN_LIMIT}`).all();
    rows=q.results||[];
  }catch{return {scanned:0,released:0,eligible:0};}

  let released=0,eligible=0;
  for(const row of rows){
    if(released>=RESEARCH_BUDGET)break;
    const attempts=await consecutiveResearchAttempts(env,row.surface_slug);
    const delay=BACKOFF_HOURS[Math.min(attempts,BACKOFF_HOURS.length-1)];
    if(ageHours(row.last_checked_at)<delay)continue;
    eligible++;
    try{
      const r=await env.DB.prepare(`UPDATE distribution_opportunities SET status='candidate',updated_at=datetime('now') WHERE surface_slug=? AND status='research_required' AND COALESCE(human_required,0)=0`).bind(row.surface_slug).run();
      if(Number(r?.meta?.changes||r?.changes||0)>0)released++;
    }catch{}
  }

  if(rows.length){
    try{
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`throughput_${crypto.randomUUID()}`,'distribution_research_throughput','completed','distribution_engine',`Research throughput scanned ${rows.length} surface(s), found ${eligible} due under per-surface backoff 1/2/4/8/12h and released ${released} oldest-first surface(s) into the autonomous qualification queue. Budget ${RESEARCH_BUDGET} per cycle.`).run();
    }catch{}
  }
  return {scanned:rows.length,released,eligible,backoffHours:BACKOFF_HOURS,researchBudget:RESEARCH_BUDGET};
}

function authorized(request,env){
  const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN);
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/distribution/autonomous/refresh'&&request.method==='POST'&&authorized(request,env))await releaseDueResearch(env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    await releaseDueResearch(env);
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

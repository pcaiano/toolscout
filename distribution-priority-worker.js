import base from './distribution-throughput-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const TERMINAL=new Set(['policy_blocked','rejected']);
const EXECUTABLE_STATUS='ready_to_submit';

function authorized(request,env){const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);}
function number(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function gradeRank(v){return({none:0,directional:1,emerging:2,strong:3,revenue_confirmed:4})[String(v||'none')]??0;}

export function operatingDecision(row){
  if(TERMINAL.has(String(row?.status||'')))return{s:'suspend',reason:`Surface status ${row.status} blocks automatic distribution.`};
  if(String(row?.paid_policy_decision||'')==='hold_no_return')return{s:'suspend',reason:'Paid surface has sufficient measurement with no positive return.'};
  if(number(row?.cost_amount)>0&&String(row?.paid_policy_decision||'')==='experiment_measuring')return{s:'measure',reason:'Paid experiment is already committed and remains measurement-only. No additional spend is authorized.'};
  const rank=gradeRank(row?.evidence_grade);
  if(rank>=3)return{s:'scale',reason:`Evidence grade ${row.evidence_grade} supports higher operating priority.`};
  if(rank>=1)return{s:'measure',reason:`Evidence grade ${row.evidence_grade} is directional and needs more browser-confirmed observations.`};
  return{s:'explore',reason:'No browser-confirmed economic evidence yet. Keep a bounded exploration allocation.'};
}

export function priorityWeight(row,decision,{explorationSlot=false}={}){
  if(decision==='suspend')return 0;
  if(explorationSlot)return 100;
  const learned=Math.max(0,Math.min(100,number(row?.learned_score,row?.distribution_score)));
  if(decision==='scale')return Number((90+learned*0.095).toFixed(2));
  if(decision==='measure')return Number((60+learned*0.19).toFixed(2));
  return Number((30+learned*0.19).toFixed(2));
}

function oldestFirst(a,b){
  const at=Date.parse(String(a?.last_checked_at||a?.updated_at||'1970-01-01').replace(' ','T')+'Z')||0;
  const bt=Date.parse(String(b?.last_checked_at||b?.updated_at||'1970-01-01').replace(' ','T')+'Z')||0;
  return at-bt||number(b?.learned_score,b?.distribution_score)-number(a?.learned_score,a?.distribution_score);
}

export async function rebalanceDistributionPriorities(env){
  let rows=[];
  try{
    const q=await env.DB.prepare(`SELECT o.surface_slug,o.surface_name,o.status,o.human_required,o.distribution_score,o.last_checked_at,o.updated_at,l.baseline_score,l.learned_score,l.economic_boost,l.evidence_grade,l.paid_policy_decision,l.browser_confirmed_sessions_30d,l.outbound_clicks_30d,l.monetized_outbound_30d,l.confirmed_revenue_30d,c.cost_amount,c.currency AS cost_currency FROM distribution_opportunities o LEFT JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug LEFT JOIN distribution_surface_costs c ON c.surface_slug=o.surface_slug WHERE o.surface_slug IS NOT NULL`).all();
    rows=q.results||[];
  }catch(error){return{ok:false,updated:0,reason:'operating_decision_schema_unavailable',detail:String(error?.message||error).slice(0,500)};}

  const staged=rows.map(row=>({...row,decision:operatingDecision(row)}));
  const explorationCandidate=staged
    .filter(row=>row.decision.s==='explore'&&row.status===EXECUTABLE_STATUS&&number(row.human_required)===0&&number(row.cost_amount)===0)
    .sort(oldestFirst)[0]||null;

  let updated=0,paidBlocked=0;
  const counts={scale:0,measure:0,explore:0,suspend:0};
  for(const row of staged){
    const decision=row.decision.s;
    const explorationSlot=Boolean(explorationCandidate&&explorationCandidate.surface_slug===row.surface_slug);
    const priority=priorityWeight(row,decision,{explorationSlot});
    const isPaid=number(row.cost_amount)>0;
    const chairmanRequired=number(row.human_required)>0||(isPaid&&decision==='scale')||(isPaid&&row.status===EXECUTABLE_STATUS);
    const reason=explorationSlot?`${row.decision.reason} Reserved as this cycle's one-in-four exploration candidate.`:row.decision.reason;
    const baseline=number(row.baseline_score,row.distribution_score);
    const learned=number(row.learned_score,row.distribution_score);

    try{
      await env.DB.prepare(`INSERT INTO distribution_economic_learning(surface_slug,baseline_score,learned_score,operating_decision,priority_weight,decision_reason,chairman_required,decided_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET operating_decision=excluded.operating_decision,priority_weight=excluded.priority_weight,decision_reason=excluded.decision_reason,chairman_required=excluded.chairman_required,decided_at=datetime('now'),updated_at=datetime('now')`).bind(row.surface_slug,baseline,learned,decision,priority,reason,chairmanRequired?1:0).run();
      await env.DB.prepare(`UPDATE distribution_opportunities SET distribution_score=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(priority,row.surface_slug).run();
      if(isPaid&&row.status===EXECUTABLE_STATUS){
        await env.DB.prepare(`UPDATE distribution_opportunities SET status='approval_required',human_required=1,next_action='Paid distribution is never executed automatically. Review measured evidence, expected value and cost before authorizing any spend.',updated_at=datetime('now') WHERE surface_slug=? AND status='ready_to_submit'`).bind(row.surface_slug).run();
        paidBlocked++;
      }
      counts[decision]++;
      updated++;
    }catch{}
  }

  try{
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`priority_${crypto.randomUUID()}`,'distribution_operating_priorities','completed','distribution_engine',`Operating priorities updated ${updated} surface(s): scale ${counts.scale}, measure ${counts.measure}, explore ${counts.explore}, suspend ${counts.suspend}. ${explorationCandidate?`Reserved ${explorationCandidate.surface_slug} as the bounded exploration slot.`:'No executable free exploration candidate was available.'} ${paidBlocked} paid ready-to-submit surface(s) were moved behind owner approval.`).run();
  }catch{}
  return{ok:true,updated,decisions:counts,exploration_slot:explorationCandidate?.surface_slug||null,paid_auto_execution_blocked:paidBlocked};
}

async function decisionSnapshot(env){
  try{
    const q=await env.DB.prepare(`SELECT l.surface_slug,o.surface_name,o.status,l.operating_decision,l.priority_weight,l.evidence_grade,l.paid_policy_decision,l.browser_confirmed_sessions_30d,l.outbound_clicks_30d,l.monetized_outbound_30d,l.confirmed_revenue_30d,l.observed_cost,l.observed_cost_currency,l.observed_roi,l.chairman_required,l.decision_reason,l.decided_at FROM distribution_economic_learning l LEFT JOIN distribution_opportunities o ON o.surface_slug=l.surface_slug ORDER BY CASE l.operating_decision WHEN 'scale' THEN 0 WHEN 'measure' THEN 1 WHEN 'explore' THEN 2 ELSE 3 END,l.priority_weight DESC,l.surface_slug ASC`).all();
    return{status:'connected',items:q.results||[]};
  }catch(error){return{status:'unavailable',items:[],error:String(error?.message||error).slice(0,500)};}
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/distribution/operating-decisions'&&request.method==='GET'){
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});
      return Response.json(await decisionSnapshot(env),{headers:H});
    }
    if(u.pathname==='/api/distribution/operating-decisions/rebalance'&&request.method==='POST'){
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});
      return Response.json(await rebalanceDistributionPriorities(env),{headers:H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    await rebalanceDistributionPriorities(env).catch(()=>({ok:false}));
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

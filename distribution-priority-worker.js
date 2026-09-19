import base from './distribution-throughput-integrity-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const TERMINAL=new Set(['policy_blocked','rejected','skipped','unavailable_free']);
const ACTIVE_MEASUREMENT=new Set(['live','verified','submitted','pending_review','scheduled']);
const EXECUTABLE_STATUS='ready_to_submit';
const HUMAN_ACQUISITION_SPRINT=Object.freeze({
  id:'human-acquisition-sprint-2026-09',
  startAt:'2026-09-18T23:00:00.000Z',
  endAt:'2026-09-28T23:00:00.000Z',
  northStar:'strict_verified_human_sessions',
  scaleThreshold:3,
  explorationSlots:3
});
function humanSprintActive(now=Date.now()){return now>=Date.parse(HUMAN_ACQUISITION_SPRINT.startAt)&&now<Date.parse(HUMAN_ACQUISITION_SPRINT.endAt);}
function strictHumanSessions(row){return Math.max(0,number(row?.browser_confirmed_sessions_30d,row?.human_sessions_30d));}

function authorized(request,env){const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);}
function number(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function gradeRank(v){return({none:0,directional:1,emerging:2,strong:3,revenue_confirmed:4})[String(v||'none')]??0;}

export function operatingDecision(row){
  if(TERMINAL.has(String(row?.status||'')))return{s:'suspend',reason:`Surface status ${row.status} blocks or closes further automatic distribution.`};
  if(String(row?.paid_policy_decision||'')==='hold_no_return')return{s:'suspend',reason:'Paid surface has sufficient measurement with no positive return.'};
  const humans=strictHumanSessions(row);
  if(humanSprintActive()){
    if(humans>=HUMAN_ACQUISITION_SPRINT.scaleThreshold)return{s:'scale',reason:`Human Acquisition Sprint: ${humans} strict verified human session(s) in the attribution window. Proven human acquisition scales before monetization signals.`};
    if(number(row?.cost_amount)>0&&String(row?.paid_policy_decision||'')==='experiment_measuring')return{s:'measure',reason:'Human Acquisition Sprint: paid experiments remain measurement-only and never auto-scale.'};
    if(ACTIVE_MEASUREMENT.has(String(row?.status||'')))return{s:'measure',reason:`Human Acquisition Sprint: active surface remains in measurement until it produces at least ${HUMAN_ACQUISITION_SPRINT.scaleThreshold} strict verified human sessions.`};
    if(humans>=1)return{s:'measure',reason:`Human Acquisition Sprint: ${humans} strict verified human session(s) are directional evidence and must be measured again before scaling.`};
    return{s:'explore',reason:'Human Acquisition Sprint: no strict verified human acquisition evidence yet. Keep only bounded free exploration.'};
  }
  const rank=gradeRank(row?.evidence_grade);
  if(rank>=3)return{s:'scale',reason:`Evidence grade ${row.evidence_grade} supports higher operating priority.`};
  if(number(row?.cost_amount)>0&&String(row?.paid_policy_decision||'')==='experiment_measuring')return{s:'measure',reason:'Paid experiment is already committed and remains measurement-only. No additional spend is authorized.'};
  if(ACTIVE_MEASUREMENT.has(String(row?.status||'')))return{s:'measure',reason:'Surface is already activated. Measure strict verified human impact before scaling or suspending it.'};
  if(rank>=1)return{s:'measure',reason:`Evidence grade ${row.evidence_grade} is directional and needs more strict verified human observations.`};
  return{s:'explore',reason:'No strict verified human evidence yet. Keep a bounded exploration allocation.'};
}

export function priorityWeight(row,decision,{explorationSlot=false}={}){
  if(decision==='suspend')return 0;
  const learned=Math.max(0,Math.min(100,number(row?.learned_score,row?.distribution_score)));
  if(humanSprintActive()){
    const humans=strictHumanSessions(row);
    if(explorationSlot)return 88;
    if(decision==='scale')return Number(Math.min(100,95+Math.min(5,humans)).toFixed(2));
    if(decision==='measure')return Number(Math.min(94,62+Math.min(27,humans*9)+learned*0.05).toFixed(2));
    return Number(Math.min(87,35+learned*0.12).toFixed(2));
  }
  if(explorationSlot)return 100;
  if(decision==='scale')return Number((90+learned*0.095).toFixed(2));
  if(decision==='measure')return Number((60+learned*0.19).toFixed(2));
  return Number((30+learned*0.19).toFixed(2));
}

function oldestFirst(a,b){
  const at=Date.parse(String(a?.last_checked_at||a?.updated_at||'1970-01-01').replace(' ','T')+'Z')||0;
  const bt=Date.parse(String(b?.last_checked_at||b?.updated_at||'1970-01-01').replace(' ','T')+'Z')||0;
  return at-bt||number(b?.learned_score,b?.distribution_score)-number(a?.learned_score,a?.distribution_score);
}

function eligibleForExploration(row){
  return row.decision.s==='explore'&&
    row.status===EXECUTABLE_STATUS&&
    number(row.human_required)===0&&
    number(row.cost_amount)===0&&
    row.surface_slug!=='indexnow'&&
    number(row.already_submitted)===0&&
    number(row.submission_blocked)===0;
}

export async function rebalanceDistributionPriorities(env){
  let rows=[];
  try{
    const q=await env.DB.prepare(`SELECT o.surface_slug,o.surface_name,o.surface_type,o.status,o.human_required,o.distribution_score,o.last_checked_at,o.updated_at,l.baseline_score,l.learned_score,l.economic_boost,l.evidence_grade,l.paid_policy_decision,l.browser_confirmed_sessions_30d,l.outbound_clicks_30d,l.monetized_outbound_30d,l.confirmed_revenue_30d,c.cost_amount,c.currency AS cost_currency,EXISTS(SELECT 1 FROM distribution_submissions ds WHERE ds.surface_slug=o.surface_slug AND ds.status='submitted') AS already_submitted,EXISTS(SELECT 1 FROM distribution_submissions ds WHERE ds.surface_slug=o.surface_slug AND ds.status IN ('auth_required','adapter_missing','policy_blocked','setup_required','human_required')) AS submission_blocked FROM distribution_opportunities o LEFT JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug LEFT JOIN distribution_surface_costs c ON c.surface_slug=o.surface_slug WHERE o.surface_slug IS NOT NULL`).all();
    rows=q.results||[];
  }catch(error){return{ok:false,updated:0,reason:'operating_decision_schema_unavailable',detail:String(error?.message||error).slice(0,500)};}

  const staged=rows.map(row=>({...row,decision:operatingDecision(row)}));
  const explorationLimit=humanSprintActive()?HUMAN_ACQUISITION_SPRINT.explorationSlots:1;
  const explorationCandidates=staged.filter(eligibleForExploration).sort(oldestFirst).slice(0,explorationLimit);
  const explorationSlugs=new Set(explorationCandidates.map(x=>x.surface_slug));

  let evaluated=0,updated=0,paidBlocked=0;
  const counts={scale:0,measure:0,explore:0,suspend:0};
  for(const row of staged){
    evaluated++;
    const decision=row.decision.s;
    const explorationSlot=explorationSlugs.has(row.surface_slug);
    const priority=priorityWeight(row,decision,{explorationSlot});
    const isPaid=number(row.cost_amount)>0;
    const chairmanRequired=number(row.human_required)>0||row.status==='approval_required'||isPaid;
    const reason=explorationSlot?`${row.decision.reason} Reserved as this cycle's bounded acquisition exploration slot.`:row.decision.reason;
    const baseline=number(row.baseline_score,row.distribution_score);
    const learned=number(row.learned_score,row.distribution_score);

    try{
      const decisionWrite=await env.DB.prepare(`INSERT INTO distribution_economic_learning(surface_slug,baseline_score,learned_score,operating_decision,priority_weight,decision_reason,chairman_required,decided_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
        ON CONFLICT(surface_slug) DO UPDATE SET
          operating_decision=excluded.operating_decision,
          priority_weight=excluded.priority_weight,
          decision_reason=excluded.decision_reason,
          chairman_required=excluded.chairman_required,
          decided_at=datetime('now'),
          updated_at=datetime('now')
        WHERE distribution_economic_learning.operating_decision IS NOT excluded.operating_decision
           OR distribution_economic_learning.priority_weight IS NOT excluded.priority_weight
           OR distribution_economic_learning.decision_reason IS NOT excluded.decision_reason
           OR distribution_economic_learning.chairman_required IS NOT excluded.chairman_required`)
        .bind(row.surface_slug,baseline,learned,decision,priority,reason,chairmanRequired?1:0).run();
      const priorityWrite=await env.DB.prepare(`UPDATE distribution_opportunities
        SET distribution_score=?,updated_at=datetime('now')
        WHERE surface_slug=? AND distribution_score IS NOT ?`).bind(priority,row.surface_slug,priority).run();
      let paidWrite=null;
      if(isPaid&&row.status===EXECUTABLE_STATUS){
        paidWrite=await env.DB.prepare(`UPDATE distribution_opportunities SET status='approval_required',human_required=1,next_action='Paid distribution is never executed automatically. Review measured evidence, expected value and cost before authorizing any spend.',updated_at=datetime('now') WHERE surface_slug=? AND status='ready_to_submit'`).bind(row.surface_slug).run();
        if(Number(paidWrite?.meta?.changes||paidWrite?.changes||0)>0)paidBlocked++;
      }
      counts[decision]++;
      if(Number(decisionWrite?.meta?.changes||decisionWrite?.changes||0)>0||Number(priorityWrite?.meta?.changes||priorityWrite?.changes||0)>0||Number(paidWrite?.meta?.changes||paidWrite?.changes||0)>0)updated++;
    }catch{}
  }

  try{
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`priority_${crypto.randomUUID()}`,'distribution_operating_priorities','completed','distribution_engine',`Operating priorities evaluated ${evaluated} surface(s) and materially changed ${updated}: scale ${counts.scale}, measure ${counts.measure}, explore ${counts.explore}, suspend ${counts.suspend}. ${explorationCandidates.length?`Reserved ${explorationCandidates.map(x=>x.surface_slug).join(', ')} as bounded acquisition exploration slot(s).`:'No eligible free acquisition exploration candidate was available.'} ${paidBlocked} paid ready-to-submit surface(s) were moved behind owner approval. Unchanged state is not rewritten.`).run();
  }catch{}
  return{ok:true,evaluated,updated,decisions:counts,exploration_slot:explorationCandidates[0]?.surface_slug||null,exploration_slots:explorationCandidates.map(x=>x.surface_slug),paid_auto_execution_blocked:paidBlocked,write_policy:'material_change_only',human_acquisition_sprint:{active:humanSprintActive(),...HUMAN_ACQUISITION_SPRINT}};
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
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

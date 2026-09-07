import base from './distribution-impact-entry-worker.js';
import {runAffiliateCoverageCycle} from './affiliate-coverage-cycle-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
function authorized(request,env){const token=request.headers.get('Authorization')||'';return Boolean(env.ADMIN_TOKEN&&token===`Bearer ${env.ADMIN_TOKEN}`)}

const REJECTION_WORDS=/(rejected|declined|denied|not accepted|application unsuccessful|unable to approve)/i;
const CONTACTED_WORDS=/(contacted|outreach sent|email sent|emailed|reached out|follow[- ]?up sent)/i;
const POST_SUBMIT_HUMAN_WORDS=/(verify email|email verification|confirm email|activate account|account activation|captcha|identity|tax|payment details|accept terms)/i;

async function reconcileAffiliateWorkflow(env){
  let rows=[];try{const q=await env.DB.prepare(`SELECT tool_slug,status,submitted_at,notes,blocker FROM affiliate_workflow WHERE status IN ('research_required','program_exists','ready_to_apply','human_action_required')`).all();rows=q.results||[]}catch{return{checked:0,changed:0}}
  let changed=0;
  for(const row of rows){
    const text=`${row.notes||''} ${row.blocker||''}`.trim();
    let next=null;
    if(REJECTION_WORDS.test(text))next='rejected';
    else if(row.submitted_at&&!POST_SUBMIT_HUMAN_WORDS.test(text))next='pending_review';
    else if(!row.submitted_at&&CONTACTED_WORDS.test(text))next='pending_review';
    if(!next||next===row.status)continue;
    try{await env.DB.prepare(`UPDATE affiliate_workflow SET status=?,source_actor='affiliate_coverage_reconciler',updated_at=datetime('now') WHERE tool_slug=? AND status=?`).bind(next,row.tool_slug,row.status).run();changed++}catch{}
  }
  return{checked:rows.length,changed};
}

async function runCycle(env){
  const reconciliation=await reconcileAffiliateWorkflow(env);
  const result=await runAffiliateCoverageCycle(env);
  return {...result,reconciliation};
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/affiliate-coverage/run'){
      if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405,headers:JSON_H});
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await runCycle(env),{headers:JSON_H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    if(base.scheduled)await base.scheduled(event,env,ctx);
    ctx.waitUntil(runCycle(env).catch(()=>undefined));
  }
};

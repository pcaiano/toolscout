import base from './distribution-impact-entry-worker.js';
import {runAffiliateCoverageCycle} from './affiliate-coverage-cycle-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const FIRECRAWL_INGEST_TOKEN_SHA256='e0888dacab143e3b7c9a29e83f1e95263e8ad8ff0f4d58d026d73f56c04b7c0e';
const FIRECRAWL_MONITORS=new Set(['01a0a0c1-f903-77af-abb4-ad5933198b0e','01a0a0c2-85be-713e-b00f-511186642d2e']);
const FIRECRAWL_HOSTS=new Map([['apollo.io','apollo'],['lemlist.com','lemlist'],['unbounce.com','unbounce'],['hostinger.com','hostinger'],['klaviyo.com','klaviyo'],['airtable.com','airtable']]);
const FIRECRAWL_PROTECTED=new Set(['submitted','pending_review','approved_needs_link','link_acquired','active','verified','earning','rejected']);
function authorized(request,env){const token=request.headers.get('Authorization')||'';return Boolean(env.ADMIN_TOKEN&&token===`Bearer ${env.ADMIN_TOKEN}`)}
async function digestHex(value){const bytes=new TextEncoder().encode(String(value||''));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function firecrawlAuthorized(request){const token=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(token)&&await digestHex(token)===FIRECRAWL_INGEST_TOKEN_SHA256}
function firecrawlTool(url){try{const host=new URL(String(url||'')).hostname.toLowerCase().replace(/^www\./,'');for(const [domain,slug] of FIRECRAWL_HOSTS.entries())if(host===domain||host.endsWith(`.${domain}`))return slug}catch{}return null}
function evidence(value){try{const data=JSON.parse(String(value||'[]'));return Array.isArray(data)?data:[]}catch{return[]}}

const REJECTION_WORDS=/(rejected|declined|denied|not accepted|application unsuccessful|unable to approve)/i;
const CONTACTED_WORDS=/(contacted|outreach sent|email sent|emailed|reached out|follow[- ]?up sent)/i;
const POST_SUBMIT_HUMAN_WORDS=/(verify email|email verification|confirm email|activate account|account activation|captcha|identity|tax|payment details|accept terms)/i;

async function ingestFirecrawl(request,env){
  if(!await firecrawlAuthorized(request))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
  let payload;try{payload=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_H})}
  if(String(payload?.type||'')!=='monitor.page')return Response.json({ok:true,ignored:true},{status:202,headers:JSON_H});
  const items=Array.isArray(payload?.data)?payload.data:(payload?.data?[payload.data]:[]),results=[];
  for(const item of items){
    const monitorId=String(item?.monitorId||payload?.monitorId||payload?.metadata?.monitorId||'');
    if(!FIRECRAWL_MONITORS.has(monitorId)){results.push({ignored:'unknown_monitor'});continue}
    const status=String(item?.status||'').toLowerCase(),meaningful=item?.isMeaningful===true||item?.judgment?.meaningful===true,url=String(item?.url||item?.sourceUrl||'');
    if(status==='same'||(status==='changed'&&!meaningful)){results.push({ignored:'no_meaningful_change',url});continue}
    const slug=firecrawlTool(url);if(!slug){results.push({ignored:'unmapped_vendor',url});continue}
    const [d,w]=await Promise.all([env.DB.prepare('SELECT status,evidence_json FROM affiliate_program_discovery WHERE tool_slug=?').bind(slug).first(),env.DB.prepare('SELECT status,evidence_json FROM affiliate_workflow WHERE tool_slug=?').bind(slug).first()]);
    const entry={type:'firecrawl_monitor',monitor_id:monitorId,check_id:String(item?.checkId||payload?.id||''),url,page_status:status,meaningful,judgment:item?.judgment||null,observed_at:new Date().toISOString()};
    const de=evidence(d?.evidence_json);de.push(entry);const we=evidence(w?.evidence_json);we.push(entry);
    const current=String(w?.status||d?.status||'research_required').toLowerCase(),changed=['changed','new','removed'].includes(status)&&meaningful,protectedState=FIRECRAWL_PROTECTED.has(current),next=changed&&!protectedState?'research_required':String(d?.status||current||'research_required'),blocker=changed&&!protectedState?'Firecrawl detected a meaningful affiliate programme change. Revalidation required before the next action.':null;
    await env.DB.prepare(`INSERT INTO affiliate_program_discovery(tool_slug,status,official_program_url,evidence_json,automation_mode,confidence,blocker,last_checked,updated_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,official_program_url=COALESCE(affiliate_program_discovery.official_program_url,excluded.official_program_url),evidence_json=excluded.evidence_json,automation_mode=excluded.automation_mode,confidence=MAX(affiliate_program_discovery.confidence,excluded.confidence),blocker=COALESCE(excluded.blocker,affiliate_program_discovery.blocker),last_checked=datetime('now'),updated_at=datetime('now')`).bind(slug,next,url,JSON.stringify(de.slice(-20)),changed&&!protectedState?'research':'monitor',changed?90:50,blocker).run();
    if(changed&&!protectedState)await env.DB.prepare(`INSERT INTO affiliate_workflow(tool_slug,status,program_url,blocker,evidence_json,source_actor,last_verified,updated_at) VALUES(?,'research_required',?,?,?,'firecrawl_monitor',datetime('now'),datetime('now')) ON CONFLICT(tool_slug) DO UPDATE SET status='research_required',program_url=COALESCE(affiliate_workflow.program_url,excluded.program_url),blocker=excluded.blocker,evidence_json=excluded.evidence_json,source_actor='firecrawl_monitor',last_verified=datetime('now'),updated_at=datetime('now')`).bind(slug,url,blocker,JSON.stringify(we.slice(-20))).run();
    results.push({slug,meaningful_change:changed,protected:protectedState,status:changed&&!protectedState?'research_required':current});
  }
  return Response.json({ok:true,processed:results.filter(x=>x.slug).length,results},{headers:JSON_H});
}

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
    if(u.pathname==='/api/affiliate-workflow/firecrawl'){
      if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405,headers:JSON_H});
      return ingestFirecrawl(request,env);
    }
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

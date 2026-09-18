import base from './distribution-impact-entry-worker.js';
import {runAffiliateCoverageCycle} from './affiliate-coverage-cycle-worker.js';
import {runWithLedger} from './engine-run-ledger.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const FIRECRAWL_INGEST_TOKEN_SHA256='e0888dacab143e3b7c9a29e83f1e95263e8ad8ff0f4d58d026d73f56c04b7c0e';
const AFFILIATE_REPLY_INGEST_TOKEN_SHA256='3ef12f65f47d9b27fa7d757a58eb27d2bcc966488c9611a89bd8f2165e11a310';
const FIRECRAWL_MONITORS=new Set(['01a0a488-7701-75eb-99a9-4f292034e251','01a0a489-270e-714b-b512-fc31e50b4249']);
const FIRECRAWL_HOSTS=new Map([['apollo.io','apollo'],['lemlist.com','lemlist'],['unbounce.com','unbounce'],['hostinger.com','hostinger'],['klaviyo.com','klaviyo'],['airtable.com','airtable']]);
const FIRECRAWL_PROTECTED=new Set(['submitted','pending_review','approved_needs_link','link_acquired','active','verified','earning','rejected']);
function authorized(request,env){const token=request.headers.get('Authorization')||'';return Boolean(env.ADMIN_TOKEN&&token===`Bearer ${env.ADMIN_TOKEN}`)}
async function digestHex(value){const bytes=new TextEncoder().encode(String(value||''));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function firecrawlAuthorized(request){let token=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');try{if(!token)token=String(new URL(request.url).searchParams.get('key')||'')}catch{}return Boolean(token)&&await digestHex(token)===FIRECRAWL_INGEST_TOKEN_SHA256}
async function affiliateReplyAuthorized(request){const token=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(token)&&await digestHex(token)===AFFILIATE_REPLY_INGEST_TOKEN_SHA256}
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


const APPROVAL_WORDS=/(approved|accepted|welcome to (?:the )?(?:affiliate|partner)|application (?:has been )?approved|you(?:'|’)re approved)/i;
const NEEDS_INFO_WORDS=/(more information|additional information|complete your profile|action required|verify your email|tax information|payment details|identity verification)/i;
const PENDING_WORDS=/(application received|under review|reviewing your application|pending review|thanks for applying)/i;
function cleanMail(value){return String(value||'').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').slice(0,120000)}
function urlHost(value){try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function extractReferralUrl(text){
  const raw=String(text||''),urls=[...raw.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map(m=>({url:m[0].replace(/[.,;:!?]+$/,''),index:m.index||0}));
  for(const x of urls){
    let u;try{u=new URL(x.url)}catch{continue}
    const around=raw.slice(Math.max(0,x.index-140),Math.min(raw.length,x.index+x.url.length+140));
    const tracking=/(affiliate|referral|tracking|your link|share link|partner link)/i.test(around)||/(^|[?&])(ref|referral|affiliate|aff|via|partner|subid|sub_id)=/i.test(u.search);
    if(tracking)return u.toString();
  }
  return null;
}
async function ensureAffiliateReplySchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliate_reply_events(
    message_id TEXT PRIMARY KEY,
    sender TEXT,
    subject TEXT,
    matched_tool_slug TEXT,
    decision TEXT,
    affiliate_url TEXT,
    status TEXT NOT NULL,
    received_at TEXT,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
}
async function matchAffiliateTool(env,payload,text){
  const rows=await env.DB.prepare(`SELECT tool_slug,program_name,program_url,application_url,network,status FROM affiliate_workflow`).all();
  const hay=`${payload?.from||''} ${payload?.subject||''} ${text||''}`.toLowerCase(),senderHost=urlHost('https://'+String(payload?.from||'').split('@').pop()?.replace(/[>\s].*$/,''));
  let best=null,bestScore=0;
  for(const row of rows.results||[]){
    const slug=String(row.tool_slug||'').toLowerCase(),name=String(row.program_name||'').toLowerCase(),programHost=urlHost(row.program_url||row.application_url);
    let score=0;
    if(slug&&new RegExp('(?:^|[^a-z0-9])'+slug.replace(/-/g,'[- ]')+'(?:[^a-z0-9]|$)','i').test(hay))score+=5;
    if(name&&name.length>=4&&hay.includes(name))score+=5;
    if(senderHost&&programHost&&(senderHost===programHost||senderHost.endsWith('.'+programHost)||programHost.endsWith('.'+senderHost)))score+=8;
    if(score>bestScore){bestScore=score;best=row}
  }
  return bestScore>=5?best:null;
}
async function ingestAffiliateReply(request,env){
  if(!await affiliateReplyAuthorized(request))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
  let payload={};try{payload=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_H})}
  const messageId=String(payload.message_id||payload.id||'').slice(0,300);if(!messageId)return Response.json({error:'message_id_required'},{status:422,headers:JSON_H});
  await ensureAffiliateReplySchema(env);
  const exists=await env.DB.prepare('SELECT message_id,status FROM affiliate_reply_events WHERE message_id=?').bind(messageId).first();
  if(exists)return Response.json({ok:true,duplicate:true,status:exists.status},{headers:JSON_H});
  const subject=String(payload.subject||'').slice(0,1000),sender=String(payload.from||payload.sender||'').slice(0,1000),body=cleanMail(payload.body||payload.text||payload.html||''),text=`${subject} ${body}`;
  const tool=await matchAffiliateTool(env,payload,text);
  if(!tool){
    await env.DB.prepare(`INSERT INTO affiliate_reply_events(message_id,sender,subject,status,received_at) VALUES(?,?,?,'unmatched',?)`).bind(messageId,sender,subject,payload.received_at||null).run();
    return Response.json({ok:true,matched:false,status:'unmatched'},{headers:JSON_H});
  }
  let decision=null,next=null,affiliateUrl=null;
  if(REJECTION_WORDS.test(text)){decision='rejected';next='rejected'}
  else if(APPROVAL_WORDS.test(text)){affiliateUrl=extractReferralUrl(String(payload.body||payload.text||payload.html||''));decision=affiliateUrl?'approved_with_link':'approved';next=affiliateUrl?'link_acquired':'approved_needs_link'}
  else if(NEEDS_INFO_WORDS.test(text)){decision='needs_info';next='human_action_required'}
  else if(PENDING_WORDS.test(text)){decision='pending';next='pending_review'}
  else decision='observed_no_transition';
  await env.DB.prepare(`INSERT INTO affiliate_reply_events(message_id,sender,subject,matched_tool_slug,decision,affiliate_url,status,received_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(messageId,sender,subject,tool.tool_slug,decision,affiliateUrl,decision,payload.received_at||null).run();
  if(next){
    const previous=String(tool.status||'research_required');
    await env.DB.prepare(`UPDATE affiliate_workflow SET status=?,affiliate_url=COALESCE(?,affiliate_url),response_at=COALESCE(response_at,datetime('now')),notes=?,source_actor='gmail_affiliate_reply_watch',last_verified=datetime('now'),updated_at=datetime('now') WHERE tool_slug=?`)
      .bind(next,affiliateUrl,`Affiliate email reconciled: ${decision}. Message ${messageId}.`,tool.tool_slug).run();
    await env.DB.prepare(`INSERT INTO affiliate_workflow_history(tool_slug,previous_state,new_state,evidence_source,actor_source,notes,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
      .bind(tool.tool_slug,previous,next,'gmail_message','gmail_affiliate_reply_watch',`Message ${messageId}: ${decision}`).run().catch(()=>{});
  }
  return Response.json({ok:true,matched:true,tool_slug:tool.tool_slug,decision,status:next||tool.status,affiliate_url_captured:Boolean(affiliateUrl)},{headers:JSON_H});
}

async function reconcileAffiliateWorkflow(env){
  const q=await env.DB.prepare(`SELECT tool_slug,status,submitted_at,notes,blocker FROM affiliate_workflow WHERE status IN ('research_required','program_exists','ready_to_apply','human_action_required')`).all();
  const rows=q.results||[];
  let changed=0;
  for(const row of rows){
    const text=`${row.notes||''} ${row.blocker||''}`.trim();
    let next=null;
    if(REJECTION_WORDS.test(text))next='rejected';
    else if(row.submitted_at&&!POST_SUBMIT_HUMAN_WORDS.test(text))next='pending_review';
    else if(!row.submitted_at&&CONTACTED_WORDS.test(text))next='pending_review';
    if(!next||next===row.status)continue;
    await env.DB.prepare(`UPDATE affiliate_workflow SET status=?,source_actor='affiliate_coverage_reconciler',updated_at=datetime('now') WHERE tool_slug=? AND status=?`).bind(next,row.tool_slug,row.status).run();
    changed++;
  }
  return{checked:rows.length,changed};
}

async function runCycle(env){
  const reconciliation=await reconcileAffiliateWorkflow(env);
  const result=await runAffiliateCoverageCycle(env);
  return {...result,reconciliation};
}

function runAuditedCycle(env,triggerName){
  return runWithLedger(env,{engine:'affiliate',mission:'coverage_cycle',triggerName},()=>runCycle(env));
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/affiliate-workflow/firecrawl'){
      if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405,headers:JSON_H});
      return ingestFirecrawl(request,env);
    }
    if(u.pathname==='/api/affiliate-replies/ingest'){
      if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405,headers:JSON_H});
      return ingestAffiliateReply(request,env);
    }
    if(u.pathname==='/api/affiliate-coverage/run'){
      if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405,headers:JSON_H});
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await runAuditedCycle(env,'manual_api'),{headers:JSON_H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    if(base.scheduled)await base.scheduled(event,env,ctx);
    ctx.waitUntil(runAuditedCycle(env,event?.cron||'scheduled'));
  }
};

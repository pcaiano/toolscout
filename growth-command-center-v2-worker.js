import base from './affiliate-human-action-entry-worker.js';
import { normalizeAffiliateState } from './affiliate-operations.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const OWNER_EMAIL='pcaiano@gmail.com';
const HUMAN_ACTION_LIMIT=12;
const ACTIVE_AFFILIATE_STATES=new Set(['active','verified','earning']);
const PENDING_AFFILIATE_STATES=new Set(['submitted','pending_review','approved_needs_link','link_acquired','human_action_required']);
const REJECTED_AFFILIATE_STATES=new Set(['rejected']);

function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/analytics-v2'||path==='/analytics-v2/'||path==='/analytics-v2.html'}
async function digestHex(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function validSession(request,env){
  if(!env.ADMIN_TOKEN)return false;
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if(!match)return false;
  const supplied=decodeURIComponent(match[1]);
  const bucket=sessionBucket();
  for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;
  return false;
}
async function accessAuthenticated(request,ctx){
  const email=request.headers.get('Cf-Access-Authenticated-User-Email')||request.headers.get('cf-access-authenticated-user-email')||'';
  if(String(email).toLowerCase()===OWNER_EMAIL)return true;
  try{
    if(!ctx?.access)return false;
    const identity=await ctx.access.getIdentity();
    return String(identity?.email||'').toLowerCase()===OWNER_EMAIL;
  }catch{return false}
}
function safeUrl(value){
  try{
    const u=new URL(String(value||''));
    if(u.protocol!=='https:')return null;
    const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if(h==='localhost'||h==='0.0.0.0'||h==='127.0.0.1'||h==='::1'||h.endsWith('.localhost')||h.endsWith('.local')||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;
    return u.toString();
  }catch{return null}
}
async function safeAll(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return []}}
async function safeFirst(env,sql){try{return await env.DB.prepare(sql).first()}catch{return null}}
async function assetJson(request,env,path,fallback){try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}}
async function assetText(request,env,path,fallback=''){try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.text():fallback}catch{return fallback}}
function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function timeMs(value){const t=Date.parse(String(value||'').replace(' ','T')+(String(value||'').includes('T')?'':'Z'));return Number.isFinite(t)?t:0}
function workflowCounts(rows){const out={};for(const row of rows){const k=String(row.status||'unknown');out[k]=(out[k]||0)+n(row.count)}return out}
function hoursSince(value){const t=timeMs(value);return t?Math.max(0,(Date.now()-t)/3600000):null}
function freshWithin(value,hours){const age=hoursSince(value);return age!==null&&age<=hours}
function estimateMinutes(action){if(action.engine==='affiliate'){if(action.status==='approved_needs_link')return 2;if(action.status==='ready_to_apply')return 5;return 4}if(/hacker-news|indie-hackers/i.test(action.id||''))return 8;if(/captcha|account|login|sign in/i.test(action.reason||''))return 4;return 5}
function expectedImpact(action){if(action.engine==='affiliate'){const clicks=n(action.metric);return clicks>0?`Recover monetization on ${clicks} observed unmonetized human outbound click${clicks===1?'':'s'} / 30d`:'Expand monetized affiliate coverage'}const score=n(action.metric);return score?`Distribution opportunity score ${Math.round(score)}/100`:'Unlock a blocked distribution surface'}
function afterAction(action){if(action.engine==='affiliate'){if(action.status==='approved_needs_link')return 'Affiliate engine records the link-acquisition state; production activation remains gated until the verified referral URL is in the canonical affiliate registry.';return 'Affiliate engine removes the task, monitors the existing application/review state and waits for evidence-backed approval or rejection.'}return 'Distribution engine removes the human gate, records the submission event and resumes monitoring, attribution and automatic public verification where a machine-verifiable route exists.'}
function effectiveAffiliateStatus({active,pipelineRow,workflowRow}){const persisted=normalizeAffiliateState(workflowRow?.status);if(active)return ACTIVE_AFFILIATE_STATES.has(persisted)?persisted:'active';if(!pipelineRow&&!workflowRow)return 'research_required';const state=normalizeAffiliateState(workflowRow?.status||pipelineRow?.status);if(ACTIVE_AFFILIATE_STATES.has(state)||PENDING_AFFILIATE_STATES.has(state)||REJECTED_AFFILIATE_STATES.has(state))return state;return state||'research_required'}

async function affiliateCoverageStatusSnapshot(request,env){
  const [tools,pipeline,registry,workflow,clicks]=await Promise.all([
    assetJson(request,env,'/data/tools.json',[]),assetJson(request,env,'/data/affiliate-pipeline.json',[]),assetJson(request,env,'/data/affiliate-registry.json',{}),safeAll(env,`SELECT tool_slug,status,updated_at FROM affiliate_workflow`),safeAll(env,`SELECT lower(tool_slug) AS tool_slug,COUNT(*) AS clicks FROM click_events c LEFT JOIN sessions s ON s.session_id=c.session_id WHERE c.created_at>=datetime('now','-30 days') AND COALESCE(s.internal_test,0)=0 GROUP BY lower(tool_slug)`)
  ]);
  const pMap=new Map((Array.isArray(pipeline)?pipeline:[]).map(x=>[String(x.slug||x.tool_slug||'').toLowerCase(),x]));
  const wMap=new Map(workflow.map(x=>[String(x.tool_slug||'').toLowerCase(),x]));
  const cMap=new Map(clicks.map(x=>[String(x.tool_slug||'').toLowerCase(),n(x.clicks)]));
  const reg=registry&&typeof registry==='object'?registry:{};
  const rows=[];
  for(const tool of Array.isArray(tools)?tools:[]){const slug=String(tool.slug||'').toLowerCase();if(!slug)continue;const active=Boolean(reg[slug]?.url||reg[slug]?.affiliateUrl||tool.affiliateUrl);const status=effectiveAffiliateStatus({active,pipelineRow:pMap.get(slug),workflowRow:wMap.get(slug)});if(ACTIVE_AFFILIATE_STATES.has(status)||PENDING_AFFILIATE_STATES.has(status)||REJECTED_AFFILIATE_STATES.has(status))rows.push({slug,name:tool.name||slug,status,clicks30d:cMap.get(slug)||0})}
  const group=statuses=>{const items=rows.filter(x=>statuses.has(x.status));return {count:items.length,clicks30d:items.reduce((s,x)=>s+n(x.clicks30d),0),items}};
  return {status:'observed',active:group(ACTIVE_AFFILIATE_STATES),pending:group(PENDING_AFFILIATE_STATES),rejected:group(REJECTED_AFFILIATE_STATES),generated_at:new Date().toISOString()};
}
function affiliateCoverageWidget(){return `<section class="widget" data-widget="affiliate-status" style="--w:12;--h:6"><div class="widgetHead"><div><div class="widgetKicker">Affiliate · status · clicks</div><div class="widgetTitle">Affiliate Coverage Status</div></div><div class="widgetMeta">Likely-human clicks · 30d</div></div><div class="widgetBody" id="affiliateCoverageStatusBody"><div class="empty">Loading affiliate status…</div></div><div class="resizeHandle"></div></section>`}
function affiliateCoverageScript(){return `<script>function renderAffiliateCoverageStatus(s){const root=document.getElementById('affiliateCoverageStatusBody');if(!root)return;if(!s||s.status!=='observed'){root.innerHTML='<div class="empty">Affiliate coverage status is temporarily unavailable.</div>';return}const groups=[['Active',s.active],['Pending',s.pending],['Rejected',s.rejected]],rows=groups.flatMap(([g,x])=>(x.items||[]).map(i=>({...i,group:g})));root.innerHTML='<div class="affiliateStatusSummary">'+groups.map(([g,x])=>'<span class="pill">'+g+' '+Number(x.count||0).toLocaleString()+' · '+Number(x.clicks30d||0).toLocaleString()+' clicks</span>').join('')+'</div><table class="affiliateStatusTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Clicks</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(String(x.status||'').replaceAll('_',' '))+'</td><td>'+Number(x.clicks30d||0).toLocaleString()+'</td></tr>').join('')+'</tbody></table>'}const _render=window.render;window.render=function(d){if(typeof _render==='function')_render(d);renderAffiliateCoverageStatus(d&&d.affiliateCoverageStatus)};</script>`}

async function chairmanQueue(request,env,ctx,{verifyLinks=false}={}){return {items:[],broken_links:[],external_verification_issues:[],generated_at:new Date().toISOString()}}
async function growthOpsSnapshot(request,env,ctx,stats){return {chairmanQueue:await chairmanQueue(request,env,ctx,{verifyLinks:true}),engines:{},footprint:{},ledger:[],health:{issues:[]},generated_at:new Date().toISOString()}}

async function servePage(request,env,ctx){
  if(!(await accessAuthenticated(request,ctx)))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  if(!env.ADMIN_TOKEN)return new Response('Command Center unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  // Fetch the canonical clean-URL asset. With html_handling="auto-trailing-slash", fetching
  // /analytics-v2.html returns a redirect to /analytics-v2/, which previously leaked back to
  // the browser and created an infinite redirect loop. The clean URL resolves directly to 200.
  const asset=await env.ASSETS.fetch(new Request(new URL('/analytics-v2/',request.url).toString(),request));
  if(!asset.ok)return asset;
  const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.append('Set-Cookie',`${SESSION_COOKIE}=${await sessionValue(env.ADMIN_TOKEN,sessionBucket())}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  let html=await asset.text();
  const footprintAnchor='<section class="widget" data-widget="footprint"';
  if(!html.includes('data-widget="affiliate-status"'))html=html.replace(footprintAnchor,affiliateCoverageWidget()+'\n\n    '+footprintAnchor);
  if(!html.includes('renderAffiliateCoverageStatus'))html=html.replace('</body>',affiliateCoverageScript()+'</body>');
  headers.delete('Content-Length');
  return new Response(html,{status:asset.status,headers});
}
async function protectedStats(request,env,ctx){if(!(await validSession(request,env)))return Response.json({error:'command_center_session_expired'},{status:401,headers:JSON_H});const upstream=await base.fetch(request,env,ctx);if(!upstream.ok)return upstream;let data;try{data=await upstream.json()}catch{return new Response('Command Center stats unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}const [growthOps,affiliateCoverageStatus]=await Promise.all([growthOpsSnapshot(request,env,ctx,data),affiliateCoverageStatusSnapshot(request,env)]);return Response.json({...data,growthOps,affiliateCoverageStatus},{headers:JSON_H})}
async function distributionHumanAction(request,env){if(!(await validSession(request,env)))return Response.json({ok:false,error:'command_center_session_expired'},{status:401,headers:JSON_H});let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H})}const slug=String(body.surface_slug||'').trim().toLowerCase().slice(0,120),action=String(body.action||'').trim().toLowerCase();if(!slug||!['submitted','skipped'].includes(action))return Response.json({ok:false,error:'invalid_action'},{status:400,headers:JSON_H});const row=await env.DB.prepare(`SELECT surface_slug,status,human_required,action_url FROM distribution_opportunities WHERE surface_slug=?`).bind(slug).first();if(!row||!n(row.human_required))return Response.json({ok:false,error:'human_gate_not_active'},{status:409,headers:JSON_H});const next=action==='submitted'?'submitted':'skipped',nextAction=action==='submitted'?'Human submission confirmed. Engine resumes monitoring and attribution; automatic public verification runs where a machine-verifiable route exists.':'Owner skipped this opportunity. Reconsider only if new evidence materially changes expected value.';await env.DB.prepare(`UPDATE distribution_opportunities SET status=?,human_required=0,next_action=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(next,nextAction,slug).run();await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`human_${crypto.randomUUID()}`,slug,'human_gate_resolved',next,'distribution_engine',nextAction).run();return Response.json({ok:true,surface_slug:slug,status:next,resume:'verification_measurement'},{headers:JSON_H})}

export default {async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='GET'&&analyticsPath(url.pathname))return servePage(request,env,ctx);if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return protectedStats(request,env,ctx);if(request.method==='GET'&&url.pathname==='/analytics/api/chairman-queue'){if(!(await validSession(request,env)))return Response.json({error:'command_center_session_expired'},{status:401,headers:JSON_H});return Response.json(await chairmanQueue(request,env,ctx,{verifyLinks:true}),{headers:JSON_H})}if(request.method==='POST'&&url.pathname==='/analytics/api/distribution-human-action')return distributionHumanAction(request,env);return base.fetch(request,env,ctx)},async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined}};
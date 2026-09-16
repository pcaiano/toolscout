import base from './traffic-integrity-worker.js';
import { classifySessionRequest, SESSION_CLASSIFICATIONS } from './session-classification.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const OWNER_MAX_AGE=31536000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIT_WINDOW_START='2026-09-15 14:51:37';
const AUDIT_WINDOW_END='2026-09-16 14:51:37';
const AUDIT_KEY='original_36_current_browser';

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
async function digestHex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
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
function hasOwnerCookie(request){
  return (request.headers.get('Cookie')||'').split(';').some(part=>part.trim()==='toolscout_owner=1');
}
function ownerCookie(){return `toolscout_owner=1; Max-Age=${OWNER_MAX_AGE}; Path=/; SameSite=Lax; Secure`}
function parseUtc(value){
  const text=String(value||'').trim();
  if(!text)return NaN;
  const date=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));
  return date.getTime();
}
function signature(row){return [String(row.path||''),String(row.source||''),String(row.referrer_host||'')].join('\n')}

async function ownerStatus(request,env){
  if(!await validSession(request,env))return Response.json({ok:false,excluded:false,reason:'unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  const wasPresent=hasOwnerCookie(request);
  const classification=classifySessionRequest(request);
  const verifiedOwner=classification===SESSION_CLASSIFICATIONS.OWNER;
  const headers=new Headers({'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'});
  headers.append('Set-Cookie',ownerCookie());
  return new Response(JSON.stringify({
    ok:true,
    excluded:true,
    cookiePresentBefore:wasPresent,
    classification,
    verifiedOwner,
    scope:'this browser on this device',
    persistentDays:365,
    canonicalHumanTrafficExcluded:verifiedOwner,
    verifiedAt:new Date().toISOString()
  }),{status:200,headers});
}

async function ensureOwnerAuditSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS owner_retrospective_audits (
    audit_key TEXT PRIMARY KEY,
    visitor_hash TEXT NOT NULL,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    total_confirmed_sessions INTEGER NOT NULL,
    owner_visitor_events INTEGER NOT NULL,
    high_confidence_matches INTEGER NOT NULL,
    medium_confidence_matches INTEGER NOT NULL,
    ambiguous_matches INTEGER NOT NULL,
    definite_owner_sessions INTEGER NOT NULL,
    unmatched_sessions INTEGER NOT NULL,
    details_json TEXT NOT NULL,
    audited_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
}

async function ownerRetrospectiveAudit(request,env){
  if(!await validSession(request,env)||!hasOwnerCookie(request))return Response.json({ok:false,reason:'unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return Response.json({ok:false,reason:'unsupported_media_type'},{status:415,headers:{'Cache-Control':'no-store'}});
  let body;
  try{body=await request.json()}catch{return Response.json({ok:false,reason:'invalid_json'},{status:400,headers:{'Cache-Control':'no-store'}})}
  const visitorId=String(body?.visitor_id||'');
  if(!UUID.test(visitorId))return Response.json({ok:false,reason:'invalid_visitor_id'},{status:400,headers:{'Cache-Control':'no-store'}});

  const [visitorRows,confirmedRows]=await Promise.all([
    env.DB.prepare(`SELECT id,path,source,referrer_host,created_at
      FROM visitor_events
      WHERE visitor_id=? AND created_at>=? AND created_at<?
      ORDER BY created_at ASC`).bind(visitorId,AUDIT_WINDOW_START,AUDIT_WINDOW_END).all(),
    env.DB.prepare(`SELECT f.session_id,f.path,f.source,f.referrer_host,f.created_at
      FROM funnel_events f
      JOIN sessions s ON s.session_id=f.session_id
      WHERE f.event_type='page_confirmed'
        AND s.classification IN ('likely-human','human')
        AND f.created_at>=? AND f.created_at<?
      ORDER BY f.created_at ASC`).bind(AUDIT_WINDOW_START,AUDIT_WINDOW_END).all()
  ]);

  const ownerEvents=(visitorRows?.results||[]).map(row=>({...row,ms:parseUtc(row.created_at),sig:signature(row)})).filter(row=>Number.isFinite(row.ms));
  const confirmedMap=new Map();
  for(const row of confirmedRows?.results||[]){
    const id=String(row.session_id||'');
    const ms=parseUtc(row.created_at);
    if(!id||!Number.isFinite(ms))continue;
    const current=confirmedMap.get(id);
    if(!current||ms<current.ms)confirmedMap.set(id,{...row,ms,sig:signature(row)});
  }
  const confirmed=[...confirmedMap.values()];
  const details=[];
  let high=0,medium=0,ambiguous=0;

  for(const session of confirmed){
    const candidates=ownerEvents.map(event=>({event,delta:Math.abs(session.ms-event.ms)})).filter(item=>item.event.sig===session.sig&&item.delta<=15000).sort((a,b)=>a.delta-b.delta);
    if(!candidates.length)continue;
    const nearest=candidates[0];
    const competingSessions=confirmed.filter(other=>other.sig===nearest.event.sig&&Math.abs(other.ms-nearest.event.ms)<=15000).length;
    let confidence='ambiguous';
    if(competingSessions===1&&nearest.delta<=3000){confidence='high';high++}
    else if(competingSessions===1){confidence='medium';medium++}
    else ambiguous++;
    details.push({at:session.created_at,path:session.path||'/',deltaSeconds:Number((nearest.delta/1000).toFixed(3)),confidence});
  }

  const definite=high+medium;
  const visitorHash=await digestHex(visitorId);
  await ensureOwnerAuditSchema(env);
  await env.DB.prepare(`INSERT INTO owner_retrospective_audits (
      audit_key,visitor_hash,window_start,window_end,total_confirmed_sessions,owner_visitor_events,
      high_confidence_matches,medium_confidence_matches,ambiguous_matches,definite_owner_sessions,
      unmatched_sessions,details_json,audited_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(audit_key) DO UPDATE SET
      visitor_hash=excluded.visitor_hash,
      window_start=excluded.window_start,
      window_end=excluded.window_end,
      total_confirmed_sessions=excluded.total_confirmed_sessions,
      owner_visitor_events=excluded.owner_visitor_events,
      high_confidence_matches=excluded.high_confidence_matches,
      medium_confidence_matches=excluded.medium_confidence_matches,
      ambiguous_matches=excluded.ambiguous_matches,
      definite_owner_sessions=excluded.definite_owner_sessions,
      unmatched_sessions=excluded.unmatched_sessions,
      details_json=excluded.details_json,
      audited_at=datetime('now')`)
    .bind(AUDIT_KEY,visitorHash,AUDIT_WINDOW_START,AUDIT_WINDOW_END,confirmed.length,ownerEvents.length,high,medium,ambiguous,definite,Math.max(0,confirmed.length-definite-ambiguous),JSON.stringify(details)).run();

  return Response.json({
    ok:true,
    scope:'current browser only',
    windowStart:AUDIT_WINDOW_START+' UTC',
    windowEnd:AUDIT_WINDOW_END+' UTC',
    totalConfirmedSessions:confirmed.length,
    ownerVisitorEvents:ownerEvents.length,
    highConfidenceMatches:high,
    mediumConfidenceMatches:medium,
    ambiguousMatches:ambiguous,
    definiteOwnerSessions:definite,
    unmatchedSessions:Math.max(0,confirmed.length-definite-ambiguous),
    note:'This audit identifies sessions from the current browser identifier. Other owner browsers or devices require their own audit.'
  },{headers:{'Cache-Control':'private, no-store'}});
}

function ownerScript(){return `<script data-toolscout-owner-exclusion="1">(function(){
if(window.__toolscoutOwnerExclusion)return;window.__toolscoutOwnerExclusion=true;
var ownerState=null,auditState=null,observer=null,attachTimer=null,auditStarted=false;
function localCookie(){return document.cookie.split(';').some(function(part){return part.trim()==='toolscout_owner=1'})}
function activeState(state){return !!(state&&state.ok&&state.excluded&&state.verifiedOwner===true&&state.canonicalHumanTrafficExcluded===true&&localCookie())}
function visitorId(){try{var saved=JSON.parse(localStorage.getItem('toolscout_visitor_v1')||'null');return saved&&typeof saved.id==='string'?saved.id:''}catch(e){return''}}
function renderRows(){
  var root=document.getElementById('healthBody');if(!root)return false;
  if(ownerState&&!document.getElementById('ownerExclusionRow')){
    var div=document.createElement('div');div.id='ownerExclusionRow';div.className='row';
    var active=activeState(ownerState);
    var label=active?'Owner exclusion active on this browser':'Owner exclusion verification pending';
    var meta=active?'Persistent for 365 days. D1 classifies this browser as owner and excludes it from canonical human traffic.':'The Command Center is registering and verifying this browser as owner.';
    div.innerHTML='<div><div class="rowName">'+label+'</div><div class="rowMeta">'+meta+'</div></div><div class="rowValue">'+(active?'Active':'Pending')+'</div>';
    root.prepend(div);
  }
  if(auditState&&!document.getElementById('ownerAuditRow')){
    var row=document.createElement('div');row.id='ownerAuditRow';row.className='row';
    var ok=auditState.ok===true;
    var value=ok?String(auditState.definiteOwnerSessions)+' / '+String(auditState.totalConfirmedSessions):'Unavailable';
    var meta=ok?('Current browser only. High confidence '+auditState.highConfidenceMatches+', medium confidence '+auditState.mediumConfidenceMatches+', ambiguous '+auditState.ambiguousMatches+'.'):'No persistent visitor identifier was available for this browser.';
    row.innerHTML='<div><div class="rowName">Retrospective owner audit</div><div class="rowMeta">'+meta+'</div></div><div class="rowValue">'+value+'</div>';
    var owner=document.getElementById('ownerExclusionRow');if(owner&&owner.nextSibling)root.insertBefore(row,owner.nextSibling);else root.prepend(row);
  }
  return true;
}
function attachObserver(n){
  var root=document.getElementById('healthBody');
  if(!root){if((n||0)<20)attachTimer=setTimeout(function(){attachObserver((n||0)+1)},250);return}
  if(observer)observer.disconnect();
  observer=new MutationObserver(function(){renderRows()});
  observer.observe(root,{childList:true});
  renderRows();
}
function runAudit(){
  if(auditStarted||!activeState(ownerState))return;auditStarted=true;
  var id=visitorId();if(!id){auditState={ok:false,reason:'visitor_id_unavailable'};renderRows();return}
  fetch('/analytics/api/owner-retrospective-audit',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor_id:id})})
    .then(function(r){return r.json()}).then(function(state){auditState=state;renderRows()}).catch(function(){auditState={ok:false,reason:'audit_failed'};renderRows()})
}
function setState(state){ownerState=state;renderRows();attachObserver(0);runAudit()}
function verify(){
  fetch('/analytics/api/owner-exclusion',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(first){
    if(!first||!first.ok){setState(first||{ok:false});return}
    setTimeout(function(){fetch('/analytics/api/owner-exclusion',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(setState).catch(function(){setState(first)})},100)
  }).catch(function(){setState({ok:false})})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){attachObserver(0);verify()},{once:true});else{attachObserver(0);verify()}
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-owner-exclusion="1"'))html=html.replace(/<\/body>/i,ownerScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.append('Set-Cookie',ownerCookie());
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/owner-exclusion')return ownerStatus(request,env);
    if(request.method==='POST'&&url.pathname==='/analytics/api/owner-retrospective-audit')return ownerRetrospectiveAudit(request,env);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};

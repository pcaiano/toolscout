import base from './audience-worker.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const safe=(v,n=2000)=>String(v??'').slice(0,n);
const rows=r=>r?.results||[];

async function assetJson(request,env,path,fallback){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback;}catch{return fallback;}
}
async function safeQuery(promise,fallback={results:[]}){try{return await promise;}catch{return fallback;}}

function distributionScore(item){
  if(Number.isFinite(Number(item.distribution_score)))return Number(item.distribution_score);
  const priority=String(item.priority||'medium');
  const type=String(item.type||'');
  const status=String(item.status||'');
  let score=priority==='high'?78:priority==='medium'?58:38;
  if(/newsletter|editorial|media|syndication|embed|marketplace/.test(type))score+=8;
  if(['live','scheduled','submitted','pending_review'].includes(status))score+=4;
  if(['rejected','not_applicable','unavailable_free'].includes(status))score-=30;
  return Math.max(0,Math.min(100,score));
}

async function distributionSnapshot(request,env){
  const [config,workflow,opportunities,events,embeds,referrals,opportunitySummary,authClasses,submissionSummary]=await Promise.all([
    assetJson(request,env,'/data/distribution-workflow.json',{items:[]}),
    safeQuery(env.DB.prepare('SELECT item_slug,status,submitted_at,response_at,live_url,notes,updated_at FROM distribution_workflow').all()),
    safeQuery(env.DB.prepare('SELECT * FROM distribution_opportunities ORDER BY distribution_score DESC LIMIT 100').all()),
    safeQuery(env.DB.prepare('SELECT event_id,surface_slug,event_type,status,asset_type,asset_id,source_url,destination_url,detail,human_sessions,outbound_clicks,monetized_outbound,revenue,observed_at,created_at FROM distribution_events ORDER BY created_at DESC LIMIT 40').all()),
    safeQuery(env.DB.prepare("SELECT embed_id,embed_type,publisher_host,asset_id,status,impressions,interactions,clicks,first_seen_at,last_seen_at FROM distribution_embeds WHERE status!='retired' ORDER BY interactions DESC,last_seen_at DESC LIMIT 100").all()),
    safeQuery(env.DB.prepare("SELECT COUNT(DISTINCT f.session_id) AS human_sessions, SUM(CASE WHEN f.event_type='outbound_clicked' THEN 1 ELSE 0 END) AS outbound_clicks FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.created_at>=datetime('now','-30 days') AND (lower(COALESCE(f.source,'')) LIKE '%utm_medium=distribution%' OR lower(COALESCE(f.source,'')) LIKE '%distribution_engine%')").first(),{}),
    safeQuery(env.DB.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN status IN ('candidate','discovered','research_required') AND COALESCE(human_required,0)=0 THEN 1 ELSE 0 END) autonomous_research,
      SUM(CASE WHEN status='ready_to_submit' AND COALESCE(human_required,0)=0 THEN 1 ELSE 0 END) machine_ready,
      SUM(CASE WHEN status IN ('auth_required','human_action_required','approval_required') OR COALESCE(human_required,0)=1 THEN 1 ELSE 0 END) human_sidecar,
      SUM(CASE WHEN status IN ('scheduled','submitted','pending_review') THEN 1 ELSE 0 END) in_flight,
      SUM(CASE WHEN status IN ('verified','live') THEN 1 ELSE 0 END) verified_live,
      SUM(CASE WHEN status IN ('policy_blocked','rejected','skipped','unavailable_free') THEN 1 ELSE 0 END) closed
      FROM distribution_opportunities`).first(),{}),
    safeQuery(env.DB.prepare("SELECT automation_class,credential_state,COUNT(*) n FROM auth_automation_capability GROUP BY automation_class,credential_state").all()),
    safeQuery(env.DB.prepare("SELECT status,COUNT(*) n FROM distribution_submissions GROUP BY status").all())
  ]);
  const wmap=new Map(rows(workflow).map(x=>[String(x.item_slug),x]));
  const omap=new Map(rows(opportunities).map(x=>[String(x.surface_slug),x]));
  const configured=(config.items||[]).map(item=>{
    const w=wmap.get(item.slug)||{};
    const o=omap.get(item.slug)||{};
    const status=w.status||o.status||item.status||'research_required';
    const humanRequired=['needs_info','human_action_required'].includes(status)||Boolean(o.human_required);
    return {
      slug:item.slug,name:item.name,type:item.type,status,priority:item.priority||'medium',
      score:Number(o.distribution_score??distributionScore({...item,status})),
      liveUrl:w.live_url||o.live_url||item.live_url||null,
      actionUrl:o.action_url||item.action_url||null,
      nextAction:o.next_action||item.next_action||null,
      humanRequired,
      updatedAt:w.updated_at||o.updated_at||item.verified_at||null
    };
  });
  for(const o of rows(opportunities))if(!configured.some(x=>x.slug===o.surface_slug))configured.push({slug:o.surface_slug,name:o.surface_name,type:o.surface_type,status:o.status,priority:'dynamic',score:Number(o.distribution_score||0),liveUrl:o.live_url||null,actionUrl:o.action_url||null,nextAction:o.next_action||null,humanRequired:Boolean(o.human_required),updatedAt:o.updated_at||null});
  const counts={};for(const x of configured)counts[x.status]=(counts[x.status]||0)+1;
  const active=configured.filter(x=>['live','scheduled','submitted','pending_review'].includes(x.status)).length;
  const humanRequired=configured.filter(x=>x.humanRequired);
  const embedRows=rows(embeds);const embedImpressions=embedRows.reduce((a,x)=>a+Number(x.impressions||0),0),embedInteractions=embedRows.reduce((a,x)=>a+Number(x.interactions||0),0),embedClicks=embedRows.reduce((a,x)=>a+Number(x.clicks||0),0);
  const eventRows=rows(events);
  const revenue=eventRows.reduce((a,x)=>a+Number(x.revenue||0),0);
  const referralSessions=Number(referrals?.human_sessions||0),outbound=Number(referrals?.outbound_clicks||0);
  const summary=opportunitySummary||{};
  const authClassCounts=Object.fromEntries(rows(authClasses).map(x=>[String(x.automation_class||'unknown'),Number(x.n||0)]));
  const submissionCounts=Object.fromEntries(rows(submissionSummary).map(x=>[String(x.status||'unknown'),Number(x.n||0)]));
  const executionLanes={
    autonomousResearch:Number(summary.autonomous_research||0),
    machineReady:Number(summary.machine_ready||0),
    humanSidecar:Number(summary.human_sidecar||0),
    inFlight:Number(summary.in_flight||0),
    verifiedLive:Number(summary.verified_live||0),
    closed:Number(summary.closed||0),
    publicAutomatic:Number(authClassCounts.public_automatic||0),
    tokenAutomatic:Number(authClassCounts.token_automatic||0),
    sessionAutomatic:Number(authClassCounts.session_automatic||0),
    bootstrapSidecar:Number(authClassCounts.human_bootstrap_then_automatic||0)+Number(authClassCounts.session_bootstrap_sidecar||0),
    challengeSidecar:Number(authClassCounts.human_challenge_sidecar||0),
    manualSidecar:Number(authClassCounts.human_manual_sidecar||0)
  };
  return {
    status:'connected',windowDays:30,lastActivityAt:eventRows[0]?.observed_at||eventRows[0]?.created_at||null,
    opportunities:Number(summary.total||configured.length),activeSurfaces:Number(summary.in_flight||0)+Number(summary.verified_live||0)||active,humanRequired:Number(summary.human_sidecar||humanRequired.length),
    submitted:(counts.submitted||0)+(counts.pending_review||0),accepted:counts.live||0,rejected:counts.rejected||0,pending:(counts.scheduled||0)+(counts.submitted||0)+(counts.pending_review||0),
    referralHumanSessions:referralSessions,outboundClicks:outbound,sessionToOutboundCtr:referralSessions?Number((outbound/referralSessions*100).toFixed(1)):null,
    embeds:{active:embedRows.length,impressions:embedImpressions,interactions:embedInteractions,clicks:embedClicks,interactionRate:embedImpressions?Number((embedInteractions/embedImpressions*100).toFixed(1)):null},
    executionLanes,submissionQueue:submissionCounts,
    revenue,revenuePer1000Sessions:referralSessions?Number((revenue/referralSessions*1000).toFixed(2)):null,
    topSurfaces:[...configured].sort((a,b)=>b.score-a.score).slice(0,10),humanQueue:humanRequired.slice(0,20),activity:eventRows.slice(0,20)
  };
}

async function ingestDistributionEvent(request,env){
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
  let b={};try{b=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_HEADERS});}
  const eventId=safe(b.event_id,120)||`dist_${crypto.randomUUID()}`;
  const eventType=safe(b.event_type,80);if(!eventType)return Response.json({error:'event_type_required'},{status:400,headers:JSON_HEADERS});
  try{
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,asset_id,source_url,destination_url,detail,human_sessions,outbound_clicks,monetized_outbound,revenue,observed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(event_id) DO NOTHING`)
      .bind(eventId,safe(b.surface_slug,120)||null,eventType,safe(b.status,50)||null,safe(b.asset_type,50)||null,safe(b.asset_id,160)||null,safe(b.source_url,2000)||null,safe(b.destination_url,2000)||null,safe(b.detail,4000)||null,b.human_sessions==null?null:Number(b.human_sessions),b.outbound_clicks==null?null:Number(b.outbound_clicks),b.monetized_outbound==null?null:Number(b.monetized_outbound),b.revenue==null?null:Number(b.revenue),safe(b.observed_at,80)||new Date().toISOString()).run();
    return Response.json({ok:true,event_id:eventId},{headers:JSON_HEADERS});
  }catch(e){return Response.json({error:'distribution_event_store_failed',message:String(e?.message||e)},{status:500,headers:JSON_HEADERS});}
}

function injectDistribution(html){
  if(html.includes('id="distributionEngineSection"'))return html;
  const section=`<section class="section" id="distributionEngineSection"><div class="sectionHead"><h2>Distribution Engine</h2><span>Global · automation-first</span></div><div class="grid4" id="distributionMetrics"></div><div class="grid2 section"><div class="panel"><div class="sectionHead"><h2>Priority surfaces</h2><span>Distribution Score</span></div><div id="distributionSurfaces" class="note">Refresh to load.</div></div><div class="panel"><div class="sectionHead"><h2>Human Required</h2><span>Exception queue</span></div><div id="distributionHuman" class="note">Refresh to load.</div></div></div><div class="grid2 section"><div class="panel"><div class="sectionHead"><h2>Execution lanes</h2><span>Current routing</span></div><div id="distributionLanes" class="note">Refresh to load.</div></div><div class="panel"><div class="sectionHead"><h2>Submission queue</h2><span>Delivery states</span></div><div id="distributionQueue" class="note">Refresh to load.</div></div></div><div class="grid2 section"><div class="panel"><div class="sectionHead"><h2>Embedded distribution</h2><span>Finder · Compare · Pick</span></div><div id="distributionEmbeds" class="note">Refresh to load.</div></div><div class="panel"><div class="sectionHead"><h2>Recent activity</h2><span>What the engine did</span></div><div id="distributionActivity" class="note">Refresh to load.</div></div></div></section>`;
  const marker='<section class="section"><div class="sectionHead"><h2>Revenue & coverage</h2>';
  let out=html.includes(marker)?html.replace(marker,section+marker):html.replace('</body>',section+'</body>');
  const script=`<script>(function(){function n(v){return Number(v||0).toLocaleString()}function pct(v){return v==null?'—':Number(v).toFixed(1)+'%'}function money(v){return v==null?'—':'$'+Number(v).toFixed(2)}function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]})}function metric(l,v,m){return '<div class="card"><small>'+esc(l)+'</small><b>'+esc(v)+'</b><span>'+esc(m)+'</span></div>'}function row(nm,v,m){return '<div class="row"><div><div class="name">'+esc(nm)+'</div><div class="meta">'+esc(m||'')+'</div></div><div class="value">'+esc(v)+'</div></div>'}function render(d){var x=d&&d.distribution;if(!x||x.status!=='connected')return;var m=document.getElementById('distributionMetrics');if(m)m.innerHTML=metric('Active surfaces',n(x.activeSurfaces),n(x.opportunities)+' known opportunities')+metric('Human Required',n(x.humanRequired),'Only actions automation cannot safely complete')+metric('Distribution humans',n(x.referralHumanSessions),'Likely-human · 30 days')+metric('Distribution outbound',n(x.outboundClicks),pct(x.sessionToOutboundCtr)+' session → outbound');var s=document.getElementById('distributionSurfaces');if(s)s.innerHTML=(x.topSurfaces||[]).length?(x.topSurfaces||[]).map(function(a){return row(a.name,Number(a.score||0).toFixed(0),a.type+' · '+a.status+(a.nextAction?' · '+a.nextAction:''))}).join(''):'<div class="note">No distribution surfaces loaded.</div>';var h=document.getElementById('distributionHuman');if(h)h.innerHTML=(x.humanQueue||[]).length?(x.humanQueue||[]).map(function(a){return row(a.name,a.status,a.nextAction||'Manual intervention required')}).join(''):'<div class="note">Nothing currently requires owner intervention.</div>';var l=document.getElementById('distributionLanes');if(l){var z=x.executionLanes||{};l.innerHTML=row('Machine ready',n(z.machineReady),'Qualified zero-cost surfaces ready for an executor')+row('Autonomous research',n(z.autonomousResearch),'Machine-owned discovery and qualification backlog')+row('Bootstrap sidecar',n(z.bootstrapSidecar),'One-time auth/token bootstrap; does not block autonomous work')+row('Human challenge',n(z.challengeSidecar),'CAPTCHA or interactive verification sidecar')+row('Manual sidecar',n(z.manualSidecar),'Exact manual route when no safe machine executor exists')+row('In flight',n(z.inFlight),'Submitted, scheduled or pending review')+row('Verified / live',n(z.verifiedLive),'Publicly verified placements');}var q=document.getElementById('distributionQueue');if(q){var sq=x.submissionQueue||{};q.innerHTML=row('Queued external',n(sq.queued_external),'Authorized for Render execution')+row('Ready',n(sq.ready),'Packaged for execution')+row('Submitted',n(sq.submitted),'Awaiting public verification')+row('Verified',n(sq.verified),'Confirmed delivery')+row('Failed',n(sq.failed),'Retry/terminal state under delivery policy');}var e=document.getElementById('distributionEmbeds');if(e)e.innerHTML=row('Active embeds',n(x.embeds&&x.embeds.active),'Observed publishers/assets')+row('Impressions',n(x.embeds&&x.embeds.impressions),'Tracked embed loads')+row('Interactions',n(x.embeds&&x.embeds.interactions),pct(x.embeds&&x.embeds.interactionRate)+' interaction rate')+row('Clicks',n(x.embeds&&x.embeds.clicks),'Clicks back into ToolScout');var a=document.getElementById('distributionActivity');if(a)a.innerHTML=(x.activity||[]).length?(x.activity||[]).map(function(v){return row(v.surface_slug||v.asset_id||'Distribution',v.event_type,(v.status||'')+(v.detail?' · '+v.detail:''))}).join(''):'<div class="note">No Distribution Engine events recorded yet.</div>';}
var old=window.fetch;window.fetch=async function(){var r=await old.apply(this,arguments);try{var u=String(arguments[0]&&arguments[0].url||arguments[0]||'');if(u.indexOf('/api/stats')!==-1){r.clone().json().then(render).catch(function(){})}}catch(e){}return r};})();</script>`;
  return out.replace('</body>',script+'</body>');
}

async function augmentStats(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);if(!upstream.ok)return upstream;
  let data={};try{data=await upstream.json();}catch{return upstream;}
  const distribution=await distributionSnapshot(request,env);
  return Response.json({...data,distribution},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, max-age=60'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution-event'&&request.method==='POST')return ingestDistributionEvent(request,env);
    if(url.pathname==='/api/stats'&&request.method==='GET')return augmentStats(request,env,ctx);
    if(url.pathname==='/analytics.html'&&request.method==='GET'){
      const response=await base.fetch(request,env,ctx);if(!response.ok)return response;
      const type=response.headers.get('Content-Type')||'';if(!type.includes('text/html'))return response;
      const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');
      return new Response(injectDistribution(await response.text()),{status:response.status,headers});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};

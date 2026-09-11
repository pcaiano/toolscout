import base from './distribution-orchestrator-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, max-age=60'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;

async function digestHex(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000));}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`);}
async function validSession(request,env){if(!env.ADMIN_TOKEN)return false;const cookie=request.headers.get('Cookie')||'';const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));if(!match)return false;const supplied=decodeURIComponent(match[1]);const bucket=sessionBucket();for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;return false;}
function isAnalyticsPage(pathname){return pathname==='/analytics.html'||pathname==='/analytics'||pathname==='/analytics/';}
async function q(env,sql){try{return await env.DB.prepare(sql).all();}catch{return{results:[]}}}
async function one(env,sql){try{return await env.DB.prepare(sql).first();}catch{return{}}}
async function ops(env){
  const [
    subs,editorial,assets,learned,events,embeds,genericEmbedClicks,
    researchRequired,preQueueBlocked,setupRequired,approvalRequired,authRequiredAll,
    publicVerified,machineDiscovery,agentProtocol,submittedSurfaces,
    indexNowSubmitted,pendingReview,operating
  ]=await Promise.all([
    q(env,`SELECT CASE WHEN ds.status='adapter_missing' AND EXISTS (SELECT 1 FROM distribution_opportunities o WHERE o.surface_slug=ds.surface_slug AND o.human_required=1) THEN 'human_required' ELSE ds.status END status,COUNT(*) n FROM distribution_submissions ds GROUP BY CASE WHEN ds.status='adapter_missing' AND EXISTS (SELECT 1 FROM distribution_opportunities o WHERE o.surface_slug=ds.surface_slug AND o.human_required=1) THEN 'human_required' ELSE ds.status END`),
    q(env,`SELECT status,COUNT(*) n FROM distribution_editorial_queue GROUP BY status`),
    one(env,`SELECT COUNT(*) assets,MAX(last_seen_at) last_seen FROM distribution_asset_state`),
    one(env,`SELECT COUNT(*) learned,AVG(performance_score) avg_performance,MAX(learned_at) learned_at FROM distribution_opportunities WHERE learned_at IS NOT NULL`),
    one(env,`SELECT COUNT(*) events,MAX(created_at) last_event FROM distribution_events`),
    one(env,`SELECT COUNT(*) installations,COUNT(DISTINCT publisher_host) publishers,COALESCE(SUM(impressions),0) impressions,COALESCE(SUM(interactions),0) interactions,COALESCE(SUM(clicks),0) clicks,MAX(last_seen_at) last_seen FROM distribution_embeds`),
    one(env,`SELECT COUNT(*) clicks,COUNT(DISTINCT source_host) publishers,MAX(created_at) last_seen FROM distribution_embed_clicks`),
    one(env,`SELECT COUNT(*) n FROM distribution_opportunities o WHERE o.status IN ('candidate','discovered','research_required') AND COALESCE(o.human_required,0)=0`),
    one(env,`SELECT COUNT(*) n FROM distribution_opportunities o WHERE o.status='policy_blocked' AND NOT EXISTS (SELECT 1 FROM distribution_submissions ds WHERE ds.surface_slug=o.surface_slug AND ds.status='policy_blocked')`),
    one(env,`SELECT COUNT(*) n FROM distribution_opportunities o WHERE o.status='needs_info' AND COALESCE(o.human_required,0)=0 AND NOT EXISTS (SELECT 1 FROM distribution_submissions ds WHERE ds.surface_slug=o.surface_slug AND ds.status='setup_required')`),
    one(env,`SELECT COUNT(*) n FROM distribution_opportunities o WHERE o.status='approval_required'`),
    one(env,`SELECT COUNT(*) n FROM (SELECT surface_slug FROM distribution_opportunities WHERE status='auth_required' UNION SELECT surface_slug FROM distribution_submissions WHERE status='auth_required')`),
    one(env,`SELECT COUNT(*) n FROM distribution_opportunities WHERE status IN ('live','verified') AND surface_type<>'machine_discovery'`),
    one(env,`SELECT COUNT(*) n FROM distribution_opportunities WHERE surface_type='machine_discovery' AND status IN ('live','verified')`),
    q(env,`SELECT protocol,COUNT(*) calls,SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) successful,COALESCE(SUM(result_count),0) recommendations,MAX(created_at) last_seen FROM agent_protocol_events GROUP BY protocol`),
    one(env,`SELECT COUNT(DISTINCT surface_slug) n FROM distribution_submissions WHERE status='submitted' AND surface_slug<>'indexnow'`),
    one(env,`SELECT COUNT(*) n FROM distribution_submissions WHERE surface_slug='indexnow' AND status='submitted'`),
    one(env,`SELECT COUNT(*) n FROM distribution_opportunities WHERE status='pending_review'`),
    q(env,`SELECT COALESCE(l.operating_decision,'explore') status,COUNT(*) n FROM distribution_opportunities o LEFT JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug GROUP BY COALESCE(l.operating_decision,'explore')`)
  ]);
  const map=r=>Object.fromEntries((r.results||[]).map(x=>[x.status,Number(x.n||0)]));
  const s=map(subs),e=map(editorial),o=map(operating);
  const agent=Object.fromEntries((agentProtocol.results||[]).map(x=>[x.protocol,{calls:Number(x.calls||0),successful:Number(x.successful||0),recommendations:Number(x.recommendations||0),lastSeenAt:x.last_seen||null}]));
  const trackedClicks=Number(embeds?.clicks||0),redirectClicks=Number(genericEmbedClicks?.clicks||0);
  return {
    status:'connected',
    assetsKnown:Number(assets?.assets||0),
    lastAssetSeenAt:assets?.last_seen||null,
    submissions:{
      ready:s.ready||0,
      submitted:s.submitted||0,
      submittedSurfaces:Number(submittedSurfaces?.n||0),
      indexNowSubmitted:Number(indexNowSubmitted?.n||0),
      pendingReview:Number(pendingReview?.n||0),
      failed:s.failed||0,
      humanRequired:s.human_required||0,
      adapterMissing:s.adapter_missing||0,
      authRequired:Number(authRequiredAll?.n||0),
      policyBlocked:(s.policy_blocked||0)+Number(preQueueBlocked?.n||0),
      setupRequired:(s.setup_required||0)+Number(setupRequired?.n||0),
      approvalRequired:Number(approvalRequired?.n||0),
      researchRequired:Number(researchRequired?.n||0),
      publicVerified:Number(publicVerified?.n||0),
      machineDiscovery:Number(machineDiscovery?.n||0)
    },
    operating:{scale:o.scale||0,measure:o.measure||0,explore:o.explore||0,suspend:o.suspend||0},
    editorial:{prepared:e.prepared||0,published:e.published||0,skipped:e.skipped||0},
    embeds:{installations:Number(embeds?.installations||0),publishers:Math.max(Number(embeds?.publishers||0),Number(genericEmbedClicks?.publishers||0)),impressions:Number(embeds?.impressions||0),interactions:Number(embeds?.interactions||0),clicks:trackedClicks+redirectClicks,lastSeenAt:embeds?.last_seen||genericEmbedClicks?.last_seen||null},
    agentProtocols:{mcp:agent.mcp||{calls:0,successful:0,recommendations:0,lastSeenAt:null},a2a:agent.a2a||{calls:0,successful:0,recommendations:0,lastSeenAt:null}},
    learning:{surfaces:Number(learned?.learned||0),averagePerformance:Number(Number(learned?.avg_performance||0).toFixed(1)),lastLearnedAt:learned?.learned_at||null},
    events:{count:Number(events?.events||0),lastEventAt:events?.last_event||null}
  };
}
async function withOps(response,env,cacheControl='private, no-store'){if(!response.ok)return response;let d;try{d=await response.json()}catch{return response}return Response.json({...d,distributionOperations:await ops(env)},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':cacheControl}});}
function inject(html){if(html.includes('id="distributionOpsFinal"'))return html;const block=`<section class="section" id="distributionOpsFinal"><div class="sectionHead"><h2>Distribution Operations</h2><span>End-to-end engine health</span></div><div class="grid4" id="distributionOpsCards"></div><div class="panel section"><div class="sectionHead"><h2>Engine lifecycle</h2><span>Discover → Score → Package → Distribute → Amplify → Measure → Learn</span></div><div id="distributionOpsLifecycle" class="note">Refresh to load.</div></div></section>`;const js=`<script>(function(){function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]})}function card(a,b,c){return '<div class="card"><small>'+esc(a)+'</small><b>'+esc(b)+'</b><span>'+esc(c)+'</span></div>'}function render(d){var x=d&&d.distributionOperations;if(!x)return;var s=x.submissions||{},e=x.editorial||{},m=x.embeds||{},a=x.agentProtocols||{},mc=a.mcp||{},aa=a.a2a||{},o=x.operating||{};var c=document.getElementById('distributionOpsCards');if(c)c.innerHTML=card('Assets known',x.assetsKnown,'Event-driven distribution state')+card('Scale',o.scale||0,'Strong evidence, highest operating priority')+card('Measure',o.measure||0,'Directional evidence or committed experiment')+card('Explore',o.explore||0,'Bounded discovery of free surfaces')+card('Suspend',o.suspend||0,'Blocked or insufficient-return surfaces')+card('Submitted surfaces',s.submittedSurfaces||0,'Distinct external surfaces with accepted submissions')+card('Public live / verified',s.publicVerified,'Confirmed third-party public destinations')+card('Pending review',s.pendingReview||0,'Submitted surfaces awaiting editorial approval')+card('IndexNow URLs',s.indexNowSubmitted||0,'Distinct URL submission records accepted by IndexNow')+card('Machine discovery',s.machineDiscovery,'Live first-party agent/API discovery surfaces')+card('MCP calls',mc.calls||0,(mc.successful||0)+' successful · '+(mc.recommendations||0)+' recommendations')+card('A2A messages',aa.calls||0,(aa.successful||0)+' successful · '+(aa.recommendations||0)+' recommendations')+card('Automation gaps',s.adapterMissing,'Ready surfaces awaiting verified adapters')+card('Research required',s.researchRequired,'Candidates awaiting route verification')+card('Auth required',s.authRequired,'One-time credential or identity setup')+card('Setup required',s.setupRequired,'Metadata, profile or media prerequisites')+card('Approval required',s.approvalRequired,'Provider or paid policy requires explicit approval')+card('Policy blocked',s.policyBlocked,'Paid, reciprocal or disallowed by policy')+card('Human required',(s.humanRequired||0)+(e.prepared||0),'Truly manual or reputation-sensitive')+card('Embed publishers',m.publishers||0,(m.impressions||0)+' impressions · '+(m.clicks||0)+' clicks')+card('Learning surfaces',x.learning&&x.learning.surfaces,'Avg performance '+(x.learning&&x.learning.averagePerformance||0));var l=document.getElementById('distributionOpsLifecycle');if(l)l.innerHTML='Discovery, scoring, syndication, embeds, agent protocols, vendor amplification, guarded submissions, editorial preparation and economic learning are connected. Operating state: '+esc(o.scale||0)+' scale · '+esc(o.measure||0)+' measure · '+esc(o.explore||0)+' explore · '+esc(o.suspend||0)+' suspend. Embed installations: '+esc(m.installations||0)+' · MCP last seen: '+esc(mc.lastSeenAt||'n/a')+' · A2A last seen: '+esc(aa.lastSeenAt||'n/a')+' · last engine event: '+esc(x.events&&x.events.lastEventAt||'n/a');}var f=window.fetch;window.fetch=async function(){var r=await f.apply(this,arguments);try{var u=String(arguments[0]&&arguments[0].url||arguments[0]||'');if(u.indexOf('/api/stats')!==-1)r.clone().json().then(render).catch(function(){})}catch(e){}return r};})();</script>`;return html.replace('</body>',block+js+'</body>');}
async function protectedStats(request,env,ctx){if(!(await validSession(request,env)))return Response.json({error:'command_center_session_expired'},{status:401,headers:{'Cache-Control':'no-store'}});const internalUrl=new URL(request.url);internalUrl.protocol='https:';internalUrl.hostname='toolscout-command-center.internal';internalUrl.pathname='/api/stats';internalUrl.search='';const headers=new Headers(request.headers);headers.set('Authorization',`Bearer ${env.ADMIN_TOKEN}`);headers.delete('Cookie');const internalRequest=new Request(internalUrl.toString(),{method:'GET',headers});return withOps(await base.fetch(internalRequest,env,ctx),env);}
async function serveCommandCenter(request,env){if(!env.ADMIN_TOKEN)return new Response('Command Center unavailable',{status:503,headers:{'Cache-Control':'no-store'}});const assetUrl=new URL('/analytics.html',request.url);let r=await env.ASSETS.fetch(new Request(assetUrl.toString(),{method:'GET',headers:{'Accept':'text/html'}}));if(!r.ok){const fallbackUrl=new URL('/analytics',request.url);r=await env.ASSETS.fetch(new Request(fallbackUrl.toString(),{method:'GET',headers:{'Accept':'text/html'}}));}if(!r.ok)return new Response('Command Center asset unavailable',{status:502,headers:{'Cache-Control':'no-store'}});const t=r.headers.get('Content-Type')||'';if(!t.includes('text/html'))return new Response('Command Center asset invalid',{status:502,headers:{'Cache-Control':'no-store'}});const h=new Headers(r.headers);h.set('Cache-Control','private, no-store');h.delete('Location');const value=await sessionValue(env.ADMIN_TOKEN,sessionBucket());h.append('Set-Cookie',`${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/analytics; HttpOnly; Secure; SameSite=Lax`);return new Response(inject(await r.text()),{status:200,headers:h});}
export default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/analytics/api/stats'&&request.method==='GET')return protectedStats(request,env,ctx);if(u.pathname==='/api/stats'&&request.method==='GET')return withOps(await base.fetch(request,env,ctx),env,'private, max-age=60');if(isAnalyticsPage(u.pathname)&&request.method==='GET')return serveCommandCenter(request,env);return base.fetch(request,env,ctx);},async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}};
import base from './distribution-learning-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const hostSlug=h=>h.replace(/^www\./,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,110);
const RELEVANT=/(ai|agent|mcp|a2a|ard|registry|api|tool|software|saas|startup|launch|directory|product|newsletter|app|resource|editorial|publisher|media|community|partner|press|roundup|comparison|review|curated|contribute|write-for-us)/i;
const SOURCE_LIKE=/(directories|directory-list|registr(?:y|ies)|resource-list|resources|resource-page|software-resources|tool-list|software-list|best-tools|where-to-submit|submit-(?:your|to)|launch-list|startup-list|ai-tools-list|awesome-|curated-list|roundup|comparison|newsletter|publisher-list|media-list|community-list|partner-list|contribute|write-for-us|guest-post)/i;
const FAMILY_BOOST_CAP=10;
const TECHNICAL_HOST_RE=/^(?:api|cdn|static|assets|asset|img|images|media|js|css|fonts|edge|storage)\./i;
const TECHNICAL_HOST_SUFFIXES=['githubassets.com','githubusercontent.com','cloudfront.net','akamaized.net','jsdelivr.net','unpkg.com','cdnjs.com'];
function technicalHost(host){
  const h=String(host||'').toLowerCase().replace(/^www\./,'');
  return TECHNICAL_HOST_RE.test(h)||TECHNICAL_HOST_SUFFIXES.some(x=>h===x||h.endsWith('.'+x));
}
async function suppressTechnicalNoise(env){
  try{
    const r=await env.DB.prepare(`UPDATE distribution_opportunities
      SET status='skipped',next_action='Filtered automatically: technical infrastructure host is not an audience-bearing distribution surface.',updated_at=datetime('now')
      WHERE status NOT IN ('live','verified','submitted','pending_review','rejected','policy_blocked','skipped')
        AND surface_slug NOT IN ('indexnow')
        AND (
          LOWER(action_url) LIKE 'https://api.%'
          OR LOWER(action_url) LIKE 'https://cdn.%'
          OR LOWER(action_url) LIKE 'https://static.%'
          OR LOWER(action_url) LIKE 'https://assets.%'
          OR LOWER(action_url) LIKE 'https://asset.%'
          OR LOWER(action_url) LIKE 'https://img.%'
          OR LOWER(action_url) LIKE 'https://images.%'
          OR LOWER(action_url) LIKE 'https://media.%'
          OR LOWER(action_url) LIKE '%githubassets.com%'
          OR LOWER(action_url) LIKE '%githubusercontent.com%'
          OR LOWER(action_url) LIKE '%cloudfront.net%'
          OR LOWER(action_url) LIKE '%jsdelivr.net%'
          OR LOWER(action_url) LIKE '%unpkg.com%'
        )`).run();
    return Number(r?.meta?.changes||r?.changes||0);
  }catch{return 0}
}
async function config(request,env){try{const r=await env.ASSETS.fetch(new Request(new URL('/data/distribution-discovery-sources.json',request.url)));return r.ok?await r.json():{sources:[]};}catch{return {sources:[]};}}
function links(text,base){const out=new Set();for(const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)){try{const u=new URL(m[0].replace(/[.,;:]+$/,''),base);if(u.protocol==='https:')out.add(u.href);}catch{}}return [...out];}
function b64url(value){const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');return atob(s+'='.repeat((4-s.length%4)%4));}
function bytes(value){const s=b64url(value),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
async function githubOidcValid(token){try{const parts=String(token||'').split('.');if(parts.length!==3)return false;const header=JSON.parse(b64url(parts[0])),claims=JSON.parse(b64url(parts[1]));if(header.alg!=='RS256'||!header.kid)return false;const now=Math.floor(Date.now()/1000);if(claims.iss!=='https://token.actions.githubusercontent.com'||claims.aud!=='toolscout-discovery'||claims.repository!=='pcaiano/toolscout'||claims.ref!=='refs/heads/main'||Number(claims.exp||0)<now||Number(claims.nbf||0)>now)return false;const jwks=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{headers:{Accept:'application/json'}});if(!jwks.ok)return false;const data=await jwks.json(),jwk=(data.keys||[]).find(x=>x.kid===header.kid&&x.kty==='RSA');if(!jwk)return false;const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));}catch{return false}}
async function authorized(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)return true;return githubOidcValid(t);}
function publicHttps(raw){try{const u=new URL(raw);if(u.protocol!=='https:')return null;const h=u.hostname.toLowerCase().replace(/^www\./,'');if(!h||h==='localhost'||h.endsWith('.local')||h.endsWith('.internal'))return null;if(/^127\.|^10\.|^169\.254\.|^192\.168\.|^0\./.test(h))return null;const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return null;if(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80:'))return null;return u;}catch{return null}}
function candidate(raw,source,guardrails={}){const x=publicHttps(raw);if(!x)return null;const host=x.hostname.toLowerCase(),bareHost=host.replace(/^www\./,'');if(bareHost==='trytoolscout.org'||technicalHost(bareHost))return null;const canonical=guardrails.canonical_hosts||{},overrides=guardrails.host_status_overrides||{},override=overrides[bareHost]||{},slug=String(canonical[bareHost]||hostSlug(bareHost));if(!slug)return null;const text=(bareHost+' '+x.pathname).toLowerCase();if(!RELEVANT.test(text))return null;const type=/\b(ard|registry|mcp|a2a|agent)\b/.test(text)?'agent_registry':/\bapi\b/.test(text)?'api_directory':/newsletter/.test(text)?'newsletter':/partner/.test(text)?'partner_resource':/community/.test(text)?'community_resource':/resource|editorial|publisher|media|press|roundup|comparison|review|curated|contribute|write-for-us/.test(text)?'editorial_resource':/launch|startup/.test(text)?'launch_surface':/directory|tool|software|app/.test(text)?'directory':'distribution_surface';return {slug,name:bareHost,type,url:x.origin+'/',host:bareHost,source,status:String(override.status||'discovered'),human_required:Number(override.human_required||0),next_action:String(override.next_action||`Verify opportunity discovered via ${source}; classify submission path before execution.`)};}
function recursiveSource(raw,parent){const u=publicHttps(raw);if(!u)return null;const host=u.hostname.toLowerCase().replace(/^www\./,'');if(host==='trytoolscout.org'||technicalHost(host))return null;const fingerprint=`${host}${u.pathname}`;if(!SOURCE_LIKE.test(fingerprint))return null;u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|ref$|source$/i.test(k))u.searchParams.delete(k);return {slug:`recursive-${hostSlug(host+'-'+u.pathname)}`.slice(0,120),url:u.toString(),host,parent};}
async function familySignals(env){
  try{
    const q=await env.DB.prepare(`SELECT o.surface_type,COUNT(*) evidence_surfaces,AVG(COALESCE(e.economic_boost,0)) avg_boost,SUM(COALESCE(e.human_sessions_30d,0)) humans,SUM(COALESCE(e.monetized_outbound_30d,0)) monetized,SUM(COALESCE(e.confirmed_revenue_30d,0)) revenue FROM distribution_opportunities o JOIN distribution_economic_learning e ON e.surface_slug=o.surface_slug WHERE COALESCE(e.economic_boost,0)>0 GROUP BY o.surface_type`).all();
    const map=new Map();
    for(const r of q.results||[]){
      const confidence=Math.min(1,Number(r.evidence_surfaces||0)/3);
      const raw=Math.max(0,Number(r.avg_boost||0))*0.3*confidence;
      map.set(String(r.surface_type||'distribution_surface'),{boost:Number(Math.min(FAMILY_BOOST_CAP,raw).toFixed(2)),evidence:Number(r.evidence_surfaces||0),humans:Number(r.humans||0),monetized:Number(r.monetized||0),revenue:Number(r.revenue||0)});
    }
    return map;
  }catch{return new Map();}
}
async function dynamicSources(env,limit){try{const q=await env.DB.prepare(`SELECT s.source_slug AS slug,s.source_url AS url,'recursive' AS type,1 AS enabled,COALESCE(e.economic_boost,0) parent_economic_boost FROM distribution_discovery_sources s LEFT JOIN distribution_opportunities o ON o.surface_slug=s.parent_surface_slug LEFT JOIN distribution_economic_learning e ON e.surface_slug=o.surface_slug WHERE s.status='active' AND s.confidence>=60 ORDER BY COALESCE(e.economic_boost,0) DESC,COALESCE(s.last_scanned_at,'') ASC,s.confidence DESC LIMIT ?`).bind(limit).all();return q.results||[];}catch{return[]}}
async function rememberSource(env,s,parent){try{await env.DB.prepare(`INSERT INTO distribution_discovery_sources(source_slug,source_url,source_host,source_type,parent_surface_slug,confidence,status,created_at,updated_at) VALUES(?,?,?,?,?,60,'active',datetime('now'),datetime('now')) ON CONFLICT(source_url) DO UPDATE SET confidence=MAX(distribution_discovery_sources.confidence,60),updated_at=datetime('now')`).bind(s.slug,s.url,s.host,'recursive',parent||null).run();return true;}catch{return false}}
async function markScanned(env,slug,total,relevant){try{await env.DB.prepare(`UPDATE distribution_discovery_sources SET last_scanned_at=datetime('now'),links_seen=?,relevant_links_seen=?,confidence=MIN(95,confidence+CASE WHEN ?>=5 THEN 5 WHEN ?=0 THEN -10 ELSE 0 END),status=CASE WHEN confidence<=20 THEN 'deprioritized' ELSE status END,updated_at=datetime('now') WHERE source_slug=?`).bind(total,relevant,relevant,relevant,slug).run();}catch{}}
async function discover(request,env){
  const technicalSuppressed=await suppressTechnicalNoise(env);
  const [c,families]=await Promise.all([config(request,env),familySignals(env)]),maxFetch=Math.max(1,Math.min(24,Number(c.guardrails?.max_fetches_per_run||16))),staticSources=(c.sources||[]).filter(x=>x.enabled),dynamic=await dynamicSources(env,Math.max(0,maxFetch-staticSources.length)),sources=[...staticSources,...dynamic].slice(0,maxFetch);
  const existing=await env.DB.prepare('SELECT surface_slug FROM distribution_opportunities').all(),known=new Set((existing.results||[]).map(x=>String(x.surface_slug)));
  let scanned=0,found=0,inserted=0,recursiveAdded=0,familyBoosted=0;
  for(const s of sources){
    const sourceUrl=publicHttps(s.url);if(!sourceUrl)continue;scanned++;let r;try{r=await fetch(sourceUrl.toString(),{headers:{'User-Agent':'ToolScout-Distribution-Radar/1.2','Accept':'text/html,text/plain,application/json;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(8000)});}catch{continue}if(!r.ok)continue;
    const type=(r.headers.get('content-type')||'').toLowerCase();if(!/(text|json|xml|markdown)/.test(type))continue;const text=(await r.text()).slice(0,1000000),allLinks=links(text,sourceUrl.toString()).slice(0,Math.max(50,Number(c.guardrails?.max_candidates_per_source||50)*2));let relevantOnSource=0;
    for(const raw of allLinks.slice(0,c.guardrails?.max_candidates_per_source||50)){
      const rs=recursiveSource(raw,s.slug);if(rs&&await rememberSource(env,rs,s.slug))recursiveAdded++;
      let x;try{x=candidate(raw,s.slug,c.guardrails||{})}catch{continue}if(!x)continue;let sourceHost=sourceUrl.hostname.toLowerCase().replace(/^www\./,'');if(c.guardrails?.exclude_source_hosts&&sourceHost&&x.host===sourceHost)continue;if((c.guardrails?.exclude_hosts||[]).some(h=>x.host===String(h).toLowerCase().replace(/^www\./,'')))continue;found++;relevantOnSource++;if(known.has(x.slug))continue;
      const authorityProfile={
        editorial_resource:{base:82,audience:82,authority:88,traffic:76,backlink:94,acceptance:34,automation:28,effort:58},
        partner_resource:{base:80,audience:80,authority:86,traffic:72,backlink:92,acceptance:38,automation:30,effort:55},
        community_resource:{base:76,audience:86,authority:70,traffic:82,backlink:76,acceptance:42,automation:34,effort:48},
        newsletter:{base:75,audience:88,authority:74,traffic:84,backlink:70,acceptance:36,automation:26,effort:55},
        agent_registry:{base:72,audience:88,authority:75,traffic:78,backlink:66,acceptance:50,automation:70,effort:45},
        api_directory:{base:68,audience:72,authority:66,traffic:68,backlink:64,acceptance:50,automation:70,effort:45},
        launch_surface:{base:64,audience:78,authority:62,traffic:76,backlink:62,acceptance:46,automation:48,effort:44},
        directory:{base:58,audience:65,authority:55,traffic:60,backlink:60,acceptance:50,automation:45,effort:45},
        distribution_surface:{base:58,audience:65,authority:55,traffic:60,backlink:60,acceptance:50,automation:45,effort:45}
      }[x.type]||{base:58,audience:65,authority:55,traffic:60,backlink:60,acceptance:50,automation:45,effort:45};
      const family=families.get(x.type),familyBoost=Math.max(0,Number(family?.boost||0));
      const score=Number(Math.min(100,authorityProfile.base+familyBoost).toFixed(2));if(familyBoost>0)familyBoosted++;
      await env.DB.prepare(`INSERT OR IGNORE INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,human_required,last_checked_at,next_action,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'),datetime('now'))`).bind(x.slug,x.name,x.type,authorityProfile.audience,authorityProfile.authority,authorityProfile.traffic,authorityProfile.backlink,authorityProfile.acceptance,authorityProfile.automation,authorityProfile.effort,score,x.status,x.url,x.human_required,`${x.next_action} Authority class ${x.type}; family-learning boost ${familyBoost.toFixed(2)} from ${Number(family?.evidence||0)} proven surface(s). Editorial/resource/partner/community surfaces are prioritised when they can generate both referral humans and legitimate backlinks.`).run();known.add(x.slug);inserted++;
    }
    if(String(s.type||'')==='recursive')await markScanned(env,s.slug,allLinks.length,relevantOnSource);
  }
  const familySummary=[...families.entries()].sort((a,b)=>b[1].boost-a[1].boost).slice(0,5).map(([type,v])=>`${type}:${v.boost}`).join(', ')||'none';
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`discover_${crypto.randomUUID()}`,'external_discovery_refresh','completed','distribution_engine',`Self-expanding discovery scanned ${scanned} sources, found ${found} relevant links, added ${inserted} surfaces, learned ${recursiveAdded} recursive source candidates and family-boosted ${familyBoosted} new surfaces. Positive-only family signals: ${familySummary}.`).run();
  return {ok:true,scanned,found,inserted,technical_surfaces_suppressed:technicalSuppressed,recursive_sources_learned:recursiveAdded,family_boosted:familyBoosted,family_signals:Object.fromEntries(families)};
}
export default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/api/distribution/discovery/refresh'&&request.method==='POST'){if(!(await authorized(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await discover(request,env),{headers:H});}return base.fetch(request,env,ctx);},async scheduled(event,env,ctx){if(base.scheduled)await base.scheduled(event,env,ctx);ctx.waitUntil(discover(new Request('https://trytoolscout.org/'),env).catch(()=>{}));}};

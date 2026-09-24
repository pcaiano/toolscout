import base from './affiliate-workflow-worker.js';
import {recordExecutionProof} from './growth-execution-contract.js';
import {SOCIAL_PLATFORM_CAPABILITIES,socialPlatformCapabilityHealth} from './social-platform-capabilities.js';

const TOOLSCOUT_BLUESKY_DID='did:plc:hjawfnxtifnuqcgidlvmas76';
const BLUESKY_MAX_GRAPHEMES=300;
const BLUESKY_MAX_BYTES=3000;
const BLUESKY_REPLY_TARGET_GRAPHEMES=280;
const AUDIENCE_INGEST_TOKEN_SHA256='2cae5760a1a416aa3bbe14128c10539e157d527b1daa2f2a1df456c35099d770';
const jsonHeaders={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const safeText=(v,n=1000)=>String(v??'').slice(0,n);
const utf8Bytes=v=>new TextEncoder().encode(String(v??'')).length;
function graphemeSegments(value){
  const text=String(value??'');
  try{return [...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(text)].map(x=>x.segment)}
  catch{return Array.from(text)}
}
const graphemeLength=v=>graphemeSegments(v).length;
function normalizeBlueskyCopy(value){
  return String(value??'')
    .replace(/[\u2013\u2014]/g,'-')
    .replace(/[ \t]+/g,' ')
    .replace(/\s*\n\s*/g,' ')
    .replace(/\s{2,}/g,' ')
    .trim();
}
function withinBlueskyLimits(text,maxGraphemes=BLUESKY_MAX_GRAPHEMES){
  return graphemeLength(text)<=maxGraphemes&&utf8Bytes(text)<=BLUESKY_MAX_BYTES;
}
function takeGraphemes(text,max){
  return graphemeSegments(text).slice(0,Math.max(0,max)).join('');
}
function completeBlueskyReply(value,{target=BLUESKY_REPLY_TARGET_GRAPHEMES}={}){
  const original=normalizeBlueskyCopy(value);
  if(!original)return {text:'',changed:false,reason:'empty',originalGraphemes:0,graphemes:0,bytes:0};
  const originalGraphemes=graphemeLength(original);
  if(withinBlueskyLimits(original,target))return {text:original,changed:false,reason:'within_target',originalGraphemes,graphemes:originalGraphemes,bytes:utf8Bytes(original)};

  const hard=takeGraphemes(original,target).trim();
  const sentenceMatches=[...hard.matchAll(/(?:^|.*?)(?:[.!?](?=\s|$))/g)].map(m=>m[0].trim()).filter(Boolean);
  let text=sentenceMatches.length?sentenceMatches.at(-1):'';

  if(graphemeLength(text)<Math.min(80,Math.floor(target*0.35))){
    const words=hard.split(/\s+/).filter(Boolean);
    if(words.length){
      words.pop();
      text=words.join(' ').trim();
      text=text.replace(/[,:;\-]+$/,'').trim();
      if(text&&!/[.!?]$/.test(text))text+='.';
    }
  }
  if(!text)text=hard.replace(/[,:;\-]+$/,'').trim();
  while(text&&!withinBlueskyLimits(text,target)){
    const parts=text.replace(/[.!?]$/,'').trim().split(/\s+/);
    parts.pop();
    text=parts.join(' ').trim();
    if(text)text+='.';
  }
  return {text,changed:text!==original,reason:'rewritten_to_complete_limit',originalGraphemes,graphemes:graphemeLength(text),bytes:utf8Bytes(text)};
}
async function digestHex(value){const bytes=new TextEncoder().encode(String(value||''));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function validAudienceIngest(request){const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(token&&(await digestHex(token))===AUDIENCE_INGEST_TOKEN_SHA256)}
const publicVerifiedType=new Set(['outbound_reply','inbound_reply','content_published']);
const allowedStatus=new Set(['published','observed']);
const allowedRisk=new Set(['green','amber','red','none']);
const rows=result=>result?.results||[];

async function fetchToolScoutBlueskyPost(uri){
  if(!uri||!String(uri).startsWith('at://'))return null;
  try{
    const endpoint=new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts');
    endpoint.searchParams.append('uris',String(uri));
    const res=await fetch(endpoint,{headers:{Accept:'application/json'}});
    if(!res.ok)return null;
    const body=await res.json();
    const post=Array.isArray(body.posts)?body.posts[0]:null;
    return post&&post.uri===uri&&post.author?.did===TOOLSCOUT_BLUESKY_DID?post:null;
  }catch{return null;}
}

function flattenDevComments(nodes,out=[]){
  for(const node of Array.isArray(nodes)?nodes:[]){
    if(node&&typeof node==='object'){
      out.push(node);
      flattenDevComments(node.children,out);
    }
  }
  return out;
}
function devPlainText(value){
  return String(value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
}
async function fetchDevJson(url){
  try{
    const r=await fetch(url,{headers:{Accept:'application/vnd.forem.api-v1+json','User-Agent':'ToolScout-Audience/1.0 (+https://trytoolscout.org/)'}});
    if(!r.ok)return null;
    return await r.json();
  }catch{return null;}
}
async function devCommentCandidates(env){
  const feed=await fetchDevJson('https://dev.to/api/articles?username=trytoolscout&per_page=30');
  const articles=(Array.isArray(feed)?feed:[]).filter(x=>Number(x?.comments_count||0)>0).slice(0,12);
  const existing=await env.DB.prepare(`SELECT event_id FROM audience_events WHERE platform='devto' AND event_id LIKE 'devto-comment-%'`).all().catch(()=>({results:[]}));
  const seen=new Set((existing.results||[]).map(x=>String(x.event_id||'')));
  const out=[];
  for(const article of articles){
    if(out.length>=12)break;
    const thread=await fetchDevJson(`https://dev.to/api/comments?a_id=${Number(article.id)}&per_page=1000`);
    for(const comment of flattenDevComments(thread)){
      if(out.length>=12)break;
      const id=String(comment?.id_code||'');
      const actor=String(comment?.user?.username||'').toLowerCase();
      if(!id||!actor||actor==='trytoolscout'||seen.has(`devto-comment-${id}`))continue;
      const context=devPlainText(comment.body_html||comment.body_markdown||comment.body||'').slice(0,2000);
      if(!context)continue;
      out.push({
        article_id:Number(article.id),
        article_title:safeText(article.title,240),
        article_url:safeText(article.url,500),
        comment_id:id,
        actor_handle:actor,
        context_text:context,
        created_at:safeText(comment.created_at,80)
      });
    }
  }
  return{ok:true,platform:'devto',mode:'monitor_and_human_reply',reply_write:false,candidates:out,checked_articles:articles.length};
}

async function observeDevComment(request,env){
  let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:jsonHeaders})}
  const articleId=Number(body.article_id||0);
  const commentId=safeText(body.comment_id,80).trim();
  const decision=String(body.decision||'suggest').toLowerCase()==='skip'?'skip':'suggest';
  const suggested=safeText(body.suggestion_text,900).trim().replace(/https?:\/\/\S+/gi,'').trim();
  const suppliedRisk=String(body.risk||'green').toLowerCase();
  const risk=allowedRisk.has(suppliedRisk)?suppliedRisk:'amber';
  if(!Number.isInteger(articleId)||articleId<1||!commentId||(decision==='suggest'&&!suggested))return Response.json({ok:false,error:'invalid_dev_comment_observation'},{status:422,headers:jsonHeaders});
  const article=await fetchDevJson(`https://dev.to/api/articles/${articleId}`);
  const owner=String(article?.user?.username||article?.organization?.username||'').toLowerCase();
  if(!article||owner!=='trytoolscout')return Response.json({ok:false,error:'unverified_toolscout_dev_article'},{status:422,headers:jsonHeaders});
  const thread=await fetchDevJson(`https://dev.to/api/comments?a_id=${articleId}&per_page=1000`);
  const comment=flattenDevComments(thread).find(x=>String(x?.id_code||'')===commentId);
  if(!comment)return Response.json({ok:false,error:'unverified_dev_comment'},{status:422,headers:jsonHeaders});
  const actor=String(comment?.user?.username||'').toLowerCase();
  if(!actor||actor==='trytoolscout')return Response.json({ok:false,error:'self_or_unknown_comment'},{status:422,headers:jsonHeaders});
  const context=devPlainText(comment.body_html||comment.body_markdown||comment.body||'').slice(0,2000);
  if(!context)return Response.json({ok:false,error:'empty_comment_context'},{status:422,headers:jsonHeaders});
  const eventId=`devto-comment-${commentId}`;
  const articleUrl=String(article.url||'https://dev.to/trytoolscout').slice(0,500);
  const status=decision==='skip'?'skipped':'suggested';
  await env.DB.prepare(`INSERT INTO audience_events(event_id,platform,event_type,direction,status,actor_handle,post_uri,parent_uri,content_id,context_text,suggestion_text,risk,source,observed_at,created_at)
    VALUES(?,'devto','engagement_suggestion','inbound',?,?,?,?,?,?,?,?,?,'make-audience-engine',?,datetime('now'))
    ON CONFLICT(event_id) DO UPDATE SET
      context_text=excluded.context_text,
      suggestion_text=CASE WHEN audience_events.status='suggested' THEN excluded.suggestion_text ELSE audience_events.suggestion_text END,
      risk=CASE WHEN audience_events.status='suggested' THEN excluded.risk ELSE audience_events.risk END,
      observed_at=excluded.observed_at
    WHERE audience_events.status='suggested'`)
    .bind(eventId,status,actor,articleUrl,`dev-comment:${commentId}`,String(articleId),context,decision==='suggest'?suggested:null,risk,String(comment.created_at||new Date().toISOString()).slice(0,80)).run();
  return Response.json({ok:true,event_id:eventId,platform:'devto',mode:'monitor_and_human_reply',decision,status,reply_write:false,verified:true},{headers:jsonHeaders});
}

async function prepareBlueskyReply(request,env){
  if(!(await validAudienceIngest(request)))return Response.json({ok:false,error:'unauthorized'},{status:401,headers:jsonHeaders});
  let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:jsonHeaders})}
  const result=completeBlueskyReply(body.text,{target:Math.min(BLUESKY_REPLY_TARGET_GRAPHEMES,Math.max(120,Number(body.target_graphemes)||BLUESKY_REPLY_TARGET_GRAPHEMES))});
  if(!result.text)return Response.json({ok:false,error:'empty_reply'},{status:422,headers:jsonHeaders});
  const valid=withinBlueskyLimits(result.text,BLUESKY_MAX_GRAPHEMES);
  if(!valid)return Response.json({ok:false,error:'reply_still_over_limit',...result,maxGraphemes:BLUESKY_MAX_GRAPHEMES,maxBytes:BLUESKY_MAX_BYTES},{status:422,headers:jsonHeaders});
  return Response.json({ok:true,...result,maxGraphemes:BLUESKY_MAX_GRAPHEMES,maxBytes:BLUESKY_MAX_BYTES,targetGraphemes:BLUESKY_REPLY_TARGET_GRAPHEMES,policy:'complete-sentence-no-hard-cut-v1'},{headers:jsonHeaders});
}

async function ingestAudienceEvent(request,env){
  let body={};
  try{body=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400,headers:jsonHeaders});}
  const platform=safeText(body.platform,30).toLowerCase();
  const eventType=safeText(body.event_type,50);
  const status=allowedStatus.has(String(body.status))?String(body.status):'observed';
  const risk=allowedRisk.has(String(body.risk))?String(body.risk):'none';
  const postUri=safeText(body.post_uri,500);
  if(platform!=='bluesky')return Response.json({error:'unsupported_platform'},{status:422,headers:jsonHeaders});
  if(!publicVerifiedType.has(eventType))return Response.json({error:'unsupported_public_event_type'},{status:422,headers:jsonHeaders});
  const verifiedPost=await fetchToolScoutBlueskyPost(postUri);
  if(!verifiedPost)return Response.json({error:'unverified_toolscout_post'},{status:422,headers:jsonHeaders});
  const publishedText=normalizeBlueskyCopy(verifiedPost?.record?.text||'');
  const publishedGraphemes=graphemeLength(publishedText);
  const likelyHardCut=eventType==='outbound_reply'&&publishedGraphemes>=BLUESKY_REPLY_TARGET_GRAPHEMES&&!/[.!?)]$/.test(publishedText);
  const eventId=safeText(body.event_id,120)||`aud_${crypto.randomUUID()}`;
  try{
    await env.DB.prepare(`INSERT INTO audience_events(event_id,platform,event_type,direction,status,actor_handle,post_uri,parent_uri,content_id,context_text,suggestion_text,risk,followers,impressions,reactions,replies,reposts,source,observed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(event_id) DO NOTHING`)
      .bind(eventId,platform,eventType,safeText(body.direction,20)||null,status,safeText(body.actor_handle,120)||null,postUri||null,safeText(body.parent_uri,500)||null,safeText(body.content_id,120)||null,safeText(body.context_text,2000)||null,safeText(body.suggestion_text||publishedText,2000)||null,likelyHardCut?'amber':risk,null,null,null,null,null,safeText(body.source,80)||'make',safeText(body.observed_at,80)||new Date().toISOString()).run();
    if(likelyHardCut){
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,source_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
        .bind(`bskycut_${crypto.randomUUID()}`,'bluesky_reply_possible_hard_cut','warning','audience_reply',eventId,postUri,`Published Bluesky reply reached ${publishedGraphemes} graphemes without a natural terminal boundary. Future drafts must pass /api/audience/bluesky-reply/prepare before publication.`).run().catch(()=>{});
    }
    let executionProof=null;
    if(eventType==='outbound_reply'&&status==='published'){
      const q=await env.DB.prepare(`SELECT task_id FROM growth_execution_contract WHERE executor='audience_make' AND source_kind='supervisor' AND status IN ('claimed','attempted','stalled') ORDER BY claimed_at DESC,priority_score DESC LIMIT 2`).all().catch(()=>({results:[]}));
      const tasks=q.results||[];
      if(tasks.length===1){
        executionProof=await recordExecutionProof(env,{taskId:tasks[0].task_id,executor:'audience_make',status:'verified',detail:'exact_published_reply_verified',externalId:eventId,evidence:{platform,event_type:eventType,post_uri:postUri,parent_uri:safeText(body.parent_uri,500)||null}});
      }
    }else if(eventType==='content_published'&&status==='published'){
      const q=await env.DB.prepare(`SELECT task_id FROM growth_execution_contract WHERE executor='content_issue' AND status IN ('claimed','attempted','stalled') ORDER BY COALESCE(attempted_at,claimed_at) DESC,priority_score DESC LIMIT 2`).all().catch(()=>({results:[]}));
      const tasks=q.results||[];
      if(tasks.length===1){
        executionProof=await recordExecutionProof(env,{taskId:tasks[0].task_id,executor:'content_issue',status:'verified',detail:'exact_content_publication_verified',externalId:eventId,evidence:{platform,event_type:eventType,post_uri:postUri,content_id:safeText(body.content_id,120)||null}});
      }
    }
    return Response.json({ok:true,event_id:eventId,verified:true,execution_proof:executionProof},{headers:jsonHeaders});
  }catch(e){return Response.json({error:'audience_event_store_failed',message:String(e?.message||e)},{status:500,headers:jsonHeaders});}
}

async function audienceSnapshot(env){
  try{
    const [counts,latestProfile,queue,latestDirective]=await Promise.all([
      env.DB.prepare(`SELECT SUM(CASE WHEN event_type IN ('outbound_reply','inbound_reply') AND status='published' THEN 1 ELSE 0 END) publishedReplies, SUM(CASE WHEN event_type='engagement_suggestion' AND status='suggested' THEN 1 ELSE 0 END) pendingSuggestions, SUM(CASE WHEN direction='outbound' AND status='published' THEN 1 ELSE 0 END) outboundActions, SUM(CASE WHEN direction='inbound' AND status='published' THEN 1 ELSE 0 END) inboundActions FROM audience_events WHERE created_at>=datetime('now','-30 days')`).first(),
      env.DB.prepare(`SELECT followers,impressions,reactions,replies,reposts,observed_at FROM audience_events WHERE event_type='profile_snapshot' ORDER BY created_at DESC LIMIT 1`).first(),
      env.DB.prepare(`SELECT event_id,platform,event_type AS type,actor_handle AS author,context_text AS context,suggestion_text AS suggestion,risk,status,post_uri,parent_uri,created_at FROM audience_events WHERE status='suggested' ORDER BY created_at DESC LIMIT 20`).all(),
      env.DB.prepare(`SELECT suggestion_text,created_at FROM audience_events WHERE event_type='engagement_suggestion' AND content_id='editorial-directive' ORDER BY created_at DESC LIMIT 1`).first()
    ]);
    return {
      audienceGrowth:{status:'connected',followers:latestProfile?.followers??null,followersGained:null,humanSessions:null,commercialYield:null,publishedReplies:Number(counts?.publishedReplies||0),outboundActions:Number(counts?.outboundActions||0),inboundActions:Number(counts?.inboundActions||0),editorialDirective:latestDirective?.suggestion_text||null,observedAt:latestProfile?.observed_at||null},
      engagement:{status:'connected',pending:Number(counts?.pendingSuggestions||0),queue:queue?.results||[],editorialDirective:latestDirective?.suggestion_text||null}
    };
  }catch(e){return {audienceGrowth:{status:'unavailable',reason:String(e?.message||e)},engagement:{status:'unavailable',queue:[]}};}
}

function platformCase(alias='f'){
  return `CASE
    WHEN lower(${alias}.source) LIKE '%utm_source=linkedin%' OR lower(COALESCE(${alias}.referrer_host,'')) LIKE '%linkedin.com%' THEN 'linkedin'
    WHEN lower(${alias}.source) LIKE '%utm_source=bluesky%' OR lower(COALESCE(${alias}.referrer_host,'')) IN ('bsky.app','bluesky.app') THEN 'bluesky'
    WHEN lower(${alias}.source) LIKE '%utm_source=x%' OR lower(COALESCE(${alias}.referrer_host,'')) IN ('x.com','twitter.com','t.co') THEN 'x'
    ELSE NULL END`;
}

function contentExpr(alias='f'){
  return `CASE WHEN instr(${alias}.source,'utm_content=')>0 THEN
    CASE WHEN instr(substr(${alias}.source,instr(${alias}.source,'utm_content=')+12),'&')>0
      THEN substr(substr(${alias}.source,instr(${alias}.source,'utm_content=')+12),1,instr(substr(${alias}.source,instr(${alias}.source,'utm_content=')+12),'&')-1)
      ELSE substr(${alias}.source,instr(${alias}.source,'utm_content=')+12) END
    ELSE NULL END`;
}

async function socialAttributionSnapshot(env){
  try{
    const pc=platformCase('f'), ce=contentExpr('f');
    const sessionCte=`WITH attributed AS (
      SELECT f.session_id, ${pc} AS platform, ${ce} AS content_id, f.created_at
      FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id
      WHERE f.created_at>=datetime('now','-30 days') AND s.classification='likely-human'
    ), social_sessions AS (
      SELECT session_id, platform, MAX(content_id) AS content_id, MIN(created_at) AS first_social_event
      FROM attributed WHERE platform IS NOT NULL GROUP BY session_id,platform
    )`;
    const [byPlatform,byContent,monetized,total]=await Promise.all([
      env.DB.prepare(`${sessionCte}
        SELECT ss.platform,COUNT(DISTINCT ss.session_id) AS sessions,
          SUM(CASE WHEN f.event_type='recommendation_completed' THEN 1 ELSE 0 END) AS recommendation_completions,
          SUM(CASE WHEN f.event_type='recommendation_result_viewed' THEN 1 ELSE 0 END) AS result_views,
          SUM(CASE WHEN f.event_type='outbound_clicked' THEN 1 ELSE 0 END) AS outbound_clicks
        FROM social_sessions ss LEFT JOIN funnel_events f ON f.session_id=ss.session_id AND f.created_at>=ss.first_social_event
        GROUP BY ss.platform ORDER BY sessions DESC`).all(),
      env.DB.prepare(`${sessionCte}
        SELECT ss.platform,COALESCE(ss.content_id,'unlabelled') AS content_id,COUNT(DISTINCT ss.session_id) AS sessions,
          SUM(CASE WHEN f.event_type='outbound_clicked' THEN 1 ELSE 0 END) AS outbound_clicks
        FROM social_sessions ss LEFT JOIN funnel_events f ON f.session_id=ss.session_id AND f.created_at>=ss.first_social_event
        GROUP BY ss.platform,COALESCE(ss.content_id,'unlabelled') ORDER BY sessions DESC,outbound_clicks DESC LIMIT 30`).all(),
      env.DB.prepare(`${sessionCte}
        SELECT ss.platform,COUNT(*) AS monetized_clicks
        FROM social_sessions ss JOIN click_events c ON c.session_id=ss.session_id
        WHERE c.created_at>=ss.first_social_event AND c.created_at>=datetime('now','-30 days') AND c.affiliate_active_at_click=1 AND c.source!='internal-test'
        GROUP BY ss.platform`).all(),
      env.DB.prepare(`${sessionCte}
        SELECT COUNT(DISTINCT session_id) AS sessions FROM social_sessions`).first()
    ]);
    const monetizedMap=Object.fromEntries(rows(monetized).map(x=>[String(x.platform),Number(x.monetized_clicks||0)]));
    const platforms=rows(byPlatform).map(x=>{
      const sessions=Number(x.sessions||0),outbound=Number(x.outbound_clicks||0),mon=Number(monetizedMap[x.platform]||0);
      return {platform:String(x.platform),sessions,recommendationCompletions:Number(x.recommendation_completions||0),resultViews:Number(x.result_views||0),outboundClicks:outbound,monetizedOutbound:mon,sessionToOutboundRate:sessions?Number((outbound/sessions*100).toFixed(1)):null,monetizationCoverage:outbound?Number((mon/outbound*100).toFixed(1)):null};
    });
    return {status:'observed',windowDays:30,humanSessions:Number(total?.sessions||0),platforms,byContent:rows(byContent).map(x=>({platform:String(x.platform),contentId:String(x.content_id),sessions:Number(x.sessions||0),outboundClicks:Number(x.outbound_clicks||0)})),definition:'Likely-human sessions only. Attribution uses recorded UTM source first and social referrer hosts as fallback. Downstream recommendation and outbound events are counted only after the attributed social entry event.'};
  }catch(e){return {status:'unavailable',reason:String(e?.message||e),platforms:[],byContent:[]};}
}

function injectSocialAttribution(html){
  if(html.includes('id="socialAttributionSection"'))return html;
  const section=`<section class="section" id="socialAttributionSection"><div class="sectionHead"><h2>Social attribution</h2><span>Likely-human · 30 days</span></div><div class="grid4" id="socialAttributionMetrics"></div><div class="grid2 section"><div class="panel"><div class="sectionHead"><h2>By network</h2><span>Session → commercial action</span></div><div id="socialByNetwork" class="note">Refresh to load.</div></div><div class="panel"><div class="sectionHead"><h2>By content</h2><span>UTM content</span></div><div id="socialByContent" class="note">Refresh to load.</div></div></section>`;
  const marker='<section class="section"><div class="sectionHead"><h2>Revenue & coverage</h2>';
  let out=html.includes(marker)?html.replace(marker,section+marker):html.replace('</body>',section+'</body>');
  const script=`<script>(function(){
    function n(v){return Number(v||0).toLocaleString()}
    function pct(v){return v==null?'—':Number(v).toFixed(1)+'%'}
    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]})}
    function metric(label,value,meta){return '<div class="card"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(meta)+'</span></div>'}
    function row(name,value,meta){return '<div class="row"><div><div class="name">'+esc(name)+'</div><div class="meta">'+esc(meta||'')+'</div></div><div class="value">'+esc(value)+'</div></div>'}
    function renderSocial(d){var s=d&&d.socialAttribution;if(!s||s.status!=='observed')return;var ps=s.platforms||[],sessions=Number(s.humanSessions||0),out=ps.reduce(function(a,x){return a+Number(x.outboundClicks||0)},0),mon=ps.reduce(function(a,x){return a+Number(x.monetizedOutbound||0)},0),rec=ps.reduce(function(a,x){return a+Number(x.recommendationCompletions||0)},0);var m=document.getElementById('socialAttributionMetrics');if(m)m.innerHTML=metric('Social human sessions',n(sessions),'Attributed from UTM/referrer')+metric('Recommendations',n(rec),'Completed after social entry')+metric('Social outbound',n(out),sessions?pct(out/sessions*100)+' session → outbound':'No attributed sessions')+metric('Monetized social outbound',n(mon),out?pct(mon/out*100)+' of social outbound':'No social outbound yet');var bn=document.getElementById('socialByNetwork');if(bn)bn.innerHTML=ps.length?ps.map(function(x){return row(x.platform,n(x.sessions)+' sessions',n(x.outboundClicks)+' outbound · '+n(x.monetizedOutbound)+' monetized · '+pct(x.sessionToOutboundRate)+' session → outbound')}).join(''):'<div class="note">No attributed social sessions in this window.</div>';var bc=document.getElementById('socialByContent');var cs=s.byContent||[];if(bc)bc.innerHTML=cs.length?cs.slice(0,12).map(function(x){return row(x.contentId,n(x.sessions)+' sessions',x.platform+' · '+n(x.outboundClicks)+' outbound')}).join(''):'<div class="note">No UTM-tagged social content has produced a likely-human session yet.</div>';var ag=document.getElementById('audienceGrowthMetrics');if(ag&&d.audienceGrowth){var a=d.audienceGrowth;ag.innerHTML=metric('Social human sessions',n(sessions),'Attributed likely-human traffic')+metric('Autonomous replies',n(a.publishedReplies),'Verified published engagement')+metric('Outbound engagement',n(a.outboundActions),'ToolScout initiated')+metric('Inbound engagement',n(a.inboundActions),'Replies on ToolScout conversations')}}
    var old=window.fetch;window.fetch=async function(){var r=await old.apply(this,arguments);try{var u=String(arguments[0]&&arguments[0].url||arguments[0]||'');if(u.indexOf('/api/stats')!==-1){var clone=r.clone();clone.json().then(renderSocial).catch(function(){})}}catch(e){}return r};
  })();</script>`;
  return out.replace('</body>',script+'</body>');
}

async function augmentStats(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data={};
  try{data=await upstream.json();}catch{return upstream;}
  const [audience,socialAttribution]=await Promise.all([audienceSnapshot(env),socialAttributionSnapshot(env)]);
  if(audience.audienceGrowth&&socialAttribution.status==='observed')audience.audienceGrowth.humanSessions=socialAttribution.humanSessions;
  return Response.json({...data,...audience,socialAttribution},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, max-age=60'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/audience-event'&&request.method==='POST')return ingestAudienceEvent(request,env);
    if(url.pathname==='/api/audience/platform-capabilities'&&request.method==='GET')return Response.json({ok:true,health:socialPlatformCapabilityHealth(),platforms:SOCIAL_PLATFORM_CAPABILITIES},{headers:{...jsonHeaders,'Cache-Control':'public, max-age=60'}});
    if(url.pathname==='/api/audience/dev-comments/candidates'&&request.method==='GET')return Response.json(await devCommentCandidates(env),{headers:{...jsonHeaders,'Cache-Control':'no-store'}});
    if(url.pathname==='/api/audience/dev-comment/observe'&&request.method==='POST')return observeDevComment(request,env);
    if(url.pathname==='/api/audience/bluesky-reply/health'&&request.method==='GET')return Response.json({ok:true,version:'complete-sentence-no-hard-cut-v1',maxGraphemes:BLUESKY_MAX_GRAPHEMES,maxBytes:BLUESKY_MAX_BYTES,targetGraphemes:BLUESKY_REPLY_TARGET_GRAPHEMES,requiresPrepareBeforePublish:true},{headers:{...jsonHeaders,'Cache-Control':'public, max-age=60'}});
    if(url.pathname==='/api/audience/bluesky-reply/prepare'&&request.method==='POST')return prepareBlueskyReply(request,env);
    if(url.pathname==='/api/stats'&&request.method==='GET')return augmentStats(request,env,ctx);
    if(url.pathname==='/analytics.html'&&request.method==='GET'){
      const response=await base.fetch(request,env,ctx);
      if(!response.ok)return response;
      const type=response.headers.get('Content-Type')||'';
      if(!type.includes('text/html'))return response;
      const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');
      return new Response(injectSocialAttribution(await response.text()),{status:response.status,headers});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(base.scheduled)return base.scheduled(event,env,ctx);}
};

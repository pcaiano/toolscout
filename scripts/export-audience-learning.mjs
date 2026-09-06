import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

function runSql(sql) {
  const out = execFileSync('npx', ['wrangler','d1','execute','toolscout','--remote','--config','wrangler.toml','--json','--command',sql], { encoding:'utf8', stdio:['ignore','pipe','inherit'] });
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results || block?.result?.[0]?.results || [];
}

const sourcePlatform = `CASE
  WHEN lower(f.source) LIKE '%utm_source=linkedin%' OR lower(COALESCE(f.referrer_host,'')) LIKE '%linkedin.com%' THEN 'linkedin'
  WHEN lower(f.source) LIKE '%utm_source=bluesky%' OR lower(COALESCE(f.referrer_host,'')) IN ('bsky.app','bluesky.app') THEN 'bluesky'
  WHEN lower(f.source) LIKE '%utm_source=x%' OR lower(COALESCE(f.referrer_host,'')) IN ('x.com','twitter.com','t.co') THEN 'x'
  ELSE NULL END`;

const contentExpr = `CASE WHEN instr(f.source,'utm_content=')>0 THEN
  CASE WHEN instr(substr(f.source,instr(f.source,'utm_content=')+12),'&')>0
    THEN substr(substr(f.source,instr(f.source,'utm_content=')+12),1,instr(substr(f.source,instr(f.source,'utm_content=')+12),'&')-1)
    ELSE substr(f.source,instr(f.source,'utm_content=')+12) END
  ELSE NULL END`;

const cte = `WITH attributed AS (
  SELECT f.session_id, ${sourcePlatform} AS platform, ${contentExpr} AS content_id, f.created_at
  FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id
  WHERE f.created_at>=datetime('now','-30 days') AND s.classification='likely-human'
), social_sessions AS (
  SELECT session_id, platform, MAX(content_id) AS content_id, MIN(created_at) AS first_social_event
  FROM attributed WHERE platform IS NOT NULL GROUP BY session_id,platform
)`;

const byPlatform = runSql(`${cte}
SELECT ss.platform,COUNT(DISTINCT ss.session_id) AS sessions,
SUM(CASE WHEN f.event_type='recommendation_completed' THEN 1 ELSE 0 END) AS recommendation_completions,
SUM(CASE WHEN f.event_type='outbound_clicked' THEN 1 ELSE 0 END) AS outbound_clicks
FROM social_sessions ss LEFT JOIN funnel_events f ON f.session_id=ss.session_id AND f.created_at>=ss.first_social_event
GROUP BY ss.platform ORDER BY sessions DESC;`);

const byContent = runSql(`${cte}
SELECT ss.platform,COALESCE(ss.content_id,'unlabelled') AS content_id,COUNT(DISTINCT ss.session_id) AS sessions,
SUM(CASE WHEN f.event_type='recommendation_completed' THEN 1 ELSE 0 END) AS recommendation_completions,
SUM(CASE WHEN f.event_type='recommendation_result_viewed' THEN 1 ELSE 0 END) AS result_views,
SUM(CASE WHEN f.event_type='outbound_clicked' THEN 1 ELSE 0 END) AS outbound_clicks
FROM social_sessions ss LEFT JOIN funnel_events f ON f.session_id=ss.session_id AND f.created_at>=ss.first_social_event
GROUP BY ss.platform,COALESCE(ss.content_id,'unlabelled') ORDER BY sessions DESC,outbound_clicks DESC LIMIT 50;`);

const monetized = runSql(`${cte}
SELECT ss.platform,COUNT(*) AS monetized_clicks
FROM social_sessions ss JOIN click_events c ON c.session_id=ss.session_id
WHERE c.created_at>=ss.first_social_event AND c.created_at>=datetime('now','-30 days') AND c.affiliate_active_at_click=1 AND c.source!='internal-test'
GROUP BY ss.platform;`);

const monetizedByContent = runSql(`${cte}
SELECT ss.platform,COALESCE(ss.content_id,'unlabelled') AS content_id,COUNT(*) AS monetized_clicks
FROM social_sessions ss JOIN click_events c ON c.session_id=ss.session_id
WHERE c.created_at>=ss.first_social_event AND c.created_at>=datetime('now','-30 days') AND c.affiliate_active_at_click=1 AND c.source!='internal-test'
GROUP BY ss.platform,COALESCE(ss.content_id,'unlabelled');`);

const total = runSql(`${cte} SELECT COUNT(DISTINCT session_id) AS sessions FROM social_sessions;`)[0] || {};
const monetizedMap = Object.fromEntries(monetized.map(r => [String(r.platform), Number(r.monetized_clicks || 0)]));
const monetizedContentMap = Object.fromEntries(monetizedByContent.map(r => [`${r.platform}|${r.content_id}`, Number(r.monetized_clicks || 0)]));

function parseContentId(id='') {
  const value=String(id||'unlabelled');
  const m=value.match(/^(monday_discovery|wednesday_comparison|friday_practical)_(\d{4}-\d{2}-\d{2})$/);
  if(m)return {family:m[1],publishedDate:m[2],isPostLevel:true};
  if(['monday_discovery','wednesday_comparison','friday_practical'].includes(value))return {family:value,publishedDate:null,isPostLevel:false};
  return {family:'unlabelled',publishedDate:null,isPostLevel:false};
}

const content = byContent.map(r => {
  const sessions=Number(r.sessions||0), outboundClicks=Number(r.outbound_clicks||0), contentId=String(r.content_id);
  const parsed=parseContentId(contentId);
  return {
    platform:String(r.platform),
    contentId,
    family:parsed.family,
    publishedDate:parsed.publishedDate,
    postLevel:parsed.isPostLevel,
    sessions,
    recommendationCompletions:Number(r.recommendation_completions||0),
    resultViews:Number(r.result_views||0),
    outboundClicks,
    monetizedOutbound:Number(monetizedContentMap[`${r.platform}|${contentId}`]||0),
    sessionToOutboundRate:sessions?Number((outboundClicks/sessions*100).toFixed(1)):null
  };
});

const familyMap={};
for(const row of content){
  const key=`${row.platform}|${row.family}`;
  familyMap[key] ||= {platform:row.platform,family:row.family,sessions:0,recommendationCompletions:0,outboundClicks:0,monetizedOutbound:0,posts:new Set()};
  familyMap[key].sessions += row.sessions;
  familyMap[key].recommendationCompletions += row.recommendationCompletions;
  familyMap[key].outboundClicks += row.outboundClicks;
  familyMap[key].monetizedOutbound += row.monetizedOutbound;
  familyMap[key].posts.add(row.contentId);
}
const families=Object.values(familyMap).map(x=>({
  platform:x.platform,family:x.family,posts:x.posts.size,sessions:x.sessions,recommendationCompletions:x.recommendationCompletions,outboundClicks:x.outboundClicks,monetizedOutbound:x.monetizedOutbound,
  sessionToOutboundRate:x.sessions?Number((x.outboundClicks/x.sessions*100).toFixed(1)):null
})).sort((a,b)=>b.sessions-a.sessions);

const snapshot = {
  generatedAt: new Date().toISOString(),
  windowDays: 30,
  definition: 'Likely-human sessions only. Social attribution uses recorded UTM source first and social referrer hosts as fallback. Downstream actions are counted only after attributed social entry.',
  socialHumanSessions: Number(total.sessions || 0),
  platforms: byPlatform.map(r => ({
    platform: String(r.platform),
    sessions: Number(r.sessions || 0),
    recommendationCompletions: Number(r.recommendation_completions || 0),
    outboundClicks: Number(r.outbound_clicks || 0),
    monetizedOutbound: Number(monetizedMap[r.platform] || 0)
  })),
  content,
  families,
  socialInterestGraph: {
    model: 'family -> platform -> post -> likely-human session -> recommendation -> outbound',
    nodes: {
      platforms: [...new Set(content.map(x=>x.platform))],
      families: [...new Set(content.map(x=>x.family))],
      posts: content.filter(x=>x.postLevel).map(x=>x.contentId)
    },
    edges: content.map(x=>({family:x.family,platform:x.platform,contentId:x.contentId,sessions:x.sessions,recommendationCompletions:x.recommendationCompletions,outboundClicks:x.outboundClicks,monetizedOutbound:x.monetizedOutbound}))
  }
};

mkdirSync('data', { recursive:true });
writeFileSync('data/audience-learning.json', JSON.stringify(snapshot, null, 2) + '\n');

const historyPath = 'data/audience-learning-history.json';
let history = [];
if (existsSync(historyPath)) {
  try { history = JSON.parse(readFileSync(historyPath,'utf8')); } catch { history = []; }
}
if (!Array.isArray(history)) history = [];
history.push(snapshot);
history = history.slice(-52);
writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');

console.log(JSON.stringify(snapshot));

const MONETIZABLE_SOCIAL_STATES=new Set(['link_acquired','active','verified','earning']);

export async function ensureAffiliateSocialOnboardingSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliate_social_policy_queue(
    tool_slug TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT,
    affiliate_url TEXT,
    queued_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
}

export async function queueAffiliateSocialPolicyReview(env,{toolSlug,status,affiliateUrl,source='affiliate_onboarding'}={}){
  const slug=String(toolSlug||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
  const state=String(status||'');
  const url=String(affiliateUrl||'').trim();
  if(!slug||!MONETIZABLE_SOCIAL_STATES.has(state)||!url)return{queued:false,reason:'not_monetizable_yet'};
  try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return{queued:false,reason:'invalid_affiliate_url'}}catch{return{queued:false,reason:'invalid_affiliate_url'}}
  await ensureAffiliateSocialOnboardingSchema(env);
  await env.DB.prepare(`INSERT INTO affiliate_social_policy_queue(tool_slug,status,source,affiliate_url,queued_at,processed_at,updated_at)
    VALUES(?,'pending',?,?,datetime('now'),NULL,datetime('now'))
    ON CONFLICT(tool_slug) DO UPDATE SET
      status='pending',
      source=excluded.source,
      affiliate_url=excluded.affiliate_url,
      queued_at=CASE WHEN affiliate_social_policy_queue.affiliate_url IS NOT excluded.affiliate_url OR affiliate_social_policy_queue.status<>'pending' THEN datetime('now') ELSE affiliate_social_policy_queue.queued_at END,
      processed_at=NULL,
      updated_at=datetime('now')`).bind(slug,String(source||'affiliate_onboarding').slice(0,100),url).run();
  await env.DB.prepare(`INSERT INTO affiliate_social_policy(tool_slug,organic_social_allowed,direct_affiliate_link_allowed,redirect_allowed,disclosure_required,policy_status,evidence_url,evidence_detail,last_checked_at,created_at,updated_at)
    VALUES(?,NULL,NULL,NULL,1,'terms_unverified',NULL,'Queued automatically when affiliate route became monetizable. Social use remains blocked until classification completes.',NULL,datetime('now'),datetime('now'))
    ON CONFLICT(tool_slug) DO UPDATE SET
      last_checked_at=NULL,
      updated_at=datetime('now'),
      policy_status=CASE WHEN affiliate_social_policy.policy_status IN ('explicit_allowed','explicit_allowed_direct_only','silent_verified','silent_verified_direct_only','explicitly_blocked','approval_required') AND affiliate_social_policy_queue.affiliate_url IS excluded.evidence_url THEN affiliate_social_policy.policy_status ELSE affiliate_social_policy.policy_status END`).bind(slug).run().catch(()=>{});
  return{queued:true,tool_slug:slug,status:state};
}

export async function affiliateSocialOnboardingSnapshot(env){
  await ensureAffiliateSocialOnboardingSchema(env);
  const [pending,recent]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) n FROM affiliate_social_policy_queue WHERE status='pending'`).first().catch(()=>({n:0})),
    env.DB.prepare(`SELECT tool_slug,status,source,affiliate_url,queued_at,processed_at FROM affiliate_social_policy_queue ORDER BY updated_at DESC LIMIT 25`).all().catch(()=>({results:[]}))
  ]);
  return{pending:Number(pending?.n||0),recent:recent.results||[]};
}

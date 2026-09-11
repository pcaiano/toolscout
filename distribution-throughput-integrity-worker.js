import base from './distribution-throughput-worker.js';

async function normalizeIndexNowAttemptTimestamps(env){
  try{
    const result=await env.DB.prepare(`UPDATE distribution_submissions SET last_attempt_at=(SELECT st.last_network_attempt_at FROM distribution_delivery_state st WHERE st.submission_id=distribution_submissions.submission_id) WHERE surface_slug='indexnow' AND error LIKE 'retryable:indexnow_%' AND EXISTS (SELECT 1 FROM distribution_delivery_state st WHERE st.submission_id=distribution_submissions.submission_id) AND COALESCE(last_attempt_at,'')<>COALESCE((SELECT st.last_network_attempt_at FROM distribution_delivery_state st WHERE st.submission_id=distribution_submissions.submission_id),'')`).run();
    const changed=Number(result?.meta?.changes||result?.changes||0);
    if(changed>0){
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`idx_time_${crypto.randomUUID()}`,'indexnow_retry_timestamp_normalized','completed','distribution_engine',`Normalized ${changed} IndexNow retry row(s): last_attempt_at now records the real network attempt while retry_after_at remains the future scheduling authority.`).run();
    }
    return changed;
  }catch{return 0;}
}

export default {
  async fetch(request,env,ctx){
    const response=await base.fetch(request,env,ctx);
    const u=new URL(request.url);
    if(request.method==='POST'&&(u.pathname==='/api/distribution/submissions/execute'||u.pathname==='/api/distribution/autonomous/refresh'))await normalizeIndexNowAttemptTimestamps(env);
    return response;
  },
  async scheduled(event,env,ctx){
    const result=base.scheduled?await base.scheduled(event,env,ctx):undefined;
    await normalizeIndexNowAttemptTimestamps(env);
    return result;
  }
};

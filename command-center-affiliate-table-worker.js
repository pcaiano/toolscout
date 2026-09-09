import base from './growth-command-center-v2-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2.html']);

function enhancement(){return `<style>
#affiliateStatusNative{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.affiliateStatusNativeHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.affiliateStatusNativeTitle{font-size:11px;font-weight:850;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.affiliateStatusNativeSummary{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px}
.affiliateStatusNativeTable{width:100%;border-collapse:collapse;font-size:11px}
.affiliateStatusNativeTable th,.affiliateStatusNativeTable td{padding:8px 7px;border-top:1px solid var(--line);text-align:left;vertical-align:middle}
.affiliateStatusNativeTable thead th{border-top:0;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}
.affiliateStatusNativeTable th:last-child,.affiliateStatusNativeTable td:last-child{text-align:right}
.affiliateStatusNativeTable td:nth-child(2){text-transform:capitalize;color:#c5ccd5}
</style><script>
(function(){
  const esc2=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const nn2=v=>Number(v||0).toLocaleString();
  const humanStatus=v=>String(v||'').replaceAll('_',' ');
  function rows(group,label){return(Array.isArray(group?.items)?group.items:[]).map(x=>({name:x.name||x.slug||'',status:x.status||label,clicks:Number(x.clicks30d||0),group:label}))}
  function paint(s){
    const host=document.getElementById('affiliateBody');if(!host)return;
    let root=document.getElementById('affiliateStatusNative');
    if(!root){root=document.createElement('div');root.id='affiliateStatusNative';host.appendChild(root)}
    if(!s||s.status!=='observed'){root.innerHTML='<div class="note">Affiliate status detail is temporarily unavailable.</div>';return}
    const rank={active:0,pending:1,rejected:2};
    const items=[...rows(s.active,'active'),...rows(s.pending,'pending'),...rows(s.rejected,'rejected')].sort((a,b)=>rank[a.group]-rank[b.group]||b.clicks-a.clicks||a.name.localeCompare(b.name));
    const summary='<div class="affiliateStatusNativeSummary"><span class="pill good">Active '+nn2(s.active?.count)+' · '+nn2(s.active?.clicks30d)+' clicks</span><span class="pill info">Pending '+nn2(s.pending?.count)+' · '+nn2(s.pending?.clicks30d)+' clicks</span><span class="pill bad">Rejected '+nn2(s.rejected?.count)+' · '+nn2(s.rejected?.clicks30d)+' clicks</span></div>';
    const table=items.length?'<table class="affiliateStatusNativeTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Clicks</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+esc2(x.name)+'</td><td>'+esc2(humanStatus(x.status))+'</td><td>'+nn2(x.clicks)+'</td></tr>').join('')+'</tbody></table>':'<div class="note">No active, pending or rejected affiliate programmes found.</div>';
    root.innerHTML='<div class="affiliateStatusNativeHead"><div class="affiliateStatusNativeTitle">Affiliate · Status · Clicks</div><div class="note">Likely-human · 30d</div></div>'+summary+table;
  }
  async function refreshAffiliateStatus(){
    try{const r=await fetch('/analytics/api/stats?t='+Date.now(),{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;const d=await r.json();paint(d.affiliateCoverageStatus)}catch{}
  }
  function schedule(){setTimeout(refreshAffiliateStatus,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  const refresh=document.getElementById('refresh');if(refresh)refresh.addEventListener('click',()=>setTimeout(refreshAffiliateStatus,450));
  const host=document.getElementById('affiliateBody');if(host){const obs=new MutationObserver(()=>{if(!document.getElementById('affiliateStatusNative'))setTimeout(refreshAffiliateStatus,50)});obs.observe(host,{childList:true})}
})();
</script>`}

export default {
  ...base,
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method!=='GET'||!ANALYTICS_PATHS.has(url.pathname))return base.fetch(request,env,ctx);
    const response=await base.fetch(request,env,ctx);
    const type=response.headers.get('Content-Type')||'';
    if(!response.ok||!type.includes('text/html'))return response;
    let html=await response.text();
    // Remove the former standalone affiliate-status card. The detail now lives inside the canonical Affiliate Coverage Engine card.
    html=html.replace(/<section class="widget" data-widget="affiliate-status"[\s\S]*?<div class="resizeHandle"><\/div><\/section>\s*/,'');
    if(!html.includes('affiliateStatusNative'))html=html.replace('</body>',enhancement()+'</body>');
    const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};

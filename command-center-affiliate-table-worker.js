import base from './growth-command-center-v2-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function affiliateWidget(){return `<section class="widget" data-widget="affiliate-status" style="--w:12;--h:6">
  <div class="widgetHead"><div><div class="widgetKicker">Affiliate · status · clicks</div><div class="widgetTitle">Affiliate Coverage Status</div></div><div class="widgetMeta">Likely-human clicks · 30d</div></div>
  <div class="widgetBody" id="affiliateCoverageStatusBody"><div class="empty">Loading affiliate status…</div></div><div class="resizeHandle"></div>
</section>`}

function bootstrap(){return `<style>
.affiliateStatusTable{width:100%;border-collapse:collapse;font-size:12px}.affiliateStatusTable th,.affiliateStatusTable td{padding:9px 8px;border-top:1px solid var(--line);text-align:left}.affiliateStatusTable thead th{border-top:0;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.affiliateStatusTable th:last-child,.affiliateStatusTable td:last-child{text-align:right}.affiliateStatusSummary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
</style><script>
(function(){
  const API='/analytics/api/stats';
  const e=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const nn=v=>Number(v||0).toLocaleString();
  const sl=v=>String(v||'').replaceAll('_',' ');
  let bootLoading=false;
  function rg(g,label){return(Array.isArray(g?.items)?g.items:[]).map(x=>({name:x.name||x.slug||'',status:x.status||label,clicks:Number(x.clicks30d||0),group:label}))}
  function paintAffiliate(s){
    const root=document.getElementById('affiliateCoverageStatusBody');if(!root)return;
    if(!s||s.status!=='observed'){root.innerHTML='<div class="empty">Affiliate coverage status is temporarily unavailable.</div>';return}
    const order={active:0,pending:1,rejected:2};
    const rows=[...rg(s.active,'active'),...rg(s.pending,'pending'),...rg(s.rejected,'rejected')].sort((a,b)=>order[a.group]-order[b.group]||b.clicks-a.clicks||a.name.localeCompare(b.name));
    const summary='<div class="affiliateStatusSummary"><span class="pill good">Active '+nn(s.active?.count)+' · '+nn(s.active?.clicks30d)+' clicks</span><span class="pill info">Pending '+nn(s.pending?.count)+' · '+nn(s.pending?.clicks30d)+' clicks</span><span class="pill bad">Rejected '+nn(s.rejected?.count)+' · '+nn(s.rejected?.clicks30d)+' clicks</span></div>';
    const table=rows.length?'<table class="affiliateStatusTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Clicks</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+e(x.name)+'</td><td>'+e(sl(x.status))+'</td><td>'+nn(x.clicks)+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">No active, pending or rejected affiliate programmes found.</div>';
    root.innerHTML=summary+table;
  }
  async function bootstrapLoad(){
    if(bootLoading)return;bootLoading=true;
    const status=document.getElementById('status'),button=document.getElementById('refresh');
    if(status)status.innerHTML='<strong>Refreshing…</strong> Reading current engine state.';
    if(button)button.disabled=true;
    try{
      document.cookie='toolscout_owner=1; Max-Age=15552000; Path=/; SameSite=Lax; Secure';
      const r=await fetch(API+'?t='+Date.now(),{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw new Error('Command Center API returned HTTP '+r.status);
      const d=await r.json();
      if(typeof window.render==='function')window.render(d);
      paintAffiliate(d.affiliateCoverageStatus);
      if(status&&!status.textContent.includes('Updated'))status.innerHTML='<strong>Updated '+e(new Date().toLocaleString(undefined,{timeZone:'Europe/Lisbon'}))+'.</strong> Current operational snapshot.';
    }catch(err){if(status)status.innerHTML='<strong data-state="bad">Unable to refresh.</strong> '+e(err&&err.message?err.message:String(err));}
    finally{bootLoading=false;if(button)button.disabled=false}
  }
  function start(){setTimeout(bootstrapLoad,0);const button=document.getElementById('refresh');if(button)button.addEventListener('click',()=>setTimeout(bootstrapLoad,0));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
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
    if(!html.includes('data-widget="affiliate-status"')){
      const anchor='<section class="widget" data-widget="distribution"';
      html=html.replace(anchor,affiliateWidget()+'\n\n    '+anchor);
    }
    html=html.replace('<strong>Not loaded.</strong> Press Refresh data for a current operational snapshot.','<strong>Loading current data…</strong>');
    if(!html.includes('bootstrapLoad'))html=html.replace('</body>',bootstrap()+'</body>');
    const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, max-age=0');headers.set('Pragma','no-cache');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};

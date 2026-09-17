import base from './command-center-final-integrity-worker.js';

const ANALYTICS_PATHS = new Set([
  '/analytics',
  '/analytics/',
  '/analytics.html',
  '/analytics-v2',
  '/analytics-v2/',
  '/analytics-v2.html'
]);

const LIGHT_THEME = `<style id="toolscout-command-center-light-theme">
:root{
  --bg:#f5f7fb;
  --card:#ffffff;
  --card2:#f8fafc;
  --ink:#101828;
  --muted:#667085;
  --line:#e4e8ee;
  --good:#067647;
  --warn:#b54708;
  --bad:#b42318;
  --accent:#6d5efc;
  --radius:18px;
}
html{background:var(--bg)!important}
body{
  background:
    radial-gradient(circle at 8% 0,rgba(109,94,252,.11),transparent 31%),
    radial-gradient(circle at 92% 7%,rgba(42,174,255,.10),transparent 25%),
    var(--bg)!important;
  color:var(--ink)!important;
}
.wrap{max-width:1500px}
.eyebrow,.widgetKicker{color:#667085!important}
h1,.widgetTitle,.rowName,.name,.value,.metric b,.card b,.panel h2,.section h2{color:#101828!important}
.sub,.widgetMeta,.rowMeta,.meta,.note,.empty,.metric small,.metric span,.card small,.card span{color:#667085!important}
.controls .btn,.btn{
  border-color:#e3e7ed!important;
  background:#ffffff!important;
  color:#101828!important;
  box-shadow:0 7px 20px rgba(16,24,40,.05)!important;
}
.controls .btn:hover,.btn:hover{background:#f8fafc!important}
.controls .btn.primary,.btn.primary{
  background:#101828!important;
  color:#ffffff!important;
  border-color:#101828!important;
  box-shadow:0 8px 24px rgba(16,24,40,.14)!important;
}
.statusbar{
  border-color:#e4e8ee!important;
  background:rgba(255,255,255,.90)!important;
  color:#667085!important;
  box-shadow:0 9px 26px rgba(16,24,40,.035)!important;
}
.statusbar strong{color:#101828!important}
.widget{
  background:rgba(255,255,255,.94)!important;
  border-color:#e4e8ee!important;
  box-shadow:0 12px 34px rgba(16,24,40,.06)!important;
}
.widget[data-dragging="1"]{outline-color:#6d5efc!important}
.metric,.tsDetailCard{
  background:#f8fafc!important;
  border-color:#e4e8ee!important;
  box-shadow:none!important;
}
.row,.task,.ledgerItem{border-color:#e7ebf0!important}
.taskReason{color:#475467!important}
.taskAfter{color:#667085!important}
.pill{
  border-color:#dfe4ea!important;
  background:#ffffff!important;
  color:#667085!important;
}
.pill.good{color:#067647!important;border-color:#abefc6!important;background:#ecfdf3!important}
.pill.warn{color:#b54708!important;border-color:#fedf89!important;background:#fffaeb!important}
.pill.bad{color:#b42318!important;border-color:#fecdca!important;background:#fef3f2!important}
.pill.info{color:#4f46e5!important;border-color:#c7d7fe!important;background:#eef4ff!important}
.bug{border-color:#fecdca!important;background:#fef3f2!important;color:#7a271a!important}
.bug b{color:#b42318!important}
.bug.warning{border-color:#fedf89!important;background:#fffaeb!important;color:#93370d!important}
.bug.warning b{color:#b54708!important}
.progress,.bar{background:#edf0f4!important}
.progress>i,.bar>i{background:#101828!important}
.resizeHandle:after{border-color:#98a2b3!important}
.modalBackdrop{background:rgba(16,24,40,.34)!important}
.modal{
  background:#ffffff!important;
  border-color:#e4e8ee!important;
  box-shadow:0 24px 90px rgba(16,24,40,.22)!important;
}
.panel,.card{
  background:#ffffff!important;
  color:#101828!important;
  border:1px solid #e4e8ee!important;
  box-shadow:0 9px 26px rgba(16,24,40,.045)!important;
}
.sectionHead span{color:#667085!important}
.trafficDot{background:#067647!important}
.trafficTrend.up,.good,[data-state="good"]{color:#067647!important}
.trafficTrend.down,.bad,[data-state="bad"]{color:#b42318!important}
.warn,[data-state="warn"]{color:#b54708!important}
a{color:inherit}
@media(max-width:720px){
  .widget{box-shadow:0 8px 22px rgba(16,24,40,.05)!important}
}
</style>`;

function isHtml(response) {
  return (response.headers.get('Content-Type') || '').toLowerCase().includes('text/html');
}

async function applyLightTheme(response) {
  if (!response.ok || !isHtml(response)) return response;
  let html = await response.text();
  if (!html.includes('id="toolscout-command-center-light-theme"')) {
    html = html.includes('</body>')
      ? html.replace('</body>', LIGHT_THEME + '</body>')
      : html + LIGHT_THEME;
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && ANALYTICS_PATHS.has(url.pathname)) {
      return applyLightTheme(response);
    }
    return response;
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};

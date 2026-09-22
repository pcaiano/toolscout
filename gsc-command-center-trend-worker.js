import base from './growth-runtime-closed-loop-worker.js';

const ANALYTICS_PATHS = new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const STATS_PATHS = new Set(['/api/stats','/analytics/api/stats']);

async function readTrend(request, env) {
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/data/gsc-daily-trend.json', request.url)));
    if (!response.ok) return null;
    const json = await response.json();
    return Array.isArray(json?.daily) ? json : null;
  } catch {
    return null;
  }
}

function responseWithBody(response, body, contentType) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  if (contentType) headers.set('content-type', contentType);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function enrichStats(request, env, response) {
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('application/json')) return response;
  try {
    const data = await response.json();
    const trend = await readTrend(request, env);
    if (trend) {
      data.gscDailyTrend = trend;
      const reality = data?.growthOps?.googleSearchReality;
      if (reality) {
        reality.searchPerformance = reality.searchPerformance || {};
        reality.searchPerformance.daily = trend.daily;
        reality.searchPerformance.dailyRange = trend.range || null;
        reality.searchPerformance.trendGeneratedAt = trend.generatedAt || null;
      }
    }
    return responseWithBody(response, JSON.stringify(data), 'application/json; charset=UTF-8');
  } catch {
    return response;
  }
}

const GSC_TREND_ENHANCEMENT = `<style id="gsc-trend-chart-style">
#gscTrendBlock{margin:12px 0 14px;border:1px solid var(--line);border-radius:14px;background:var(--card2);padding:12px 12px 10px}
.gscTrendHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap}.gscTrendHead b{font-size:13px}.gscTrendHead span{display:block;color:var(--muted);font-size:10px;line-height:1.45;margin-top:3px}.gscTrendBadge{font-size:9px!important;font-weight:800;text-transform:uppercase;letter-spacing:.07em;border:1px solid var(--line);border-radius:999px;padding:5px 8px;margin:0!important;white-space:nowrap}.gscTrendCanvas{position:relative;overflow-x:auto}.gscTrendSvg{display:block;width:100%;min-width:760px;height:auto}.gscTrendTooltip{display:none;position:absolute;z-index:3;pointer-events:none;min-width:180px;max-width:240px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 9px;box-shadow:0 8px 30px rgba(0,0,0,.12);font-size:10px;line-height:1.45}.gscTrendTooltip b{display:block;font-size:11px;margin-bottom:4px}.gscTrendFoot{color:var(--muted);font-size:9px;line-height:1.5;margin-top:7px}@media(max-width:720px){#gscTrendBlock{padding:10px 8px}.gscTrendHead{padding:0 3px}}
</style><script data-gsc-trend-renderer="v1">(function(){
var esc=function(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]})};
var num=function(v){return Number(v||0).toLocaleString()};
var one=function(v){return Number(v||0).toFixed(1)};
var pct=function(v){return Number(v||0).toFixed(2)+'%'};
var shortDate=function(v){try{return new Date(String(v)+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric'})}catch{return String(v||'')}};
var longDate=function(v){try{return new Date(String(v)+'T12:00:00Z').toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}catch{return String(v||'')}};
function latestValue(rows,key){for(var i=rows.length-1;i>=0;i--){var value=Number(rows[i]&&rows[i][key]);if(Number.isFinite(value))return value}return null}
function seriesPath(rows,series,left,width,top,height){
  var values=rows.map(function(r){var v=Number(r&&r[series.key]);return Number.isFinite(v)?v:null}).filter(function(v){return v!==null});
  if(!values.length)return '';
  var min=Math.min.apply(null,values),max=Math.max.apply(null,values);
  if(max===min){min=min===0?0:min-1;max=max+1}
  var points=[];
  rows.forEach(function(row,index){var value=Number(row&&row[series.key]);if(!Number.isFinite(value))return;var ratio=(value-min)/(max-min);var x=left+(rows.length===1?width/2:index/(rows.length-1)*width);var y=series.invert?top+ratio*height:top+height-ratio*height;points.push((points.length?'L':'M')+x.toFixed(1)+' '+y.toFixed(1))});
  return points.join(' ');
}
function renderTrend(data){
  var root=document.getElementById('googleSearchRealityBody');if(!root)return;
  var existing=document.getElementById('gscTrendBlock');if(existing)existing.remove();
  var reality=data&&data.growthOps&&data.growthOps.googleSearchReality;
  var performance=reality&&reality.searchPerformance;
  var fallback=data&&data.gscDailyTrend;
  var rows=performance&&Array.isArray(performance.daily)?performance.daily:(fallback&&Array.isArray(fallback.daily)?fallback.daily:[]);
  var anchor=root.querySelector('.metricGrid');if(!anchor)return;
  var block=document.createElement('div');block.id='gscTrendBlock';
  if(!rows.length){block.innerHTML='<div class="gscTrendHead"><div><b>Search performance trend</b><span>Daily GSC history will appear after the next Search Console refresh.</span></div><span class="gscTrendBadge">28 days</span></div>';anchor.insertAdjacentElement('afterend',block);return}
  var series=[
    {key:'impressions',label:'Impressions',color:'#2563eb',format:num,invert:false},
    {key:'clicks',label:'Clicks',color:'#16a34a',format:num,invert:false},
    {key:'ctr',label:'CTR',color:'#7c3aed',format:pct,invert:false},
    {key:'position',label:'Average position',color:'#d97706',format:one,invert:true},
    {key:'searchVisiblePages',label:'Search-visible pages',color:'#0891b2',format:num,invert:false}
  ];
  var width=1000,left=155,right=972,plotWidth=right-left,laneHeight=42,laneGap=12,top=22;
  var svg='<svg class="gscTrendSvg" viewBox="0 0 1000 350" role="img" aria-label="Google Search Console daily trend">';
  var lastIndex=Math.max(0,rows.length-1);
  series.forEach(function(s,index){
    var laneTop=top+index*(laneHeight+laneGap);var latest=latestValue(rows,s.key);var path=seriesPath(rows,s,left,plotWidth,laneTop,laneHeight);
    svg+='<line x1="'+left+'" y1="'+(laneTop+laneHeight)+'" x2="'+right+'" y2="'+(laneTop+laneHeight)+'" stroke="var(--line)" stroke-width="1"/>';
    svg+='<text x="8" y="'+(laneTop+16)+'" fill="var(--text)" font-size="12" font-weight="700">'+esc(s.label)+'</text>';
    svg+='<text x="8" y="'+(laneTop+32)+'" fill="var(--muted)" font-size="10">Latest: '+esc(latest==null?'n/a':s.format(latest))+(s.key==='position'?' - lower is better':'')+'</text>';
    if(path)svg+='<path d="'+path+'" fill="none" stroke="'+s.color+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
  });
  var tickIndexes=[0,Math.round(lastIndex*.25),Math.round(lastIndex*.5),Math.round(lastIndex*.75),lastIndex].filter(function(v,i,a){return a.indexOf(v)===i});
  tickIndexes.forEach(function(index){var x=left+(lastIndex?index/lastIndex*plotWidth:plotWidth/2);svg+='<line x1="'+x.toFixed(1)+'" y1="'+top+'" x2="'+x.toFixed(1)+'" y2="'+(top+5*(laneHeight+laneGap)-laneGap)+'" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5" opacity=".65"/><text x="'+x.toFixed(1)+'" y="328" fill="var(--muted)" font-size="10" text-anchor="middle">'+esc(shortDate(rows[index]&&rows[index].date))+'</text>'});
  svg+='</svg>';
  var range=(performance&&performance.dailyRange)||(fallback&&fallback.range)||{};
  block.innerHTML='<div class="gscTrendHead"><div><b>Search performance trend</b><span>Daily visibility and ranking movement from first-party Google Search Console data.</span></div><span class="gscTrendBadge">'+esc(range.days||rows.length)+' days</span></div><div class="gscTrendCanvas">'+svg+'<div class="gscTrendTooltip"></div></div><div class="gscTrendFoot">Each line uses its own scale so very different metrics remain readable. Average position is inverted so ranking improvement moves upward. Search-visible pages means pages seen in Search Analytics that day, not total indexed URLs.</div>';
  anchor.insertAdjacentElement('afterend',block);
  var canvas=block.querySelector('.gscTrendCanvas'),tip=block.querySelector('.gscTrendTooltip');
  canvas.addEventListener('mousemove',function(event){var rect=canvas.getBoundingClientRect();var relative=Math.max(0,Math.min(rect.width,event.clientX-rect.left));var index=Math.max(0,Math.min(rows.length-1,Math.round(relative/Math.max(1,rect.width)*(rows.length-1))));var row=rows[index]||{};tip.innerHTML='<b>'+esc(longDate(row.date))+'</b>Impressions: '+num(row.impressions)+'<br>Clicks: '+num(row.clicks)+'<br>CTR: '+pct(row.ctr)+'<br>Average position: '+(row.position==null?'n/a':one(row.position))+'<br>Search-visible pages: '+num(row.searchVisiblePages);tip.style.display='block';var maxLeft=Math.max(6,rect.width-230);tip.style.left=Math.max(6,Math.min(maxLeft,relative+10))+'px';tip.style.top='12px'});
  canvas.addEventListener('mouseleave',function(){tip.style.display='none'});
}
var original=window.render;if(typeof original==='function')window.render=function(data){original(data);renderTrend(data)};
})();</script>`;

async function decorateAnalytics(response) {
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) return response;
  try {
    const html = await response.text();
    if (html.includes('data-gsc-trend-renderer="v1"')) return responseWithBody(response, html, 'text/html; charset=UTF-8');
    const decorated = html.includes('</body>') ? html.replace('</body>', GSC_TREND_ENHANCEMENT + '</body>') : html + GSC_TREND_ENHANCEMENT;
    return responseWithBody(response, decorated, 'text/html; charset=UTF-8');
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await base.fetch(request, env, ctx);
    if (STATS_PATHS.has(url.pathname)) return enrichStats(request, env, response);
    if (ANALYTICS_PATHS.has(url.pathname)) return decorateAnalytics(response);
    return response;
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};

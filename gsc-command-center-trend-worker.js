import base from './growth-runtime-closed-loop-worker.js';

const ANALYTICS_PATHS = new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const STATS_PATHS = new Set(['/api/stats','/analytics/api/stats']);
const GSC_TREND_COMPONENT_VERSION = 5;

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

async function enrichHealth(request, env, response) {
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('application/json')) return response;
  try {
    const data = await response.json();
    const trend = await readTrend(request, env);
    data.gscTrendChart = {
      version: GSC_TREND_COMPONENT_VERSION,
      status: trend?.daily?.length ? 'observed' : 'awaiting_data',
      renderStrategy: 'server-svg-baked-into-canonical-google-search-renderer',
      points: Number(trend?.daily?.length || 0),
      generatedAt: trend?.generatedAt || null,
      range: trend?.range || null
    };
    return responseWithBody(response, JSON.stringify(data), 'application/json; charset=UTF-8');
  } catch {
    return response;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function valueOf(row, key) {
  if (!row || row[key] == null) return null;
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}
function latestValue(rows, key) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const value = valueOf(rows[i], key);
    if (value !== null) return value;
  }
  return null;
}
function formatValue(key, value) {
  if (value == null) return 'n/a';
  if (key === 'ctr') return `${value.toFixed(2)}%`;
  if (key === 'position') return value.toFixed(1);
  return Math.round(value).toLocaleString('en-US');
}
function seriesPath(rows, key, invert, left, width, top, height) {
  const values = rows.map(row => valueOf(row, key)).filter(value => value !== null);
  if (!values.length) return '';
  let min = Math.min(...values), max = Math.max(...values);
  if (max === min) { min = min === 0 ? 0 : min - 1; max += 1; }
  const points = [];
  rows.forEach((row, index) => {
    const value = valueOf(row, key);
    if (value === null) return;
    const ratio = (value - min) / (max - min);
    const x = left + (rows.length === 1 ? width / 2 : index / (rows.length - 1) * width);
    const y = invert ? top + ratio * height : top + height - ratio * height;
    points.push(`${points.length ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  return points.join(' ');
}
function dateLabel(value) {
  const s = String(value || '');
  return s.length >= 10 ? `${s.slice(5,7)}/${s.slice(8,10)}` : s;
}
function buildServerTrend(trend) {
  const rows = Array.isArray(trend?.daily) ? trend.daily : [];
  if (!rows.length) return '<div id="gscTrendBlock" data-gsc-server-chart="v5" class="empty">Daily GSC trend is temporarily unavailable.</div>';
  const series = [
    {key:'impressions', label:'Impressions', stroke:'#2563eb', invert:false},
    {key:'clicks', label:'Clicks', stroke:'#16a34a', invert:false},
    {key:'ctr', label:'CTR', stroke:'#7c3aed', invert:false},
    {key:'position', label:'Average position', stroke:'#d97706', invert:true},
    {key:'searchVisiblePages', label:'Search-visible pages', stroke:'#0891b2', invert:false}
  ];
  const width = 1000, left = 160, right = 970, plotWidth = right - left, laneHeight = 42, laneGap = 12, top = 22;
  const lastIndex = Math.max(0, rows.length - 1);
  let svg = '<svg width="100%" height="350" viewBox="0 0 1000 350" role="img" aria-label="Google Search Console 28 day trend" preserveAspectRatio="xMinYMin meet">';
  series.forEach((s, index) => {
    const laneTop = top + index * (laneHeight + laneGap);
    const latest = latestValue(rows, s.key);
    const path = seriesPath(rows, s.key, s.invert, left, plotWidth, laneTop, laneHeight);
    svg += `<line x1="${left}" y1="${laneTop + laneHeight}" x2="${right}" y2="${laneTop + laneHeight}" stroke="currentColor" opacity="0.15" stroke-width="1"/>`;
    svg += `<text x="8" y="${laneTop + 16}" fill="currentColor" font-size="12" font-weight="700">${esc(s.label)}</text>`;
    svg += `<text x="8" y="${laneTop + 32}" fill="currentColor" opacity="0.62" font-size="10">Latest: ${esc(formatValue(s.key, latest))}${s.key === 'position' ? ' | lower is better' : ''}</text>`;
    if (path) svg += `<path d="${path}" fill="none" stroke="${s.stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  });
  [0, Math.round(lastIndex * .25), Math.round(lastIndex * .5), Math.round(lastIndex * .75), lastIndex].filter((v,i,a) => a.indexOf(v) === i).forEach(index => {
    const x = left + (lastIndex ? index / lastIndex * plotWidth : plotWidth / 2);
    svg += `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + 5 * (laneHeight + laneGap) - laneGap}" stroke="currentColor" opacity="0.12" stroke-width="1" stroke-dasharray="3 5"/>`;
    svg += `<text x="${x.toFixed(1)}" y="328" fill="currentColor" opacity="0.62" font-size="10" text-anchor="middle">${esc(dateLabel(rows[index]?.date))}</text>`;
  });
  svg += '</svg>';
  const days = Number(trend?.range?.days || rows.length);
  return `<div id="gscTrendBlock" data-gsc-server-chart="v5"><div class="sectionHead"><div><b>Search performance trend</b><span>First-party Google Search Console daily history</span></div><span class="pill">${esc(days)} days</span></div><div>${svg}</div><div class="empty">Each line uses its own scale. Average position is inverted so ranking improvement moves upward. Search-visible pages are pages seen in Search Analytics that day, not total indexed URLs.</div></div>`;
}
function jsSingleQuoted(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, '');
}

async function decorateAnalytics(request, env, response) {
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) return response;
  try {
    let html = await response.text();
    html = html.replace(/<style id="gsc-trend-chart-style">[\s\S]*?<\/script>/g, '');
    const trend = await readTrend(request, env);
    const chart = buildServerTrend(trend);

    const initial = `<div class="widgetBody" id="googleSearchRealityBody"><div class="empty">Refresh to load Google's view of ToolScout.</div></div>`;
    if (html.includes(initial)) html = html.replace(initial, `<div class="widgetBody" id="googleSearchRealityBody">${chart}</div>`);

    const rendererNeedle = `root.innerHTML='<div class=\\"metricGrid\\">'+`;
    const rendererReplacement = `root.innerHTML='${jsSingleQuoted(chart)}<div class=\\"metricGrid\\">'+`;
    if (html.includes(rendererNeedle)) html = html.replace(rendererNeedle, rendererReplacement);

    return responseWithBody(response, html, 'text/html; charset=UTF-8');
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await base.fetch(request, env, ctx);
    if (url.pathname === '/api/health') return enrichHealth(request, env, response);
    if (STATS_PATHS.has(url.pathname)) return enrichStats(request, env, response);
    if (ANALYTICS_PATHS.has(url.pathname)) return decorateAnalytics(request, env, response);
    return response;
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};

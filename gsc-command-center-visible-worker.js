import base from './gsc-command-center-trend-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

async function readTrend(request,env){
  try{
    const r=await env.ASSETS.fetch(new Request(new URL('/data/gsc-daily-trend.json',request.url)));
    if(!r.ok)return null;
    const j=await r.json();
    return Array.isArray(j?.daily)?j:null;
  }catch{return null}
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]))}
function latest(rows,key){for(let i=rows.length-1;i>=0;i--){const x=n(rows[i]?.[key]);if(x!==null)return x}return null}
function fmt(key,v){if(v===null)return'n/a';if(key==='ctr')return v.toFixed(2)+'%';if(key==='position')return v.toFixed(1);return Math.round(v).toLocaleString('en-US')}
function path(rows,key,invert,left,width,top,height){
  const values=rows.map(r=>n(r?.[key])).filter(v=>v!==null);if(!values.length)return'';
  let min=Math.min(...values),max=Math.max(...values);if(min===max){min=min===0?0:min-1;max+=1}
  const out=[];rows.forEach((r,i)=>{const v=n(r?.[key]);if(v===null)return;const ratio=(v-min)/(max-min);const x=left+(rows.length===1?width/2:i/(rows.length-1)*width);const y=invert?top+ratio*height:top+height-ratio*height;out.push((out.length?'L':'M')+x.toFixed(1)+' '+y.toFixed(1))});return out.join(' ')
}
function dateLabel(v){const s=String(v||'');return s.length>=10?s.slice(5,7)+'/'+s.slice(8,10):s}
function svgFor(trend){
  const rows=Array.isArray(trend?.daily)?trend.daily:[];
  const W=1000,H=360,left=160,right=970,pw=right-left,laneH=42,gap=12,top=28,last=Math.max(0,rows.length-1);
  const series=[['impressions','Impressions','#2563eb',false],['clicks','Clicks','#16a34a',false],['ctr','CTR','#7c3aed',false],['position','Average position','#d97706',true],['searchVisiblePages','Search-visible pages','#0891b2',false]];
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Google Search Console trend"><rect width="100%" height="100%" fill="transparent"/><style>text{font-family:Arial,Helvetica,sans-serif;fill:currentColor}</style>`;
  s+='<text x="8" y="14" font-size="12" font-weight="700">Search performance trend</text><text x="8" y="27" font-size="9" opacity="0.62">First-party Google Search Console daily history</text>';
  if(!rows.length){s+='<text x="8" y="58" font-size="12">Daily GSC trend is temporarily unavailable.</text></svg>';return s}
  series.forEach((it,i)=>{const [key,label,color,invert]=it,y=top+i*(laneH+gap),p=path(rows,key,invert,left,pw,y,laneH),lv=latest(rows,key);s+=`<line x1="${left}" y1="${y+laneH}" x2="${right}" y2="${y+laneH}" stroke="currentColor" opacity="0.15"/><text x="8" y="${y+16}" font-size="12" font-weight="700">${esc(label)}</text><text x="8" y="${y+32}" font-size="10" opacity="0.62">Latest: ${esc(fmt(key,lv))}${key==='position'?' | lower is better':''}</text>`;if(p)s+=`<path d="${p}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`});
  [0,Math.round(last*.25),Math.round(last*.5),Math.round(last*.75),last].filter((v,i,a)=>a.indexOf(v)===i).forEach(i=>{const x=left+(last?i/last*pw:pw/2);s+=`<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top+5*(laneH+gap)-gap}" stroke="currentColor" opacity="0.12" stroke-dasharray="3 5"/><text x="${x.toFixed(1)}" y="348" font-size="10" opacity="0.62" text-anchor="middle">${esc(dateLabel(rows[i]?.date))}</text>`});
  return s+'</svg>'
}
function withNoStore(response,body,type){const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','private, no-store, max-age=0');h.set('pragma','no-cache');if(type)h.set('content-type',type);return new Response(body,{status:response.status,statusText:response.statusText,headers:h})}
async function decorate(response){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))return response;
  const html=await response.text();
  const tag='<link rel="stylesheet" href="/api/gsc-trend.css?v=8">';
  const out=html.includes('/api/gsc-trend.css?v=8')?html:(html.includes('</head>')?html.replace('</head>',tag+'</head>'):tag+html);
  return withNoStore(response,out,'text/html; charset=UTF-8')
}
export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/gsc-trend.svg'){
      const trend=await readTrend(request,env);
      return new Response(svgFor(trend),{headers:{'content-type':'image/svg+xml; charset=UTF-8','cache-control':'no-store'}})
    }
    if(url.pathname==='/api/gsc-trend.css'){
      const css='#googleSearchRealityBody::before{content:"";display:block;width:100%;height:360px;margin:0 0 12px;background:url("/api/gsc-trend.svg?v=8") top left/100% auto no-repeat;border-bottom:1px solid var(--line)}@media(max-width:720px){#googleSearchRealityBody::before{height:300px;background-size:760px auto;overflow:hidden}}';
      return new Response(css,{headers:{'content-type':'text/css; charset=UTF-8','cache-control':'no-store'}})
    }
    const response=await base.fetch(request,env,ctx);
    if(url.pathname==='/api/health'&&response.ok&&String(response.headers.get('content-type')||'').includes('application/json')){
      try{const d=await response.json();d.gscTrendSurface={version:8,status:'active',strategy:'container-pseudo-element-svg'};return withNoStore(response,JSON.stringify(d),'application/json; charset=UTF-8')}catch{return response}
    }
    if(ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};

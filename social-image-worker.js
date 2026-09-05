const SIZE = 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function imageHeaders(variant) {
  return {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=86400',
    'x-toolscout-renderer': 'semantic-editorial-v2',
    'x-toolscout-image-variant': variant
  };
}

function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function be32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
function concat(parts) { const len = parts.reduce((n, p) => n + p.length, 0); const out = new Uint8Array(len); let off = 0; for (const p of parts) { out.set(p, off); off += p.length; } return out; }
function chunk(type, data) { const t = new TextEncoder().encode(type); const body = concat([t, data]); return concat([be32(data.length), body, be32(crc32(body))]); }

function canvas() {
  const px = new Uint8Array(SIZE * SIZE * 4);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return; const i = (y * SIZE + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
  const rect = (x0, y0, x1, y1, c) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(SIZE, Math.ceil(x1)); y1 = Math.min(SIZE, Math.ceil(y1)); for (let y = y0; y < y1; y += 1) { let i = (y * SIZE + x0) * 4; for (let x = x0; x < x1; x += 1) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; i += 4; } } };
  const line = (x0, y0, x1, y1, c, w = 1) => {
    if (y0 === y1) { rect(Math.min(x0,x1), y0 - w/2, Math.max(x0,x1) + 1, y0 + w/2 + 1, c); return; }
    if (x0 === x1) { rect(x0 - w/2, Math.min(y0,y1), x0 + w/2 + 1, Math.max(y0,y1) + 1, c); return; }
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1; const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    while (true) { rect(x0 - w / 2, y0 - w / 2, x0 + w / 2 + 1, y0 + w / 2 + 1, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  const circle = (cx, cy, r, c, w = 3, fill = false) => { const rr = r * r, inner = Math.max(0, (r - w) * (r - w)); for (let y = cy - r; y <= cy + r; y += 1) for (let x = cx - r; x <= cx + r; x += 1) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (fill ? d <= rr : d <= rr && d >= inner) set(x, y, c); } };
  return { px, set, rect, line, circle };
}

async function encodePng(rgba) { const stride = SIZE * 4; const raw = new Uint8Array((stride + 1) * SIZE); for (let y = 0; y < SIZE; y += 1) { const dst = y * (stride + 1); raw[dst] = 0; raw.set(rgba.subarray(y * stride, (y + 1) * stride), dst + 1); } const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); const ihdr = concat([be32(SIZE), be32(SIZE), new Uint8Array([8, 6, 0, 0, 0])]); return concat([new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())]); }

const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'], '-':['00000','00000','00000','11111','00000','00000','00000'], '/':['00001','00010','00100','01000','10000','00000','00000'], ':':['00000','00100','00100','00000','00100','00100','00000'], '.':['00000','00000','00000','00000','00000','00110','00110'], ' ':['00000','00000','00000','00000','00000','00000','00000']
};

function cleanText(s, max = 28) { return String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9 /:.-]/g, '').trim().toUpperCase().slice(0, max); }
function drawText(g, text, x, y, scale, color, maxChars = 28) { let cx = x; for (const ch of cleanText(text, maxChars)) { const pat = FONT[ch] || FONT[' ']; for (let r = 0; r < 7; r += 1) for (let col = 0; col < 5; col += 1) if (pat[r][col] === '1') g.rect(cx + col * scale, y + r * scale, cx + (col + 1) * scale, y + (r + 1) * scale, color); cx += 6 * scale; } }
function arrow(g, x1, y1, x2, y2, color, w = 5) { g.line(x1,y1,x2,y2,color,w); const a = Math.atan2(y2-y1,x2-x1); const len=18; g.line(x2,y2,x2-len*Math.cos(a-.55),y2-len*Math.sin(a-.55),color,w); g.line(x2,y2,x2-len*Math.cos(a+.55),y2-len*Math.sin(a+.55),color,w); }
function drawMark(g, x, y) { const blue=[76,160,255],cyan=[92,226,214]; g.circle(x,y,34,blue,4); g.line(x-56,y,x-20,y,blue,4); g.line(x+20,y,x+56,y,blue,4); g.line(x,y-56,x,y-20,blue,4); g.line(x,y+20,x,y+56,blue,4); g.circle(x,y,7,cyan,1,true); }
function base(g, headline, kicker) { const bg=[17,19,24],grid=[29,33,40],white=[235,240,247],muted=[141,151,166]; g.rect(0,0,SIZE,SIZE,bg); for(let x=64;x<SIZE;x+=64) g.line(x,0,x,SIZE,grid,1); for(let y=64;y<SIZE;y+=64) g.line(0,y,SIZE,y,grid,1); drawMark(g,94,92); drawText(g,'TOOLSCOUT',166,67,5,white,12); drawText(g,kicker||'EDITORIAL VISUAL',166,117,3,muted,20); drawText(g,headline||'FIND THE SIGNAL',80,205,7,white,22); }
function labelBox(g,x,y,w,h,label,accent){ const panel=[25,29,36],white=[230,236,244],border=[54,62,74]; g.rect(x,y,x+w,y+h,panel); g.line(x,y,x+w,y,border,2); g.line(x,y+h,x+w,y+h,border,2); g.line(x,y,x,y+h,border,2); g.line(x+w,y,x+w,y+h,border,2); g.rect(x,y,x+8,y+h,accent); drawText(g,label,x+24,y+Math.floor(h/2)-11,3,white,18); }

function renderFilter(g,s){ const blue=[76,160,255],cyan=[92,226,214],muted=[73,82,96],white=[230,236,244]; for(let i=0;i<28;i++){ const x=100+(i%7)*42,y=400+Math.floor(i/7)*52; g.circle(x,y,6,muted,1,true);} drawText(g,s.left||'TOO MANY OPTIONS',92,635,3,white,18); g.line(420,390,540,390,blue,5); g.line(540,390,515,560,blue,5); g.line(420,390,445,560,blue,5); g.line(445,560,515,560,cyan,5); drawText(g,s.center||'FIT FILTER',420,610,3,cyan,16); arrow(g,350,490,410,490,muted,4); arrow(g,550,490,640,490,muted,4); [0,1,2].forEach(i=>labelBox(g,660,390+i*105,245,72,(s.right||'SHORTLIST').split('/')[i]||['OPTION A','OPTION B','OPTION C'][i],i===0?cyan:blue)); }
function renderCompare(g,s){ const blue=[76,160,255],cyan=[92,226,214],white=[230,236,244],muted=[115,126,142]; labelBox(g,90,390,340,95,s.left||'OPTION A',blue); labelBox(g,594,390,340,95,s.right||'OPTION B',cyan); const criteria=(s.center||'WORKFLOW/FIT/TRADEOFFS').split('/').slice(0,3); criteria.forEach((c,i)=>{ drawText(g,c,385,565+i*90,3,white,14); g.line(240,580+i*90,360,580+i*90,i%2?muted:blue,8); g.line(665,580+i*90,785,580+i*90,i%2?cyan:muted,8); }); drawText(g,'CHOOSE BY FIT - NOT FAME',232,840,4,white,24); }
function renderWorkflow(g,s){ const blue=[76,160,255],cyan=[92,226,214],white=[230,236,244]; const labels=(s.center||'INPUT/DECIDE/ACT').split('/').slice(0,4); const xs=[90,330,570,810]; labels.forEach((lab,i)=>{ labelBox(g,xs[i],460,150,90,lab,i===labels.length-1?cyan:blue); if(i<labels.length-1) arrow(g,xs[i]+155,505,xs[i+1]-12,505,blue,4); }); drawText(g,s.left||'START WITH THE JOB',90,650,3,white,24); drawText(g,s.right||'END WITH A DECISION',90,710,3,cyan,24); }
function renderMatrix(g,s){ const blue=[76,160,255],cyan=[92,226,214],white=[230,236,244],muted=[64,73,86]; g.line(225,420,225,790,muted,4); g.line(225,790,850,790,muted,4); drawText(g,s.left||'LOW FIT',80,745,3,white,12); drawText(g,s.right||'HIGH FIT',700,820,3,cyan,14); const pts=[[340,675],[470,610],[600,520],[735,445]]; pts.forEach((p,i)=>g.circle(p[0],p[1],12,i===pts.length-1?cyan:blue,1,true)); pts.slice(0,-1).forEach((p,i)=>arrow(g,p[0]+18,p[1]-5,pts[i+1][0]-18,pts[i+1][1]+5,blue,3)); drawText(g,s.center||'BETTER MATCH',470,350,3,white,18); }

async function render(variant,spec){ const g=canvas(); base(g,spec.headline,spec.kicker||variant); const concept=(spec.concept||variant||'filter').toLowerCase(); if(concept==='compare'||concept==='comparison') renderCompare(g,spec); else if(concept==='workflow'||concept==='process') renderWorkflow(g,spec); else if(concept==='matrix'||concept==='fit') renderMatrix(g,spec); else renderFilter(g,spec); return encodePng(g.px); }

function specFromUrl(url, variant) {
  return { concept:url.searchParams.get('concept')||variant, headline:url.searchParams.get('headline')||'', kicker:url.searchParams.get('kicker')||'', left:url.searchParams.get('left')||'', center:url.searchParams.get('center')||'', right:url.searchParams.get('right')||'' };
}

export default {
  async fetch(request) {
    const url=new URL(request.url);
    if(url.pathname==='/health') return json({ok:true,service:'toolscout-social-image',renderer:'semantic-editorial-v2'});
    if(url.pathname!=='/generate') return json({error:'not_found'},404);
    if(!['GET','HEAD'].includes(request.method)) return json({error:'method_not_allowed'},405);
    const variant=String(url.searchParams.get('variant')||'discovery').toLowerCase();
    if(request.method==='HEAD') return new Response(null,{status:200,headers:imageHeaders(variant)});
    const spec=specFromUrl(url,variant);
    const png=await render(variant,spec);
    return new Response(png,{status:200,headers:imageHeaders(variant)});
  }
};
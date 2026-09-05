const SIZE = 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function imageHeaders(variant) {
  return {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=86400',
    'x-toolscout-renderer': 'deterministic-v1',
    'x-toolscout-image-variant': variant
  };
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function be32(n) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function concat(parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function chunk(type, data) {
  const t = new TextEncoder().encode(type);
  const body = concat([t, data]);
  return concat([be32(data.length), body, be32(crc32(body))]);
}

function canvas() {
  const px = new Uint8Array(SIZE * SIZE * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  };
  const rect = (x0, y0, x1, y1, c) => {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(SIZE, Math.ceil(x1)); y1 = Math.min(SIZE, Math.ceil(y1));
    for (let y = y0; y < y1; y += 1) {
      let i = (y * SIZE + x0) * 4;
      for (let x = x0; x < x1; x += 1) {
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; i += 4;
      }
    }
  };
  const line = (x0, y0, x1, y1, c, w = 1) => {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      rect(x0 - w / 2, y0 - w / 2, x0 + w / 2 + 1, y0 + w / 2 + 1, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const circle = (cx, cy, r, c, w = 3, fill = false) => {
    const rr = r * r, inner = Math.max(0, (r - w) * (r - w));
    for (let y = cy - r; y <= cy + r; y += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (fill ? d <= rr : d <= rr && d >= inner) set(x, y, c);
      }
    }
  };
  return { px, set, rect, line, circle };
}

async function encodePng(rgba) {
  const stride = SIZE * 4;
  const raw = new Uint8Array((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const dst = y * (stride + 1);
    raw[dst] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), dst + 1);
  }
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ihdr = concat([be32(SIZE), be32(SIZE), new Uint8Array([8, 6, 0, 0, 0])]);
  return concat([
    new Uint8Array([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array())
  ]);
}

function drawMark(g, x, y) {
  const blue = [76, 160, 255], cyan = [92, 226, 214];
  g.circle(x, y, 42, blue, 5);
  g.line(x - 68, y, x - 22, y, blue, 5);
  g.line(x + 22, y, x + 68, y, blue, 5);
  g.line(x, y - 68, x, y - 22, blue, 5);
  g.line(x, y + 22, x, y + 68, blue, 5);
  g.circle(x, y, 8, cyan, 1, true);
}

function drawBase(g) {
  const bg = [17, 19, 24], grid = [29, 33, 40], faint = [44, 49, 58];
  g.rect(0, 0, SIZE, SIZE, bg);
  for (let x = 600; x < SIZE; x += 64) g.line(x, 0, x, SIZE, grid, 1);
  for (let y = 0; y < SIZE; y += 64) g.line(600, y, SIZE, y, grid, 1);
  g.line(82, 870, 470, 870, faint, 2);
  drawMark(g, 122, 122);
}

function drawDiscovery(g) {
  const muted = [65, 72, 84], blue = [76, 160, 255], cyan = [92, 226, 214];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const x = 650 + col * 50 + (row % 2 ? 12 : 0), y = 230 + row * 58;
      g.circle(x, y, (row + col) % 3 === 0 ? 7 : 5, muted, 1, true);
    }
  }
  [690, 765, 840].forEach((y, i) => {
    g.rect(650, y, 930, y + 56, [23, 27, 34]);
    g.line(650, y, 930, y, i === 1 ? blue : muted, 3);
    g.line(650, y + 56, 930, y + 56, i === 1 ? blue : muted, 3);
    g.circle(682, y + 28, 9, i === 1 ? cyan : muted, 1, true);
  });
}

function drawComparison(g) {
  const blue = [76, 160, 255], cyan = [92, 226, 214], muted = [74, 82, 95], panel = [23, 27, 34];
  g.rect(640, 280, 785, 735, panel); g.rect(820, 280, 965, 735, panel);
  g.line(640, 280, 785, 280, blue, 4); g.line(820, 280, 965, 280, cyan, 4);
  g.line(640, 735, 785, 735, blue, 4); g.line(820, 735, 965, 735, cyan, 4);
  [350, 430, 510, 590, 670].forEach(y => { g.line(675, y, 750, y, muted, 6); g.line(855, y, 930, y, muted, 6); });
  g.line(803, 320, 803, 700, [49, 55, 65], 2);
}

function drawPractical(g) {
  const blue = [76, 160, 255], cyan = [92, 226, 214], track = [64, 72, 84], panel = [23, 27, 34];
  const pts = [[655,330],[810,330],[810,485],[690,485],[690,640],[860,640]];
  for (let i = 0; i < pts.length - 1; i += 1) g.line(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], track, 8);
  pts.forEach((p, i) => { g.rect(p[0]-34,p[1]-34,p[0]+34,p[1]+34,panel); g.line(p[0]-34,p[1]-34,p[0]+34,p[1]-34,i===0||i===pts.length-1?cyan:blue,4); g.line(p[0]-34,p[1]+34,p[0]+34,p[1]+34,i===0||i===pts.length-1?cyan:blue,4); });
}

async function render(variant) {
  const g = canvas();
  drawBase(g);
  if (variant === 'comparison') drawComparison(g);
  else if (variant === 'practical') drawPractical(g);
  else drawDiscovery(g);
  return encodePng(g.px);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'toolscout-social-image', renderer: 'deterministic-v1' });
    if (url.pathname !== '/generate') return json({ error: 'not_found' }, 404);
    if (!['GET', 'POST', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); } }
    const variant = String(body.variant || url.searchParams.get('variant') || 'discovery').toLowerCase();
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: imageHeaders(variant) });
    const png = await render(variant);
    return new Response(png, { status: 200, headers: imageHeaders(variant) });
  }
};

import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-gsc-signals.mjs <gsc-pages.csv>');

const csv = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '');
const rawLines = csv.split(/\r?\n/).filter(line => line.trim());
if (!rawLines.length) throw new Error('GSC CSV is empty.');

const delimiter = (() => {
  const first = rawLines[0];
  const commas = (first.match(/,/g) || []).length;
  const semicolons = (first.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
})();

const parse = line => {
  const out=[]; let value=''; let quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}
    else if(c==='"'){quoted=!quoted;}
    else if(c===delimiter&&!quoted){out.push(value);value='';}
    else value+=c;
  }
  out.push(value);
  return out;
};

const normalizeHeader = value => String(value).trim().toLowerCase().replace(/\s+/g,' ');
const lines = [...rawLines];
const header = parse(lines.shift()).map(normalizeHeader);
const col = (...names) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
const pageI=col('top pages','page','pages','página','páginas'), clicksI=col('clicks','cliques'), impressionsI=col('impressions','impressões'), ctrI=col('ctr'), positionI=col('position','posição');
if ([pageI,clicksI,impressionsI,ctrI,positionI].some(i => i < 0)) throw new Error(`Expected GSC Pages CSV columns: page, clicks, impressions, ctr, position. Found: ${header.join(', ')}`);

const number = value => {
  const raw = String(value ?? '').replace('%','').trim().replace(/\s/g,'');
  if (!raw) return 0;
  const normalized = /^-?\d{1,3}(\.\d{3})*,\d+$/.test(raw)
    ? raw.replace(/\./g,'').replace(',','.')
    : /^-?\d+,\d+$/.test(raw)
      ? raw.replace(',','.')
      : raw.replace(/,/g,'');
  return Number(normalized) || 0;
};

const byIntent = new Map();
for (const row of lines.map(parse)) {
  let url;
  try { url = new URL(String(row[pageI]).trim()); } catch { continue; }
  if (!/(^|\.)trytoolscout\.org$/i.test(url.hostname)) continue;
  const pathname = url.pathname.replace(/\/$/,'');
  const intent = path.basename(pathname).replace(/\.html$/i,'').toLowerCase();
  if (!/^best-[a-z0-9-]+$/.test(intent)) continue;
  const item = {
    intent,
    page: url.origin + url.pathname,
    clicks:number(row[clicksI]),
    impressions:number(row[impressionsI]),
    ctr:number(row[ctrI]),
    position:number(row[positionI])
  };
  const existing = byIntent.get(intent);
  if (!existing || item.impressions > existing.impressions) byIntent.set(intent,item);
}

const items = [...byIntent.values()].sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks);
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/gsc-signals.json',JSON.stringify({
  generatedAt:new Date().toISOString(),
  source:'Google Search Console Pages CSV export',
  property:'https://trytoolscout.org/',
  count:items.length,
  totals:{impressions:items.reduce((n,x)=>n+x.impressions,0),clicks:items.reduce((n,x)=>n+x.clicks,0)},
  items
},null,2)+'\n');
console.log(JSON.stringify({imported:items.length,impressions:items.reduce((n,x)=>n+x.impressions,0),clicks:items.reduce((n,x)=>n+x.clicks,0)}));

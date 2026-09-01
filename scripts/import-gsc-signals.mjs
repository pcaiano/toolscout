import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-gsc-signals.mjs <gsc-pages.csv>');

const csv = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '');
const lines = csv.split(/\r?\n/).filter(Boolean);
const parse = line => {
  const out=[]; let value=''; let quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===','&&!quoted){out.push(value);value='';}else value+=c;}out.push(value);return out;
};
const header = parse(lines.shift()).map(x => x.trim().toLowerCase());
const col = (...names) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
const pageI=col('top pages','page','pages'), clicksI=col('clicks'), impressionsI=col('impressions'), ctrI=col('ctr'), positionI=col('position');
if ([pageI,clicksI,impressionsI,ctrI,positionI].some(i => i < 0)) throw new Error(`Expected GSC Pages CSV columns: page, clicks, impressions, ctr, position. Found: ${header.join(', ')}`);
const number = value => Number(String(value).replace('%','').replace(',','.').trim()) || 0;
const items = lines.map(parse).map(row => {
  let pathname; try { pathname = new URL(row[pageI]).pathname; } catch { return null; }
  const intent = path.basename(pathname).replace(/\.html$/i,'');
  if (!/^best-[a-z0-9-]+$/.test(intent)) return null;
  return {intent, page:row[pageI], clicks:number(row[clicksI]), impressions:number(row[impressionsI]), ctr:number(row[ctrI]), position:number(row[positionI])};
}).filter(Boolean).sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks);
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/gsc-signals.json',JSON.stringify({generatedAt:new Date().toISOString(),source:'Google Search Console Pages CSV export',property:'https://trytoolscout.org/',count:items.length,items},null,2)+'\n');
console.log(JSON.stringify({imported:items.length,impressions:items.reduce((n,x)=>n+x.impressions,0),clicks:items.reduce((n,x)=>n+x.clicks,0)}));

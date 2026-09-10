import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const gscPath = path.join(ROOT,'reports','gsc-signals.json');
const gsc = fs.existsSync(gscPath) ? JSON.parse(fs.readFileSync(gscPath,'utf8')) : { pages: [] };
const MIN_IMPRESSIONS = 10;
const INFORMATIONAL = /^(how|what|why|when|where|which|can|should|does|do|is|are)\b|\b(tutorial|guide|setup|set up|use|using|choose|choosing|works|work|meaning|difference|examples?)\b/i;
const COMMERCIAL = /\b(best|top|vs|versus|compare|comparison|alternatives?|software|tools?)\b/i;
const slugify = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);

const candidates = [];
const seen = new Set();
for (const page of gsc.pages || []) {
  for (const row of page.topQueries || []) {
    const query = String(row.query || '').trim();
    const impressions = Number(row.impressions || 0);
    if (!query || impressions < MIN_IMPRESSIONS) continue;
    if (!INFORMATIONAL.test(query) || COMMERCIAL.test(query)) continue;
    const slug = slugify(query);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    candidates.push({
      slug,
      query,
      sourcePage: page.page,
      sourcePath: page.pathname,
      impressions,
      clicks: Number(row.clicks || 0),
      position: Number(row.position || 0),
      evidence: 'Google Search Console query',
      publicationStatus: 'candidate-needs-grounded-content'
    });
  }
}

candidates.sort((a,b) => b.impressions-a.impressions || a.position-b.position || a.query.localeCompare(b.query));
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','blog-topics.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),
  policy:'Only distinct informational intents with observed Search Console demand may become indexable blog candidates. Existing commercial guide intents are not duplicated in the blog.',
  minimumImpressions:MIN_IMPRESSIONS,
  count:candidates.length,
  items:candidates
},null,2)+'\n');
console.log(JSON.stringify({topics:candidates.length,minimumImpressions:MIN_IMPRESSIONS}));

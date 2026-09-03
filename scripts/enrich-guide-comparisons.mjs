import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const intents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'intents.json'), 'utf8'));
const tools = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tools.json'), 'utf8'));
const names = new Map(tools.map(tool => [tool.slug, tool.name]));
const PAIRS = [
  ['make','zapier'],['hubspot','pipedrive'],['beehiiv','kit'],['jotform','typeform'],['semrush','ahrefs'],
  ['notion','clickup'],['asana','clickup'],['airtable','notion'],['n8n','make'],['tally','typeform'],
  ['brevo','mailchimp'],['activecampaign','mailchimp'],['webflow','framer'],['shopify','webflow'],['apollo','lemlist']
];
const START = '<!-- TOOLSCOUT_RELATED_COMPARISONS_START -->';
const END = '<!-- TOOLSCOUT_RELATED_COMPARISONS_END -->';
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

let enriched = 0;
let unchanged = 0;

for (const intent of intents) {
  if (!intent?.slug) continue;
  const file = path.join(ROOT, `${intent.slug}.html`);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), '');

  const selected = [...html.matchAll(/href="\/go\/([a-z0-9-]+)"/gi)].map(match => match[1]).slice(0, 3);
  const selectedSet = new Set(selected);
  const matches = PAIRS
    .filter(([left,right]) => selectedSet.has(left) || selectedSet.has(right))
    .map(([left,right]) => ({left,right,score:Number(selectedSet.has(left))+Number(selectedSet.has(right))}))
    .sort((a,b) => b.score - a.score || a.left.localeCompare(b.left))
    .slice(0, 3);

  if (!matches.length) {
    unchanged++;
    fs.writeFileSync(file, html, 'utf8');
    continue;
  }

  const cards = matches.map(({left,right}) => {
    const leftName = names.get(left) || left;
    const rightName = names.get(right) || right;
    return `<a href="/${left}-vs-${right}.html"><strong>${esc(leftName)} vs ${esc(rightName)}</strong><span>Compare →</span></a>`;
  }).join('');
  const section = `${START}<section class="section"><div class="kicker">Close calls</div><h2>Useful comparisons.</h2><p>Compare closely related tools before choosing your shortlist.</p><div class="related">${cards}</div></section>${END}`;

  const brandV1Anchor = '<section class="section"><div class="kicker">Method</div><h2>How ToolScout chooses.</h2>';
  const legacyAnchor = '<section class="section"><h2>How ToolScout chooses</h2>';
  const anchor = html.includes(brandV1Anchor) ? brandV1Anchor : html.includes(legacyAnchor) ? legacyAnchor : null;
  if (!anchor) throw new Error(`${intent.slug}.html: expected methodology anchor missing`);

  const next = html.replace(anchor, `${section}${anchor}`);
  fs.writeFileSync(file, next, 'utf8');
  enriched++;
}

console.log(JSON.stringify({enriched,unchanged,intents:intents.length,system:'brand-v1-compatible'}));

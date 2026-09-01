import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const bySlug=new Map(tools.map(t=>[t.slug,t]));
const PAIRS=[
  ['make','zapier'],
  ['hubspot','pipedrive'],
  ['beehiiv','kit'],
  ['jotform','typeform'],
  ['semrush','ahrefs']
];
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const shared=(a,b)=>[...(a||[])].filter(x=>(b||[]).map(v=>v.toLowerCase()).includes(String(x).toLowerCase()));
const stronger=(a,b,key)=>Number(a.scores?.[key]||0)>Number(b.scores?.[key]||0)?a:Number(b.scores?.[key]||0)>Number(a.scores?.[key]||0)?b:null;
const dimensions=['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency'];

function render(a,b){
  const slug=`${a.slug}-vs-${b.slug}`;
  const title=`${a.name} vs ${b.name}: which fits your workflow?`;
  const desc=`Compare ${a.name} and ${b.name} by practical fit, pricing model, features and ToolScout scoring. No paid ranking.`;
  const wins=dimensions.map(key=>({key,winner:stronger(a,b,key)})).filter(x=>x.winner);
  const aWins=wins.filter(x=>x.winner===a).slice(0,4).map(x=>x.key);
  const bWins=wins.filter(x=>x.winner===b).slice(0,4).map(x=>x.key);
  const overlap=shared(a.features,b.features).slice(0,5);
  const card=t=>`<article class="card"><div class="meta">${esc(t.category||'Software')}</div><h2>${esc(t.name)}</h2><p>${esc(t.description)}</p><p class="pricing"><strong>Pricing:</strong> ${esc(t.pricing||'Verify current pricing')}</p><h3>Good fit for</h3><ul>${(t.bestFor||[]).slice(0,5).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>Key capabilities</h3><div class="chips">${(t.features||[]).slice(0,7).map(x=>`<span>${esc(x)}</span>`).join('')}</div><a class="cta" href="/go/${encodeURIComponent(t.slug)}" rel="nofollow sponsored">Explore ${esc(t.name)} →</a></article>`;
  const decision=(t,keys)=>`<div class="decision"><h3>Choose ${esc(t.name)} if…</h3><p>${keys.length?`you place more weight on ${esc(keys.join(', '))} in ToolScout's current scoring model.`:`its product focus and workflow match your needs more closely.`}</p></div>`;
  const faq=[[`Is ${a.name} better than ${b.name}?`,`Not universally. The better choice depends on the job, workflow and criteria you value.`],[`Does ToolScout earn money from these links?`,`Some outbound links may be affiliate links. Affiliate relationships do not influence scoring or the recommendation.`],[`How current is this comparison?`,`The comparison is generated from ToolScout's current catalog. Vendor pricing and capabilities can change, so verify them before purchase.`]];
  const schema={"@context":"https://schema.org","@type":"Article",headline:title,description:desc,url:`${BASE}/${slug}.html`,publisher:{"@type":"Organization",name:'ToolScout',url:BASE},about:[{"@type":"SoftwareApplication",name:a.name,url:a.sourceUrl},{"@type":"SoftwareApplication",name:b.name,url:b.sourceUrl}]};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — ToolScout</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${BASE}/${slug}.html"><meta name="robots" content="index,follow"><meta property="og:title" content="${esc(title)} — ToolScout"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:url" content="${BASE}/${slug}.html"><meta property="og:site_name" content="ToolScout"><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style>body{font-family:Inter,system-ui,-apple-system,sans-serif;margin:0;background:#f6f7f9;color:#111827}.wrap{max-width:1000px;margin:auto;padding:28px 22px 80px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}.hero{padding:70px 0 30px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}h1{font-size:clamp(40px,7vw,66px);line-height:1;letter-spacing:-.05em;margin:14px 0 18px}.lead{font-size:19px;line-height:1.6;color:#667085;max-width:800px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card,.decision,details{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px}.meta{font-size:11px;text-transform:uppercase;color:#667085;font-weight:800;letter-spacing:.08em}.card h2{font-size:30px;margin:8px 0}.card p,.decision p,details p{color:#667085;line-height:1.6}.card h3{font-size:14px;margin:20px 0 8px}.card li{margin:6px 0;color:#475467}.chips{display:flex;flex-wrap:wrap;gap:7px}.chips span{font-size:11px;background:#f2f4f7;border:1px solid #eaecf0;border-radius:999px;padding:6px 8px;color:#475467}.cta{display:inline-block;margin-top:22px;background:#111827;color:#fff;padding:11px 15px;border-radius:10px;text-decoration:none;font-weight:750}.section{margin-top:46px;padding-top:30px;border-top:1px solid #e4e7ec}.section h2{font-size:28px}.decisions{display:grid;grid-template-columns:1fr 1fr;gap:12px}.common{color:#667085;line-height:1.65}.disclosure{margin-top:36px;color:#667085;font-size:12px;line-height:1.55}summary{font-weight:750;cursor:pointer}@media(max-width:720px){.grid,.decisions{grid-template-columns:1fr}}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><main class="hero"><div class="eyebrow">Independent software comparison · trytoolscout.org</div><h1>${esc(a.name)} vs ${esc(b.name)}</h1><p class="lead">${esc(desc)}</p></main><section class="grid">${card(a)}${card(b)}</section><section class="section"><h2>The decision in practical terms</h2><div class="decisions">${decision(a,aWins)}${decision(b,bWins)}</div>${overlap.length?`<p class="common">They overlap on ${esc(overlap.join(', '))}, so the decision is often about workflow fit rather than a missing headline feature.</p>`:''}</section><section class="section"><h2>How this comparison works</h2><p class="common">ToolScout compares the current catalog data and scoring dimensions. There is no paid winner and affiliate payout is not part of the scoring model. Treat this as a shortlist decision aid, then verify current vendor pricing and capabilities.</p></section><section class="section"><h2>Frequently asked questions</h2>${faq.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section><div class="disclosure">ToolScout may earn affiliate compensation from some outbound links. Recommendations and comparison outcomes are based on fit, not affiliate payout or paid placement.</div></div></body></html>`;
}

let created=0,refreshed=0,skipped=[];
for(const [left,right] of PAIRS){const a=bySlug.get(left),b=bySlug.get(right);if(!a||!b){skipped.push(`${left}-vs-${right}`);continue;}const target=path.join(ROOT,`${left}-vs-${right}.html`),html=render(a,b);if(fs.existsSync(target)){if(fs.readFileSync(target,'utf8')!==html){fs.writeFileSync(target,html);refreshed++;}}else{fs.writeFileSync(target,html);created++;}}
console.log(JSON.stringify({created,refreshed,skipped}));

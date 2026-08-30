import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const data=JSON.parse(fs.readFileSync(path.join(ROOT,'data','acquisition-content.json'),'utf8'));
const intents=JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));
const longtailPath=path.join(ROOT,'data','seo-longtail.json');
const longtail=fs.existsSync(longtailPath)?JSON.parse(fs.readFileSync(longtailPath,'utf8')).intents||[]:[];
const all=[...intents,...longtail];
const bySlug=new Map(all.map(x=>[x.slug,x]));
const out=path.join(ROOT,'blog'); fs.mkdirSync(out,{recursive:true});
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for(const t of data.topics){
  const intent=bySlug.get(t.intent); const angles=t.searchAngles||[];
  const angleText=angles.length?angles.map(esc).join(', '):esc(t.title);
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)} | ToolScout</title><meta name="description" content="A practical guide to ${esc(t.title.toLowerCase())}, with criteria for comparing software and a direct path to ToolScout recommendations."><link rel="canonical" href="${BASE}/blog/${t.slug}.html"><meta name="robots" content="index,follow"><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#101828}.wrap{max-width:820px;margin:auto;padding:28px 22px 80px}.brand{font-weight:850;font-size:22px;color:#101828;text-decoration:none}.hero{padding:72px 0 30px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}h1{font-size:clamp(42px,7vw,66px);line-height:.98;letter-spacing:-.055em;margin:14px 0 22px}h2{margin-top:42px;font-size:27px}.lead,p,li{font-size:17px;line-height:1.7;color:#475467}.box{background:#fff;border:1px solid #e4e7ec;border-radius:20px;padding:24px;margin:28px 0}.cta{display:inline-block;background:#101828;color:#fff;padding:14px 18px;border-radius:12px;text-decoration:none;font-weight:750}.links{display:flex;gap:12px;flex-wrap:wrap}.links a{color:#101828;font-weight:700;text-decoration:none}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><main class="hero"><div class="eyebrow">Buying guide</div><h1>${esc(t.title)}</h1><p class="lead">Choosing software is easier when the decision starts with the job, constraints and workflow rather than a generic list of features.</p></main><section><h2>Start with the job</h2><p>For this topic, useful search angles include ${angleText}. The right choice depends on what the software needs to accomplish, who will use it and how much complexity the workflow can support.</p><h2>What to compare</h2><ul><li>Fit for the specific workflow and team</li><li>Core capabilities needed today</li><li>Ease of adoption and day-to-day use</li><li>Pricing and availability of a usable free tier</li><li>Whether the tool supports the next stage of growth</li></ul><div class="box"><h2>Compare the options</h2><p>ToolScout turns the decision into a guided recommendation based on the job you are trying to solve.</p><a class="cta" href="/${t.intent}.html">Explore ${esc(t.intent.replaceAll('-',' '))} →</a></div><div class="links"><a href="/categories.html">All categories</a><a href="/guides.html">All guides</a><a href="/">ToolScout home</a></div></section></div></body></html>`;
  fs.writeFileSync(path.join(out,`${t.slug}.html`),html,'utf8');
}
console.log(JSON.stringify({generated:data.topics.length,output:'blog/'}));

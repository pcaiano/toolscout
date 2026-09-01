import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const SIGNALS=process.env.TOOLSCOUT_CONTENT_SIGNALS_URL||'';
const intents=JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));
const ACRONYMS=new Map([['ai','AI'],['crm','CRM'],['seo','SEO'],['api','API'],['saas','SaaS'],['roi','ROI'],['url','URL']]);
const words=slug=>String(slug||'').replace(/^best-/,'').replace(/-/g,' ').trim();
const titleCase=slug=>words(slug).split(/\s+/).map(w=>ACRONYMS.get(w.toLowerCase())||w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getSignals(){if(!SIGNALS)return[];for(let attempt=0;attempt<5;attempt++){try{const r=await fetch(SIGNALS,{headers:{Accept:'application/json'}});if(r.ok){const j=await r.json();if(Array.isArray(j.signals))return j.signals;}}catch{}if(attempt<4)await sleep(4000*(attempt+1));}return[];}

const titlePatterns=[
  ({label})=>`${label}: What Actually Matters Before You Buy`,
  ({label})=>`The Shortlist for ${label}: Features, Trade-offs and Fit`,
  ({label})=>`${label} Without the Noise: A Practical Buying Guide`,
  ({label})=>`Before You Pick a ${label} Tool, Check These Trade-offs`,
  ({label})=>`${label}: Where the Best Options Differ`,
  ({label})=>`A Better Way to Compare ${label} Tools`
];
const descriptionPatterns=[
  ({phrase})=>`A practical comparison framework for ${phrase}, focused on fit, trade-offs and the differences that affect the buying decision.`,
  ({phrase})=>`What to compare when evaluating ${phrase}, with emphasis on workflow fit, price, setup effort and long-term usefulness.`,
  ({phrase})=>`A concise buyer's guide to ${phrase}: the criteria worth checking, the compromises to expect and how to keep the shortlist useful.`
];
const sections=[
  {
    intro:phrase=>`The market for <strong>${esc(phrase)}</strong> is crowded enough that feature lists stop being useful quickly. The better question is which differences will matter in the workflow you actually have.`,
    h1:'Start with the outcome, not the category',
    p1:'Write down the job the software must do, who will use it, what it must connect to and what would make adoption fail. That removes a surprising number of plausible-but-wrong options.',
    h2:'Look for the expensive compromises',
    p2:'A lower monthly price can hide setup work, weak integrations or limits that appear only after adoption. A bigger platform can create the opposite problem: paying for complexity the team will never use.',
    h3:'Compare the same things across every option',
    p3:'Use one scorecard for the shortlist: workflow fit, implementation effort, integrations, pricing, usability and the few capabilities that are genuinely non-negotiable.'
  },
  {
    intro:phrase=>`Choosing between <strong>${esc(phrase)}</strong> tools is usually less about finding the longest feature list and more about identifying which product creates the least friction for your team.`,
    h1:'Where will this sit in the workflow?',
    p1:'Map the tool to the step before it and the step after it. Integration quality, hand-offs and ownership often matter more than standalone feature depth.',
    h2:'Separate must-haves from attractive extras',
    p2:'A useful shortlist should survive without decorative features. Prioritise the capabilities tied directly to the result you need and treat everything else as a tie-breaker.',
    h3:'Test for the first 90 days',
    p3:'Think about onboarding, data migration, team adoption and the likely first limitation you will hit. A tool that is easy to start but hard to live with is rarely the cheaper decision.'
  },
  {
    intro:phrase=>`For <strong>${esc(phrase)}</strong>, the strongest option is rarely “the best” in isolation. It is the one that fits the buyer's constraints with the fewest costly trade-offs.`,
    h1:'Define the constraint that matters most',
    p1:'Budget, team size, automation depth, integrations and ease of use pull the shortlist in different directions. Decide which constraint is hardest before comparing products.',
    h2:'Watch for false equivalence',
    p2:'Two tools can sit in the same category while being built for very different buyers. Compare intended users, product depth and setup expectations instead of assuming every category competitor is interchangeable.',
    h3:'Keep the shortlist deliberately small',
    p3:'Three credible options are usually more useful than twenty names. A smaller shortlist makes it easier to test the same real workflow in each product and see the differences clearly.'
  }
];

const article=(topic,index)=>{const guideUrl=`${BASE}/${topic.intent}.html`;const s=sections[index%sections.length];return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(topic.title)} — ToolScout Blog</title><meta name="description" content="${esc(topic.description)}"><link rel="canonical" href="${BASE}/blog/${encodeURIComponent(topic.slug)}.html"><meta name="robots" content="index,follow"><meta property="og:title" content="${esc(topic.title)}"><meta property="og:description" content="${esc(topic.description)}"><style>body{font-family:Inter,system-ui,-apple-system,sans-serif;margin:0;background:#f7f8fa;color:#111827}.wrap{max-width:900px;margin:auto;padding:28px 22px 80px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}.hero{padding:72px 0 38px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#667085}.hero h1{font-size:clamp(42px,7vw,68px);line-height:1.02;letter-spacing:-.055em;margin:14px 0 18px}.dek{font-size:20px;line-height:1.65;color:#667085}.article{font-size:18px;line-height:1.75;color:#344054}.article h2{font-size:30px;letter-spacing:-.035em;margin:42px 0 12px;color:#111827}.box{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:20px;margin:24px 0}.cta{display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:750}.meta{font-size:12px;color:#667085;margin-top:28px}.related{margin-top:46px;padding-top:28px;border-top:1px solid #e4e7ec}.related a{display:inline-block;margin:8px 10px 0 0;color:#111827;text-decoration:none;border-bottom:1px solid #cbd1d9;padding-bottom:3px}</style></head><body><div class="wrap"><a class="brand" href="${BASE}/">ToolScout</a><main class="hero"><div class="eyebrow">ToolScout Blog</div><h1>${esc(topic.title)}</h1><p class="dek">${esc(topic.description)}</p></main><article class="article"><p>${s.intro(words(topic.intent))}</p><h2>${s.h1}</h2><p>${s.p1}</p><h2>${s.h2}</h2><p>${s.p2}</p><div class="box"><strong>See the current ToolScout shortlist</strong><p>ToolScout narrows the catalog against this buying intent so you can compare a small set of relevant options rather than browse an endless directory.</p><a class="cta" href="${guideUrl}">Compare tools →</a></div><h2>${s.h3}</h2><p>${s.p3}</p><div class="related"><strong>Continue with ToolScout</strong><br><a href="/blog/">Browse the blog</a><a href="/guides.html">Browse all guides</a><a href="${guideUrl}">Open this recommendation</a><a href="${BASE}/">Describe your needs</a></div></article><div class="meta">This topic was prioritised from aggregated ToolScout search activity. ToolScout may earn affiliate compensation from some outbound links.</div></div></body></html>`;};

const signals=await getSignals();
const signalMap=new Map(signals.map(x=>[String(x.intent_slug),Number(x.searches||0)]));
const byIntent=new Map(intents.filter(x=>x?.slug).map(x=>[x.slug,x]));
const discovered=signals.filter(x=>x?.intent_slug&&!byIntent.has(String(x.intent_slug))).map(x=>({slug:String(x.intent_slug),title:titleCase(x.intent_slug),category:'discovered',searches:Number(x.searches||0)}));
const catalog=intents.filter(x=>x?.slug).map(x=>({slug:x.slug,title:titleCase(x.slug),category:x.category||'software',searches:signalMap.get(x.slug)||0}));
const ranked=[...catalog,...discovered].sort((a,b)=>b.searches-a.searches||a.title.localeCompare(b.title));
const topics=ranked.slice(0,50).map((item,index)=>{const ctx={label:item.title,phrase:words(item.slug)};return {slug:`${item.slug}-guide`,intent:item.slug,title:titlePatterns[index%titlePatterns.length](ctx),description:descriptionPatterns[index%descriptionPatterns.length](ctx),searches:item.searches};});
const dir=path.join(ROOT,'blog');fs.mkdirSync(dir,{recursive:true});let written=0;for(const [index,topic] of topics.entries()){const file=path.join(dir,`${topic.slug}.html`);fs.writeFileSync(file,article(topic,index),'utf8');written++;}
const cards=topics.map(t=>`<a class="card" href="./${encodeURIComponent(t.slug)}.html"><strong>${esc(t.title)}</strong><span>${t.searches?`${t.searches} recent search session${t.searches===1?'':'s'} · `:''}Read article →</span></a>`).join('');
const index=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout Blog — Software buying guides</title><meta name="description" content="Practical software buying guides prioritised from the needs people explore on ToolScout."><link rel="canonical" href="${BASE}/blog/"><meta name="robots" content="index,follow"><style>body{font-family:Inter,system-ui,-apple-system,sans-serif;margin:0;background:#f7f8fa;color:#111827}.wrap{max-width:1000px;margin:auto;padding:28px 22px 80px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}.hero{padding:68px 0 30px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#667085}.hero h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:14px 0}.hero p{font-size:19px;line-height:1.65;color:#667085;max-width:760px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{display:block;background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:20px;text-decoration:none;color:#111827}.card strong{display:block;font-size:17px;line-height:1.35}.card span{display:block;margin-top:10px;font-size:12px;color:#667085}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><div class="wrap"><a class="brand" href="${BASE}/">ToolScout</a><main class="hero"><div class="eyebrow">ToolScout Blog</div><h1>Better software decisions start with the job.</h1><p>Practical buying guides prioritised from the needs people explore on ToolScout — not generic content calendars.</p></main><section class="grid">${cards}</section></div></body></html>`;fs.writeFileSync(path.join(dir,'index.html'),index,'utf8');fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});fs.writeFileSync(path.join(ROOT,'reports','blog-topics.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'aggregated content demand signals',count:topics.length,items:topics},null,2)+'\n');console.log(JSON.stringify({topics:topics.length,written,signals:signals.length}));

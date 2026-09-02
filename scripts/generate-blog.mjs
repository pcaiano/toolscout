import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://trytoolscout.org';
const SIGNALS = process.env.TOOLSCOUT_CONTENT_SIGNALS_URL || '';
const intents = JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));
const ACRONYMS = new Map([['ai','AI'],['crm','CRM'],['seo','SEO'],['api','API'],['saas','SaaS'],['roi','ROI'],['url','URL']]);
const words = slug => String(slug||'').replace(/^best-/,'').replace(/-/g,' ').trim();
const label = slug => words(slug).split(/\s+/).map(w=>ACRONYMS.get(w.toLowerCase()) || w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
const esc = v => String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function getSignals(){
  if(!SIGNALS) return [];
  for(let i=0;i<5;i++){
    try{
      const r = await fetch(SIGNALS,{headers:{Accept:'application/json'}});
      if(r.ok){ const j=await r.json(); if(Array.isArray(j.signals)) return j.signals; }
    }catch{}
    if(i<4) await sleep(4000*(i+1));
  }
  return [];
}

function editorialTitle(slug){
  const s=words(slug), l=label(slug);
  const rules=[
    [/crm.*small business|small business.*crm/,'The small-business CRM shortlist that avoids overbuying'],
    [/crm.*consult|consult.*crm/,'What a consultant actually needs from a CRM'],
    [/crm.*real estate|real estate.*crm/,'Real-estate CRM: pipeline discipline versus industry-specific features'],
    [/crm.*sales|sales.*crm/,'Sales CRM for teams that live in the pipeline'],
    [/free crm/,'Free CRM: what stays useful after the honeymoon period'],
    [/no code.*automation|automation.*no code/,'Make, Zapier, n8n — where the trade-offs really begin'],
    [/workflow automation/,'Workflow automation by complexity, ownership and maintenance burden'],
    [/marketing automation/,'Marketing automation from lightweight sequences to full orchestration'],
    [/seo.*agenc|agenc.*seo/,'Agency SEO stacks: breadth, reporting and margin'],
    [/keyword research/,'Keyword research tools for finding opportunities, not just volume'],
    [/competitor seo/,'Competitor SEO research without buying more suite than you need'],
    [/seo tools/,'When an SEO suite is worth paying for — and when it isn’t'],
    [/cold email/,'Cold email software: deliverability first, features second'],
    [/email marketing/,'Email platforms compared by how ambitious your marketing really is'],
    [/sales prospecting/,'Prospecting tools: data quality, workflow and the cost of scale'],
    [/productivity.*teams|teams.*productivity/,'Team productivity tools: structure without process theatre'],
    [/project management/,'Project management software by the kind of work your team runs'],
    [/team collaboration/,'Collaboration tools for teams that need fewer places to look'],
    [/website builder/,'Website builders: speed to launch versus long-term control'],
    [/ecommerce/,'Commerce platforms and the cost of owning more complexity'],
    [/forms.*small business|small business.*forms/,'Forms for small teams: simple capture versus operational workflow'],
    [/lead capture/,'Lead-capture forms that fit the rest of your stack'],
    [/ai coding/,'AI coding tools for different levels of control and context'],
    [/ai assistant/,'Choosing an AI assistant by the work you actually do'],
    [/ai research/,'Research assistants compared by sourcing, depth and workflow'],
    [/ai marketing/,'Where AI marketing tools save time — and where they add noise'],
    [/ai ad creative/,'AI ad creative tools: speed is easy; control is the differentiator'],
    [/video/,'Video tools for teams that need output without a production department'],
    [/design/,'Design software when speed, collaboration and control pull apart'],
    [/developer/,'A practical developer stack by stage and workflow'],
    [/agenc/,'The agency software stack: where consolidation pays off']
  ];
  for(const [re,title] of rules) if(re.test(s)) return title;
  return `${l}: the decision points that actually change the shortlist`;
}

const descriptions = slug => `A concise ToolScout field note on ${words(slug)}, focused on fit, trade-offs and the differences that change the buying decision.`;
const articleSections = [
  ['Start with the job','Write down the outcome, who will use the software, what it must connect to and what would make adoption fail. That removes many plausible-but-wrong options.','Find the expensive compromise','Compare implementation effort, integrations, pricing and the first limitation you are likely to hit. The cheapest subscription is not always the cheapest decision.','Keep the shortlist small','Three credible options are usually more useful than twenty names. Test the same real workflow in each product and let the differences become obvious.'],
  ['Map the workflow','Look at the step before the tool and the step after it. Hand-offs, ownership and integration quality often matter more than standalone feature depth.','Separate must-haves from extras','Keep only the capabilities tied directly to the result you need. Attractive extras should be tie-breakers, not the reason a tool survives the shortlist.','Test the first 90 days','Think about onboarding, migration, adoption and the likely first point of friction. A tool that is easy to start but hard to live with is rarely the better fit.']
];

function article(topic,index){
  const guide=`${BASE}/${topic.intent}.html`, s=articleSections[index%articleSections.length];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(topic.title)} — ToolScout Journal</title><meta name="description" content="${esc(topic.description)}"><link rel="canonical" href="${BASE}/blog/${encodeURIComponent(topic.slug)}.html"><meta name="robots" content="index,follow"><link rel="stylesheet" href="../brand-system.css?v=20260903-4"><style>body{background:var(--ts-offwhite);color:var(--ts-graphite)}.page{max-width:900px;margin:auto;padding:0 28px 90px}.nav{min-height:82px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ts-light-line)}.nav .ts-mark{color:var(--ts-graphite)}.nav a{text-decoration:none}.hero{padding:78px 0 46px;border-bottom:1px solid var(--ts-light-line)}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:800;color:#737a73}.hero h1{font-size:clamp(44px,6vw,70px);line-height:.98;letter-spacing:-.06em;margin:14px 0 22px}.dek{font-size:19px;line-height:1.6;color:#626962;max-width:680px}.article{max-width:720px;padding-top:44px;font-size:17px;line-height:1.75;color:#3f463f}.article h2{font-size:30px;line-height:1.12;letter-spacing:-.04em;color:var(--ts-graphite);margin:44px 0 12px}.decision{margin:38px 0;padding:24px 0;border-top:1px solid var(--ts-graphite);border-bottom:1px solid var(--ts-light-line)}.decision strong{font-size:20px}.decision p{color:#626962}.cta{display:inline-flex;min-height:44px;align-items:center;padding:0 16px;border-radius:7px;background:var(--ts-graphite);color:var(--ts-offwhite);text-decoration:none;font-weight:750}.related{margin-top:54px;padding-top:24px;border-top:1px solid var(--ts-light-line);display:flex;gap:18px;flex-wrap:wrap}.related a{font-size:13px;font-weight:700;text-decoration:none}.meta{font-size:12px;color:#7c837c;margin-top:34px}@media(max-width:700px){.page{padding:0 20px 70px}.hero{padding:60px 0 36px}}</style></head><body><div class="page"><nav class="nav"><a class="ts-brand" href="../"><span class="ts-mark" aria-hidden="true"></span><span>ToolScout</span></a><a href="./">Journal</a></nav><header class="hero"><div class="eyebrow">ToolScout Journal</div><h1>${esc(topic.title)}</h1><p class="dek">${esc(topic.description)}</p></header><article class="article"><p>The useful question in <strong>${esc(words(topic.intent))}</strong> is not which product has the longest feature list. It is which differences will matter in the workflow you actually have.</p><h2>${s[0]}</h2><p>${s[1]}</p><h2>${s[2]}</h2><p>${s[3]}</p><div class="decision"><strong>See the current ToolScout shortlist</strong><p>Move from the editorial framing to the live recommendation page for this buying intent.</p><a class="cta" href="${guide}">Open the shortlist →</a></div><h2>${s[4]}</h2><p>${s[5]}</p><div class="related"><a href="/blog/">Journal</a><a href="/guides.html">Guides</a><a href="${guide}">Recommendation</a><a href="/">Describe your needs</a></div></article><div class="meta">Prioritised from aggregated ToolScout demand signals. Affiliate relationships never influence editorial ranking or fit.</div></div></body></html>`;
}

const signals=await getSignals();
const signalMap=new Map(signals.map(x=>[String(x.intent_slug),Number(x.searches||0)]));
const known=new Map(intents.filter(x=>x?.slug).map(x=>[x.slug,x]));
const catalog=intents.filter(x=>x?.slug).map(x=>({slug:x.slug,category:x.category||'Software',searches:signalMap.get(x.slug)||0}));
const discovered=signals.filter(x=>x?.intent_slug&&!known.has(String(x.intent_slug))).map(x=>({slug:String(x.intent_slug),category:'Discovered',searches:Number(x.searches||0)}));
const ranked=[...catalog,...discovered].sort((a,b)=>b.searches-a.searches||a.slug.localeCompare(b.slug));
const topics=ranked.slice(0,50).map(item=>({slug:`${item.slug}-guide`,intent:item.slug,category:label(item.category),title:editorialTitle(item.slug),description:descriptions(item.slug),searches:item.searches}));
const dir=path.join(ROOT,'blog'); fs.mkdirSync(dir,{recursive:true});
for(const [i,t] of topics.entries()) fs.writeFileSync(path.join(dir,`${t.slug}.html`),article(t,i),'utf8');

const featured=topics.slice(0,3);
const featureHtml=featured.map(t=>`<a class="feature" href="./${encodeURIComponent(t.slug)}.html"><div><small>${esc(t.category)}</small><strong>${esc(t.title)}.</strong></div><span>Read →</span></a>`).join('');
const data=JSON.stringify(topics.map(t=>[`${t.slug}.html`,t.category,t.title])).replaceAll('<','\\u003c');
const client="const A="+data+",out=document.getElementById('articles'),q=document.getElementById('q');function render(){const v=q.value.toLowerCase().trim(),rows=A.filter(x=>(x[1]+' '+x[2]).toLowerCase().includes(v));out.innerHTML=rows.length?rows.map(x=>'<a class=\"article\" href=\"./'+x[0]+'\"><strong>'+x[2]+'</strong><span>'+x[1]+' →</span></a>').join(''):'<div class=\"empty\">No matching articles.</div>'}q.addEventListener('input',render);render();";
const index=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout Journal — Better software decisions</title><meta name="description" content="Independent field notes, buying guides and practical software analysis from ToolScout."><link rel="canonical" href="${BASE}/blog/"><meta name="robots" content="index,follow"><link rel="stylesheet" href="../brand-system.css?v=20260903-4"><style>body{background:var(--ts-offwhite);color:var(--ts-graphite)}.journal{max-width:var(--ts-max);margin:auto;padding:0 32px 90px}.jnav{min-height:82px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ts-light-line)}.jnav .ts-mark{color:var(--ts-graphite)}.jlinks{display:flex;gap:26px;font-size:13px}.jlinks a{text-decoration:none;color:#666d66}.hero{display:grid;grid-template-columns:5fr 7fr;min-height:430px;align-items:center;border-bottom:1px solid var(--ts-light-line)}.hero-copy{max-width:560px;padding:70px 0}.eyebrow,.kicker{font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:800;color:#737a73}.hero h1{font-size:clamp(50px,6vw,78px);line-height:.95;letter-spacing:-.065em;margin:14px 0 22px}.hero p{font-size:18px;line-height:1.6;color:#626962;max-width:450px}.stage{min-height:300px}.featured{padding:64px 0;border-bottom:1px solid var(--ts-light-line)}.section-head{margin-bottom:28px}.section-head h2,.library h2{font-size:34px;letter-spacing:-.045em;margin:8px 0 0}.feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.feature{min-height:220px;padding:24px;border:1px solid var(--ts-light-line);border-radius:12px;background:#f8f9f6;text-decoration:none;display:flex;flex-direction:column;justify-content:space-between}.feature small{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#737a73}.feature strong{display:block;font-size:23px;line-height:1.08;letter-spacing:-.035em;margin-top:12px}.feature span{font-size:12px;font-weight:750}.library{padding:58px 0}.library-top{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:20px}.search{width:min(380px,100%);padding:13px 14px;border:1px solid var(--ts-light-line);border-radius:8px;background:#fafbf8;font:inherit}.list{border-top:1px solid var(--ts-graphite)}.article{display:grid;grid-template-columns:1fr auto;gap:24px;padding:17px 0;border-bottom:1px solid var(--ts-light-line);text-decoration:none}.article strong{font-size:16px}.article span{font-size:12px;color:#747b74}.empty{padding:24px 0;color:#747b74}@media(max-width:820px){.journal{padding:0 20px 70px}.jlinks{display:none}.hero{grid-template-columns:1fr;min-height:auto}.hero-copy{padding:64px 0}.stage{display:none}.feature-grid{grid-template-columns:1fr}.library-top{align-items:flex-start;flex-direction:column}.search{width:100%}}</style></head><body><div class="journal"><nav class="jnav"><a class="ts-brand" href="../"><span class="ts-mark" aria-hidden="true"></span><span>ToolScout</span></a><div class="jlinks"><a href="../tools.html">Tools</a><a href="../compare.html">Compare</a><a href="../guides.html">Guides</a><a href="../methodology.html">Methodology</a></div></nav><header class="hero"><div class="hero-copy"><div class="eyebrow">ToolScout Journal</div><h1>Signal,<br>not filler.</h1><p>Practical software analysis for moments when the choice actually matters. Less template, more judgment.</p></div><div class="stage" aria-hidden="true"></div></header><section class="featured"><div class="section-head"><div class="kicker">Start here</div><h2>Three decisions worth reading.</h2></div><div class="feature-grid">${featureHtml}</div></section><section class="library"><div class="library-top"><div><div class="kicker">The library</div><h2>Browse by the decision you need to make.</h2></div><input class="search" id="q" placeholder="Search the journal…" aria-label="Search articles"></div><div class="list" id="articles"></div></section></div><script>${client}</script></body></html>`;
fs.writeFileSync(path.join(dir,'index.html'),index,'utf8');
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','blog-topics.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'aggregated content demand signals',count:topics.length,items:topics},null,2)+'\n');
console.log(JSON.stringify({topics:topics.length,written:topics.length,signals:signals.length,system:'journal-v1'}));

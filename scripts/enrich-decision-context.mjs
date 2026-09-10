import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const contextPath=path.join(ROOT,'data','decision-context.json');
if(!fs.existsSync(contextPath)){console.log(JSON.stringify({enriched:0,skipped:0,reason:'no-decision-context'}));process.exit(0);}
const contexts=JSON.parse(fs.readFileSync(contextPath,'utf8'));
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const toolBySlug=new Map(tools.map(tool=>[tool.slug,tool]));
const gscPath=path.join(ROOT,'reports','gsc-signals.json');
const gsc=fs.existsSync(gscPath)?JSON.parse(fs.readFileSync(gscPath,'utf8')):{pages:[]};
const growthPath=path.join(ROOT,'reports','growth-priority.json');
const growth=fs.existsSync(growthPath)?JSON.parse(fs.readFileSync(growthPath,'utf8')):{items:[]};
const gscByIntent=new Map((gsc.pages||[]).filter(page=>page?.intent).map(page=>[page.intent,page]));
const growthByIntent=new Map((growth.items||[]).map(item=>[item.intent,item]));
const minImpressions=Number(growth?.gsc?.minimumImpressionsForHighConfidenceAction||20);
const clean=value=>String(value??'')
  .replace(/[\u2014\u2013]/g,'-')
  .replace(/verify current pricing before publication/gi,'See vendor for current pricing')
  .replace(/verify current terms before publication/gi,'See vendor for current terms')
  .replace(/verify before publication/gi,'See vendor for current details')
  .replace(/pending verification/gi,'See vendor for current details')
  .replace(/\s+/g,' ')
  .trim();
const esc=value=>clean(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const clip=(value,max)=>{const text=clean(value);if(text.length<=max)return text;const sliced=text.slice(0,Math.max(0,max-3)),boundary=sliced.lastIndexOf(' ');return `${sliced.slice(0,boundary>40?boundary:sliced.length)}...`;};
const safeQuery=query=>{const q=clean(query).toLowerCase();return q.length>=3&&q.length<=120&&!/["“”]/.test(q)&&!/(^|\s)(?:site|inurl|intitle|filetype):|\s-or-\s|\bor\b\s+site:|reddit\.com/i.test(q);};
const STOP=new Set(['best','tool','tools','software','platform','platforms','for','with','and','the','a','an','to','of','what','is','are','which']);
const tokens=value=>new Set(clean(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(token=>token.length>=3&&!STOP.has(token)));
const queryAlignment=(query,title)=>{const q=tokens(query),t=tokens(title);if(!q.size||!t.size)return 0;let overlap=0;for(const token of q)if(t.has(token))overlap++;return overlap/Math.min(q.size,t.size);};
const featureFit=(tool,context)=>{const featureList=(tool?.features||[]).map(clean).filter(Boolean),needles=tokens([context?.jobToBeDone,...(context?.constraints||[])].join(' '));const ranked=featureList.map(feature=>{const ft=tokens(feature);let score=0;for(const token of ft)if(needles.has(token))score++;return{feature,score};}).sort((a,b)=>b.score-a.score||a.feature.localeCompare(b.feature));return ranked.slice(0,3).map(x=>x.feature);};
let enriched=0,skipped=0,adaptiveApplied=0,protectedLowSample=0;
const adaptiveReport=[];
for(const[slug,context]of Object.entries(contexts)){
  const file=path.join(ROOT,`${slug}.html`);if(!fs.existsSync(file)){skipped++;continue;}
  let html=fs.readFileSync(file,'utf8');
  const h1Match=html.match(/<h1>(.*?)<\/h1>/i),title=h1Match?h1Match[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim():'';
  const persona=clean(context.persona||'software buyers'),job=clean(context.jobToBeDone||'choose the right tool for the job'),constraints=Array.isArray(context.constraints)?context.constraints.filter(Boolean).map(clean):[],questions=Array.isArray(context.decisionQuestions)?context.decisionQuestions.filter(Boolean).map(clean):[],selectionGuidance=Array.isArray(context.selectionGuidance)?context.selectionGuidance.filter(Boolean).map(clean):[];
  const pageSignal=gscByIntent.get(slug)||null,growthSignal=growthByIntent.get(slug)?.searchSignal||null;
  const impressions=Number(pageSignal?.impressions||growthSignal?.impressions||0),clicks=Number(pageSignal?.clicks||growthSignal?.clicks||0),position=Number(pageSignal?.position||growthSignal?.position||0),meaningful=impressions>=minImpressions||clicks>0,lowSampleFirstPage=impressions>0&&!meaningful&&position>0&&position<=10;
  const topQueries=(pageSignal?.topQueries||[]).filter(row=>safeQuery(row.query)).map(row=>({...row,alignment:queryAlignment(row.query,title)})).filter(row=>row.alignment>=0.6).sort((a,b)=>Number(b.impressions||0)-Number(a.impressions||0));
  const dominantQuery=topQueries[0]||null;
  if(title){
    const seoTitle=clip(`${title}: Compare the Best Options | ToolScout`,62),constraintText=constraints.slice(0,3).join(', ');
    const meta=clip(`${title} for ${persona}. Compare options that help you ${job}${constraintText?`, focusing on ${constraintText}`:''}.`,158);
    const answer=clip(`${title} depends on the workflow. For ${persona}, start by matching tools to ${constraints.slice(0,3).join(', ')||'your practical constraints'} rather than choosing by popularity alone.`,240);
    html=html.replace(/<title>.*?<\/title>/i,`<title>${esc(seoTitle)}</title>`).replace(/<meta name="description" content="[^"]*">/i,`<meta name="description" content="${esc(meta)}">`).replace(/<meta property="og:title" content="[^"]*">/i,`<meta property="og:title" content="${esc(seoTitle)}">`).replace(/<meta property="og:description" content="[^"]*">/i,`<meta property="og:description" content="${esc(meta)}">`).replace(/<p class="lead">.*?<\/p>/i,`<p class="lead">${esc(answer)}</p>`);
  }
  const marker=`data-decision-context="${esc(slug)}"`;
  if(!html.includes(marker)){
    const guidanceHtml=selectionGuidance.length?`<h3>What to compare</h3>${selectionGuidance.map(item=>`<p>${esc(item)}</p>`).join('')}`:'';
    const decisionSection=`<section class="section" ${marker}><h2>Who this guide is for</h2><p><strong>${esc(persona)}</strong> looking to ${esc(job)}.</p>${constraints.length?`<h3>Decision constraints</h3><div class="features">${constraints.map(item=>`<span>${esc(item)}</span>`).join('')}</div>`:''}${guidanceHtml}${questions.length?`<h3>Questions to answer before choosing</h3>${questions.map(question=>`<details><summary>${esc(question)}</summary><p>Use this question to narrow the shortlist against your workflow and constraints rather than choosing by popularity alone.</p></details>`).join('')}`:''}</section>`;
    const insertionPoint='<section class="grid">';if(html.includes(insertionPoint))html=html.replace(insertionPoint,`${decisionSection}${insertionPoint}`);
  }
  html=html.replace(/<!-- TOOLSCOUT_GSC_ADAPTIVE_START -->[\s\S]*?<!-- TOOLSCOUT_GSC_ADAPTIVE_END -->/g,'');
  let adaptiveAction='measure-only';
  if(lowSampleFirstPage){
    protectedLowSample++;
    adaptiveAction='protect-first-page-low-sample';
  }else if(meaningful&&position>10&&dominantQuery){
    const selected=[...html.matchAll(/href=["']\/tools\/([a-z0-9-]+)\.html["']/gi)].map(match=>match[1]).filter((value,index,all)=>all.indexOf(value)===index).slice(0,3).map(slug=>toolBySlug.get(slug)).filter(Boolean);
    if(selected.length){
      const rows=selected.map(tool=>{const fits=featureFit(tool,context);return `<tr><th scope="row">${esc(tool.name)}</th><td>${esc(fits.join(', ')||clean(tool.description))}</td><td>${tool.freePlan?'Yes':'No recorded'}</td><td>${esc(tool.pricing||'See vendor for current pricing')}</td></tr>`;}).join('');
      const table=`<!-- TOOLSCOUT_GSC_ADAPTIVE_START --><section class="section" data-search-depth="observed"><h2>Compare the shortlist at a glance</h2><p>For ${esc(persona)}, compare the documented capabilities against ${esc(constraints.slice(0,3).join(', ')||job)}. This table uses the current ToolScout catalog and does not infer capabilities that are not recorded.</p><div style="overflow-x:auto"><table><thead><tr><th>Tool</th><th>Documented fit</th><th>Free plan</th><th>Pricing note</th></tr></thead><tbody>${rows}</tbody></table></div></section><!-- TOOLSCOUT_GSC_ADAPTIVE_END -->`;
      const gridEnd='</section><section class="section"><h2>Related guides</h2>';
      if(html.includes(gridEnd))html=html.replace(gridEnd,`</section>${table}<section class="section"><h2>Related guides</h2>`);else html=html.replace('<section class="section"><h2>How ToolScout chooses</h2>',`${table}<section class="section"><h2>How ToolScout chooses</h2>`);
      adaptiveApplied++;
      adaptiveAction=position<=20?'deepen-striking-distance':'deepen-weak-ranking';
    }
  }
  adaptiveReport.push({intent:slug,impressions,clicks,position,meaningfulSample:meaningful,lowSampleFirstPage,dominantQuery:dominantQuery?{query:dominantQuery.query,impressions:Number(dominantQuery.impressions||0),position:Number(dominantQuery.position||0),alignment:Number(dominantQuery.alignment.toFixed(3))}:null,action:adaptiveAction});
  if(/[\u2014\u2013]/.test(html))throw new Error(`${slug}: decision-context enrichment produced a forbidden long dash`);
  fs.writeFileSync(file,html,'utf8');enriched++;
}
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','gsc-adaptive-content.json'),JSON.stringify({generatedAt:new Date().toISOString(),gscGeneratedAt:gsc.generatedAt||null,minimumImpressionsForHighConfidenceAction:minImpressions,rule:'Observed GSC demand may trigger additive factual decision depth. Low-sample first-page pages are protected from aggressive adaptive changes. Query strings must pass safety and intent-alignment checks before they can trigger adaptation.',adaptiveApplied,protectedLowSample,items:adaptiveReport},null,2)+'\n');
console.log(JSON.stringify({enriched,skipped,contexts:Object.keys(contexts).length,adaptiveApplied,protectedLowSample}));

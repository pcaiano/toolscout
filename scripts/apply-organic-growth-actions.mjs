import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntentState } from './seo-intent-loader.mjs';

const ROOT=process.cwd();
const actionsPath=path.join(ROOT,'reports','organic-growth-actions.json');
if(!fs.existsSync(actionsPath))process.exit(0);
const actions=JSON.parse(fs.readFileSync(actionsPath,'utf8'));
const active=new Map((actions.activeOptimizations||[]).map(x=>[x.intent,x]));
const { intents }=loadSeoIntentState(ROOT);
const START='<!-- organic-growth:start -->';
const END='<!-- organic-growth:end -->';
const clean=v=>String(v??'').replace(/[—–]/g,'-').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const subject=slug=>String(slug||'').replace(/^best-/,'').replace(/-/g,' ');

let changed=0;
for(const intent of intents){
  const file=path.join(ROOT,`${intent.slug}.html`);
  if(!fs.existsSync(file))continue;
  const original=fs.readFileSync(file,'utf8');
  let html=original.replace(/<!-- organic-growth:start -->[\s\S]*?<!-- organic-growth:end -->/g,'');
  const action=active.get(intent.slug);
  if(action){
    const criteria=Object.keys(intent.weights||{}).filter(x=>x!=='category').slice(0,5);
    const items=(criteria.length?criteria:['workflow fit','integrations','ease of use','price']).map(x=>`<li>${clean(String(x).replace(/([a-z])([A-Z])/g,'$1 $2'))}</li>`).join('');
    const block=`${START}<section class="section organic-growth-context" data-og-variant="${clean(action.activeVariant||action.variant||'decision-depth-v1')}"><h2>How to choose ${clean(subject(intent.slug))}</h2><p>Start with the job you need the software to do, then compare the shortlist on workflow fit, integrations, usability and current cost. Remove any option that misses a must-have requirement before comparing secondary features.</p><h3>Decision checklist</h3><ul>${items}</ul><p>ToolScout updates this guide from observed search demand and current catalog evidence. Rankings remain based on fit, not affiliate payout.</p></section>${END}`;
    const marker='<section class="section"><h2>How ToolScout chooses</h2>';
    html=html.includes(marker)?html.replace(marker,`${block}${marker}`):html;
  }
  if(html!==original){fs.writeFileSync(file,html,'utf8');changed++;}
}
console.log(JSON.stringify({changed,active:active.size}));

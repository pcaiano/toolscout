import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntentState } from './seo-intent-loader.mjs';

const ROOT=process.cwd();
const { intents, consolidations }=loadSeoIntentState(ROOT);
const canonical=new Set(intents.map(item=>item.slug).filter(Boolean));
const holdsPath=path.join(ROOT,'reports','seo-publication-holds.json');
const holds=fs.existsSync(holdsPath)?JSON.parse(fs.readFileSync(holdsPath,'utf8')):{items:[]};
const held=new Set((holds.items||[]).map(item=>item.intent).filter(Boolean));
const rootGuides=fs.readdirSync(ROOT,{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/^best-[a-z0-9-]+\.html$/i.test(entry.name))
  .map(entry=>entry.name.replace(/\.html$/i,''))
  .sort();
const uncontrolled=rootGuides.filter(slug=>!canonical.has(slug));
const heldStillPublic=rootGuides.filter(slug=>held.has(slug));
const consolidationSourcesStillPublic=rootGuides.filter(slug=>Object.prototype.hasOwnProperty.call(consolidations,slug));
const canonicalMissing=[...canonical].filter(slug=>!held.has(slug)&&!fs.existsSync(path.join(ROOT,`${slug}.html`))).sort();
const report={
  generatedAt:new Date().toISOString(),
  rule:'Every root best-*.html page must belong to the canonical SEO intent registry and pass the same publication gates. Held, consolidated and uncontrolled legacy guides cannot remain public.',
  rootGuideCount:rootGuides.length,
  canonicalIntentCount:canonical.size,
  heldCount:held.size,
  uncontrolled,
  heldStillPublic,
  consolidationSourcesStillPublic,
  canonicalMissing
};
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','controlled-seo-surface-audit.json'),JSON.stringify(report,null,2)+'\n');
const errors=[];
if(uncontrolled.length)errors.push(`uncontrolled root SEO guides: ${uncontrolled.join(', ')}`);
if(heldStillPublic.length)errors.push(`held guides still public: ${heldStillPublic.join(', ')}`);
if(consolidationSourcesStillPublic.length)errors.push(`consolidated source guides still public: ${consolidationSourcesStillPublic.join(', ')}`);
if(canonicalMissing.length)errors.push(`canonical publishable guides missing: ${canonicalMissing.join(', ')}`);
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(JSON.stringify({ok:true,rootGuideCount:rootGuides.length,canonicalIntentCount:canonical.size,heldCount:held.size}));

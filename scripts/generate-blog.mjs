import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const reportPath=path.join(ROOT,'reports','blog-topics.json');
const topics=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):{items:[]};
const dir=path.join(ROOT,'blog');
fs.mkdirSync(dir,{recursive:true});

let removed=0;
for(const file of fs.readdirSync(dir)){
  if(!file.endsWith('.html')||file==='index.html')continue;
  fs.rmSync(path.join(dir,file));
  removed++;
}

const index=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout Editorial Research</title><meta name="description" content="ToolScout publishes editorial research only when a topic has distinct evidence and can be supported with grounded, decision-useful information."><link rel="canonical" href="${BASE}/blog/"><meta name="robots" content="noindex,follow"><style>body{font-family:Inter,system-ui,-apple-system,sans-serif;margin:0;background:#f7f8fa;color:#111827}.wrap{max-width:900px;margin:auto;padding:28px 22px 80px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}.hero{padding:72px 0 38px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#667085}.hero h1{font-size:clamp(42px,7vw,68px);line-height:1.02;letter-spacing:-.055em;margin:14px 0 18px}.dek{font-size:20px;line-height:1.65;color:#667085}.box{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px;margin-top:28px;color:#475467;line-height:1.65}</style></head><body><div class="wrap"><a class="brand" href="${BASE}/">ToolScout</a><main class="hero"><div class="eyebrow">ToolScout Editorial</div><h1>Research before publication.</h1><p class="dek">ToolScout does not publish duplicate search-intent articles simply to increase page count. New editorial pages become indexable only when a distinct user question is supported by observed demand and grounded source data.</p><div class="box">Current buying guides, comparisons and tool profiles remain available through the main ToolScout navigation.</div></main></div></body></html>`;
fs.writeFileSync(path.join(dir,'index.html'),index,'utf8');
console.log(JSON.stringify({indexableArticles:0,removedDuplicateIntentArticles:removed,observedEditorialCandidates:Number(topics.count||0),policy:'No indexable article is generated until a distinct observed informational intent can be supported by grounded content.'}));

#!/usr/bin/env node
// Existing editorial/CI quality gate, not a new production engine.
// All new catalog records must have dated manufacturer documentation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function vendorEvidenceIssues(tools, pendingSlugs, newSlugs=[]) {
  const issues=[];
  const allow=new Set(pendingSlugs);
  const additions=new Set(newSlugs);
  const slugs=new Set();
  const names=new Set();
  const manufacturerDocDomains={basecamp:['basecamp-help.com'],trello:['atlassian.com'],chatgpt:['openai.com'],claude:['anthropic.com'],gemini:['google.com'],gitlab:['gitlab.com'],freshdesk:['freshdesk.com'],'moz-pro':['dc8hdnsmzapvm.cloudfront.net'],'google-ai-studio':['google.dev'],loom:['atlassian.com'],notebooklm:['google.com']};
  const hostname=url=>{try{return new URL(url).hostname.toLowerCase().replace(/^www[.]/,'')}catch{return null}};
  const ownedSource=(home,doc,slug)=>{
    const h=hostname(home),d=hostname(doc);
    return Boolean(h&&d&&(d===h||d.endsWith('.'+h)||(manufacturerDocDomains[slug]||[]).some(v=>d===v||d.endsWith('.'+v))));
  };
  if(allow.size!==pendingSlugs.length)issues.push('Duplicate pending slug in baseline');
  if(!Array.isArray(tools))return ['Catalog is not an array'];
  for(const tool of tools){
    const slug=String(tool?.slug||'');
    if(!slug||slugs.has(slug)){issues.push('Duplicate or empty catalog slug: '+slug);continue}
    slugs.add(slug);
    const uniqueName=String(tool.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!uniqueName||names.has(uniqueName))issues.push('Duplicate or empty product name: '+String(tool.name||''));
    names.add(uniqueName);
    const r=tool.editorialReview||{};
    const source=r.sourceUrl;
    const evidence=(tool.evidence||[]).filter(x=>x?.claimScope==='toolscout_editorial_review'&&x.sourceUrl&&x.verifiedAt);
    // A manufacturer homepage is not sufficient documentary proof for a new tool.
    // Resume AI's current homepage explicitly publishes its features and pricing;
    // that single reviewed legacy exception must not generalize to new admissions.
    const sourceLooksValid=typeof source==='string'&&/^https:\/\/[^\s/]+\//.test(source)&&(()=>{
      try{
        const u=new URL(source);
        return u.pathname.replace(/\/+$/,'')!==''||(slug==='resume-ai'&&u.origin==='https://resume-ai.com'&&u.pathname==='/');
      }catch{return false}
    })();
    const dated=evidence.some(x=>x.sourceUrl===source&&/^\d{4}-\d\d-\d\d$/.test(x.verifiedAt));
    const firstParty=ownedSource(tool.sourceUrl,source,slug);
    const documented=r.verificationStatus!=='catalog_only'&&sourceLooksValid&&dated&&firstParty&&r.handsOnTested!==true;
    if(allow.has(slug)){
      if(documented)issues.push('Remove now-documented product from pending baseline: '+slug);
      continue;
    }
    if(!documented)issues.push('Manufacturer documentation required before catalog inclusion: '+slug);
    if(additions.has(slug)&&documented){
      const docs=[...new Set(Array.isArray(r.sourceUrls)?r.sourceUrls:[])].filter(u=>{
        try{const x=new URL(u);return x.protocol==='https:'&&x.pathname!=='/'&&ownedSource(tool.sourceUrl,u,slug)}catch{return false}
      });
      const datedDocs=docs.filter(u=>evidence.some(x=>x.sourceUrl===u&&/^\\d{4}-\\d{2}-\\d{2}$/.test(x.verifiedAt)));
      if(typeof r.summary!=='string'||r.summary.trim().length<260||typeof r.angle!=='string'||r.angle.trim().length<20||typeof r.buyerCheck!=='string'||r.buyerCheck.trim().length<60)
        issues.push('Decision-grade analysis, distinctive angle and actionable buyer check required: '+slug);
      if(docs.length<2||datedDocs.length<2)
        issues.push('Two distinct dated manufacturer documentation pages required for new products: '+slug);
      if((tool.strengths||[]).length<2||(tool.limitations||[]).length<2||(tool.tradeoffs||[]).length<1)
        issues.push('Explicit strengths, limitations and tradeoffs required: '+slug);
      if(!tool.pricingDetails||!String(tool.pricingDetails.freePlanStatus||'').trim())
        issues.push('Explicit pricing/free-plan status, including unknown where unverified, required: '+slug);
      if(!Array.isArray(tool.features)||tool.features.length<3||!Array.isArray(tool.bestFor)||tool.bestFor.length<2)
        issues.push('Specific features and buyer audience required: '+slug);
    }
  }
  for(const slug of allow)if(!slugs.has(slug))issues.push('Pending baseline references a removed product: '+slug);
  return issues;
}

const runningAsScript=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(runningAsScript){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const tools=JSON.parse(fs.readFileSync(path.join(root,'data/tools.json'),'utf8'));
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'data/vendor-evidence-backlog.json'),'utf8'));
  const baseRef=process.env.TOOLSCOUT_VENDOR_EVIDENCE_BASE_REF||'origin/main';
  let newSlugs=[];
  try{
    const oldCatalog=JSON.parse(execFileSync('git',['show',baseRef+':data/tools.json'],{cwd:root,encoding:'utf8'}));
    const previous=new Set(oldCatalog.map(t=>t.slug));
    newSlugs=tools.map(t=>t.slug).filter(slug=>!previous.has(slug));
  }catch(error){
    if(process.env.TOOLSCOUT_VENDOR_EVIDENCE_REQUIRE_BASE==='1'){console.error('Cannot compare new catalog admissions with base: '+String(error.message).slice(0,240));process.exitCode=1}
  }
  const issues=vendorEvidenceIssues(tools,baseline.pendingSlugs,newSlugs);
  // On pull requests the backlog must only shrink. A proposed change cannot
  // whitelist new unsupported tools by modifying the baseline alongside them.
  try {
    const baseRef=process.env.TOOLSCOUT_VENDOR_EVIDENCE_BASE_REF||'origin/main';
    const old=JSON.parse(execFileSync('git',['show',baseRef+':data/vendor-evidence-backlog.json'],{cwd:root,encoding:'utf8'}));
    const prior=new Set(old.pendingSlugs||[]);
    const added=(baseline.pendingSlugs||[]).filter(slug=>!prior.has(slug));
    if(added.length)issues.push('Adding legacy documentation exceptions is forbidden: '+added.join(', '));
  } catch (error) {
    // Source checkout without a base ref (local isolated run) still exercises
    // record checks; CI always fetches origin/main and sets the explicit flag.
    if(process.env.TOOLSCOUT_VENDOR_EVIDENCE_REQUIRE_BASE==='1')issues.push('Cannot verify immutable legacy backlog against base: '+String(error.message).slice(0,240));
  }
  console.log(JSON.stringify({catalog:tools.length,documented:tools.length-baseline.pendingSlugs.length,manufacturerDocsPending:baseline.pendingSlugs.length,gate:issues.length?'FAIL':'PASS',issues},null,2));
  if(issues.length)process.exitCode=1;
}

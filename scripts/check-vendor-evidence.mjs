#!/usr/bin/env node
// Existing editorial/CI quality gate, not a new production engine.
// All new catalog records must have dated manufacturer documentation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function vendorEvidenceIssues(tools, pendingSlugs) {
  const issues=[];
  const allow=new Set(pendingSlugs);
  const slugs=new Set();
  const names=new Set();
  const manufacturerDocDomains={trello:['atlassian.com']};
  const rootDomain=url=>{try{return new URL(url).hostname.toLowerCase().replace(/^www\\./,'').split('.').slice(-2).join('.')}catch{return null}};
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
    const sourceLooksValid=typeof source==='string'&&/^https:\/\/[^\s/]+\//.test(source);
    const dated=evidence.some(x=>x.sourceUrl===source&&/^\d{4}-\d\d-\d\d$/.test(x.verifiedAt));
    const homeDomain=rootDomain(tool.sourceUrl),docDomain=rootDomain(source);
    const firstParty=Boolean(homeDomain&&docDomain&&(homeDomain===docDomain||(manufacturerDocDomains[slug]||[]).includes(docDomain)));
    const documented=r.verificationStatus!=='catalog_only'&&sourceLooksValid&&dated&&firstParty&&r.handsOnTested!==true;
    if(allow.has(slug)){
      if(documented)issues.push('Remove now-documented product from pending baseline: '+slug);
      continue;
    }
    if(!documented)issues.push('Manufacturer documentation required before catalog inclusion: '+slug);
  }
  for(const slug of allow)if(!slugs.has(slug))issues.push('Pending baseline references a removed product: '+slug);
  return issues;
}

const runningAsScript=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(runningAsScript){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const tools=JSON.parse(fs.readFileSync(path.join(root,'data/tools.json'),'utf8'));
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'data/vendor-evidence-backlog.json'),'utf8'));
  const issues=vendorEvidenceIssues(tools,baseline.pendingSlugs);
  console.log(JSON.stringify({catalog:tools.length,documented:tools.length-baseline.pendingSlugs.length,manufacturerDocsPending:baseline.pendingSlugs.length,gate:issues.length?'FAIL':'PASS',issues},null,2));
  if(issues.length)process.exitCode=1;
}

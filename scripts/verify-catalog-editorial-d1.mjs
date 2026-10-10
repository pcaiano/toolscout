import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export function verifyCatalogEditorialD1Result(result,cohort){
 const entries=(Array.isArray(result)?result:[result]).flatMap(r=>r?.results||[]);
 const rows=new Map(entries.filter(x=>x?.tool_slug).map(x=>[x.tool_slug,x]));
 const expected=new Map(cohort.map(tool=>[tool.slug,tool.editorialReview]));
 // Two known live D1 admissions are mandatory; Clio is not counted before publication.
 for(const required of ['fresha','bqe-core'])assert.ok(rows.has(required),'published D1 row missing:'+required);
 for(const [slug,row] of rows){
  if(!expected.has(slug))continue;
  const review=expected.get(slug);
  assert.equal(row.status,'published',slug+' no longer published');
  assert.equal(row.summary,review.summary,slug+' D1 editorial text not reconciled');
  assert.equal(row.buyer_check,review.buyerCheck,slug+' D1 buyer checklist not reconciled');
 }
 return{ok:true,verifiedSlugs:[...rows.keys()].filter(x=>expected.has(x)),excludedAbsent:cohort.map(x=>x.slug).filter(x=>!rows.has(x))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2];if(!file)throw Error('D1 JSON path required');
 const rows=JSON.parse(fs.readFileSync(file,'utf8'));
 const cohort=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave4-decision-ready.json',import.meta.url),'utf8'));
 console.log(JSON.stringify(verifyCatalogEditorialD1Result(rows,cohort)));
}

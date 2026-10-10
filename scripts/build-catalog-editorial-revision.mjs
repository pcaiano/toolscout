import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {trustedManufacturerEvidence} from '../catalog-autonomy-worker.js';

const quoted=value=>"'"+String(value).replace(/'/g,"''")+"'";
const words=value=>String(value||'').trim().split(/\s+/).filter(Boolean).length;
const internalNote=/(?:the (?:vendor|manufacturer)(?:'s)? (?:documentation|scheduling page|help article|feature information)|published US.dollar charges|source data last checked|search engine optimization|seo (?:note|keyword)|evidence (?:claim|source|verification)|first.party (?:proof|documents?))/i;

// Pure SQL generation. D1 retains the canonical product data, evidence,
// capabilities, pricing, logo, scores, affiliates and admission status.
// Only the buyer-facing review and buyer checklist may be revised.
export function buildCatalogEditorialRevisionSql(cohort){
  if(!Array.isArray(cohort)||!cohort.length)throw Error('catalog_editorial_cohort_empty');
  const statements=['-- Editorial-only, idempotent, source-gated revisions to canonical D1.'];
  const seen=new Set();
  for(const tool of cohort){
    const review=tool?.editorialReview||{},slug=String(tool?.slug||'');
    if(!/^[a-z0-9][a-z0-9-]*$/.test(slug)||seen.has(slug))throw Error('catalog_editorial_invalid_slug');
    seen.add(slug);
    if(!trustedManufacturerEvidence(tool,{decisionGrade:true}))throw Error('catalog_editorial_manufacturer_evidence_missing:'+slug);
    if(words(review.summary)<60||words(review.summary)>100||internalNote.test(review.summary)||internalNote.test(review.buyerCheck)||words(review.buyerCheck)>40)
      throw Error('catalog_editorial_reader_quality_hold:'+slug);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt||''))throw Error('catalog_editorial_review_date_missing:'+slug);
    const summary=quoted(review.summary),check=quoted(review.buyerCheck),date=quoted(review.reviewedAt);
    const source=quoted(review.sourceUrl),sources=quoted(JSON.stringify(review.sourceUrls));
    statements.push([
      'UPDATE catalog_runtime_candidates',
      'SET profile_json=json_set(profile_json,',
      "    '$.editorialReview.summary',"+summary+',',
      "    '$.editorialReview.buyerCheck',"+check+',',
      "    '$.editorialReview.reviewedAt',"+date+'),',
      "    updated_at=datetime('now')",
      'WHERE tool_slug='+quoted(slug),
      "  AND status='published'",
      "  AND source_status='ok'",
      '  AND json_valid(profile_json)=1',
      "  AND json_extract(profile_json,'$.provenance.mode')='runtime_trusted_catalog'",
      "  AND json_extract(profile_json,'$.editorialReview.verificationStatus')='vendor_documented'",
      "  AND json_extract(profile_json,'$.editorialReview.sourceUrl')="+source,
      "  AND json_extract(profile_json,'$.editorialReview.sourceUrls')="+sources,
      "  AND COALESCE(json_extract(profile_json,'$.editorialReview.reviewedAt'),'')<="+date,
      "  AND (json_extract(profile_json,'$.editorialReview.summary')<>"+summary,
      "       OR json_extract(profile_json,'$.editorialReview.buyerCheck')<>"+check+');'
    ].join('\n'));
  }
  return statements.join('\n')+'\n';
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invoked){
  const out=process.argv[2];
  if(!out)throw Error('output_sql_file_required');
  const cohort=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave4-decision-ready.json',import.meta.url),'utf8'));
  fs.writeFileSync(out,buildCatalogEditorialRevisionSql(cohort));
  console.log(JSON.stringify({ok:true,editorialRevisionsPrepared:cohort.map(x=>x.slug),only:'review_summary_buyer_check_reviewed_at',sqlFile:out}));
}
